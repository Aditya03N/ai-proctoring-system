import os
import socket
import base64
import cv2
import numpy as np
import mediapipe as mp
import time
from datetime import datetime


from flask import Flask, render_template, request, redirect, url_for, flash, session, jsonify
from flask_socketio import SocketIO, emit
import logging

# Candidate Credentials
users = {
    "AIML001": "1234",
    "AIML002": "abcd",
    "AIML003": "pass"
}

candidate_names = {
    "AIML001": "Aditya",
    "AIML002": "rushi",
    "AIML003": "Arjun"
}

admin_users = {
    "admin": "admin"
}

activity_logs = []
violation_logs = []
active_sessions_by_sid = {}
exam_status_by_student = {}

MAX_LOG_ENTRIES = 80

# os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
# warnings.filterwarnings("ignore")
# log = logging.getLogger('werkzeug')
# log.setLevel(logging.ERROR)


def add_activity_log(student_id, username, warning, entry_type='warning'):
    entry = {
        'student': student_id,
        'username': username,
        'activity': warning,
        'time': datetime.now().strftime('%I:%M:%S %p'),
        'type': entry_type
    }
    activity_logs.insert(0, entry)
    if len(activity_logs) > MAX_LOG_ENTRIES:
        del activity_logs[MAX_LOG_ENTRIES:]


def get_exam_status(student_id):
    return exam_status_by_student.setdefault(student_id, {
        'terminated': False,
        'submitted': False,
        'answers': {},
        'terminated_at': None,
        'submitted_at': None,
        'termination_type': None,
        'termination_reason': None,
        'auto_terminated': False
    })


def add_violation_log(student_id, violation_type, auto_terminated=True):
    entry = {
        'student_id': student_id,
        'violation_type': violation_type,
        'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'auto_terminated': auto_terminated
    }
    violation_logs.insert(0, entry)
    if len(violation_logs) > MAX_LOG_ENTRIES:
        del violation_logs[MAX_LOG_ENTRIES:]


def auto_submit_exam(student_id, answers=None, terminated=False):
    status = get_exam_status(student_id)
    if answers is not None:
        status['answers'] = answers
    status['submitted'] = True
    status['submitted_at'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    if terminated:
        status['terminated'] = True
        status['terminated_at'] = status['terminated_at'] or status['submitted_at']
    return status


def terminate_student_exam(student_id, termination_reason='Exam terminated by administrator', log_message=None, violation_type=None, auto_terminated=False):
    username = candidate_names.get(student_id, 'Candidate')
    already_terminated = get_exam_status(student_id).get('terminated', False)
    status = auto_submit_exam(student_id, terminated=True)

    status['termination_reason'] = termination_reason
    if violation_type:
        status['termination_type'] = violation_type
    if auto_terminated:
        status['auto_terminated'] = True

    if not already_terminated:
        add_activity_log(student_id, username, log_message or termination_reason, entry_type='terminated')

    for sid, session_info in list(active_sessions_by_sid.items()):
        if session_info.get('student') == student_id:
            active_warnings_by_sid.pop(sid, None)
            warning_detection_state_by_sid.pop(sid, None)
            socketio.emit('exam_terminated', {
                'message': termination_reason
            }, to=sid)

    return status

def create_face_detector():
    """Create a face landmark detector for either classic or Tasks MediaPipe."""
    if hasattr(mp, "solutions"):
        mp_face_mesh = mp.solutions.face_mesh
        return "solutions", mp_face_mesh.FaceMesh(
            static_image_mode=False,
            max_num_faces=2,
            refine_landmarks=False,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5
        )

    from mediapipe.tasks.python import BaseOptions
    from mediapipe.tasks.python import vision

    model_path = os.path.join(os.path.dirname(__file__), "face_landmarker.task")
    options = vision.FaceLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=model_path),
        running_mode=vision.RunningMode.IMAGE,
        num_faces=2,
        min_face_detection_confidence=0.5,
        min_face_presence_confidence=0.5,
        min_tracking_confidence=0.5
    )
    return "tasks", vision.FaceLandmarker.create_from_options(options)


face_detector_mode, face_detector = create_face_detector()


def detect_face_landmarks(rgb_frame):
    if face_detector_mode == "solutions":
        results = face_detector.process(rgb_frame)
        if not results.multi_face_landmarks:
            return None, 0
        return results.multi_face_landmarks[0].landmark, len(results.multi_face_landmarks)

    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
    results = face_detector.detect(mp_image)
    if not results.face_landmarks:
        return None, 0
    return results.face_landmarks[0], len(results.face_landmarks)

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading", logger=False, engineio_logger=False)
active_warnings_by_sid = {}
warning_detection_state_by_sid = {}

# Simple detection thresholds (reverting to working system)
FACE_NOT_VISIBLE_THRESHOLD = 5  # Quick detection
LOOKING_AWAY_THRESHOLD = 8      # Faster response
MOUTH_MOVEMENT_THRESHOLD = 5    # Quick detection
WARNING_CONFIRMATION_SECONDS = 1.1
DELAYED_HEAD_WARNINGS = {'Looking Left', 'Looking Right', 'Looking Down'}

def store_warning(message):
    """Store warning in session with timestamp"""
    if 'exam_warnings' not in session:
        session['exam_warnings'] = []
    
    warning_entry = {
        'message': message,
        'timestamp': datetime.now().strftime('%H:%M:%S'),
        'date': datetime.now().strftime('%Y-%m-%d')
    }
    
    session['exam_warnings'].append(warning_entry)
    session.modified = True


def emit_warning_state(active_warnings):
    previous_warnings = active_warnings_by_sid.get(request.sid, set())
    current_warnings = set(active_warnings)

    student_id = session.get('candidate_id', 'AIML000')
    username = session.get('candidate_name', candidate_names.get(student_id, 'Candidate'))

    if request.sid not in active_sessions_by_sid:
        add_activity_log(student_id, username, 'Exam session started', entry_type='info')

    active_sessions_by_sid[request.sid] = {
        'student': student_id,
        'username': username,
        'connected_at': datetime.now().strftime('%H:%M:%S')
    }

    for warning in current_warnings - previous_warnings:
        store_warning(warning)
        add_activity_log(student_id, username, warning, entry_type='warning')

    active_warnings_by_sid[request.sid] = current_warnings
    emit('proctor_update', {
        'status': 'warning' if active_warnings else 'normal',
        'warnings': active_warnings
    })


def get_confirmed_warnings(detected_warnings):
    now = time.monotonic()
    sid = request.sid
    detection_state = warning_detection_state_by_sid.setdefault(sid, {})
    detected_head_warning_set = {
        warning for warning in detected_warnings
        if warning in DELAYED_HEAD_WARNINGS
    }

    for warning in list(detection_state):
        if warning not in detected_head_warning_set:
            detection_state.pop(warning, None)

    confirmed_warnings = []
    for warning in detected_warnings:
        if warning not in DELAYED_HEAD_WARNINGS:
            confirmed_warnings.append(warning)
            continue

        started_at = detection_state.setdefault(warning, now)
        if now - started_at >= WARNING_CONFIRMATION_SECONDS:
            confirmed_warnings.append(warning)

    if not detection_state:
        warning_detection_state_by_sid.pop(sid, None)

    return confirmed_warnings

@app.route('/get_logs')
def get_logs():
    active_students = len({session_info['student'] for session_info in active_sessions_by_sid.values()})
    warnings_only = [entry for entry in activity_logs if entry.get('type') == 'warning']
    active_student_ids = {session_info['student'] for session_info in active_sessions_by_sid.values()}
    return jsonify({
        'logs': activity_logs,
        'active_students': active_students,
        'total_warnings': len(warnings_only),
        'active_student_ids': list(active_student_ids),
        'exam_statuses': exam_status_by_student
    })

def find_available_port(start_port=5000, max_attempts=20):
    """Return the first localhost port available from start_port upward."""
    for port in range(start_port, start_port + max_attempts):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as test_socket:
            try:
                test_socket.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue

    raise OSError(f"No available port found from {start_port} to {start_port + max_attempts - 1}")

@app.route("/")
def home():
    return redirect(url_for('login'))

@app.route("/login", methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        candidate_id = request.form.get('candidate_id')
        password = request.form.get('password')
        
        if candidate_id in users and users[candidate_id] == password:
            session['candidate_id'] = candidate_id
            session['candidate_name'] = candidate_names.get(candidate_id, "Candidate")
            return redirect(url_for('dashboard'))
        else:
            return render_template("login.html", error="Invalid Candidate ID or Password")
            
    return render_template("login.html")

@app.route("/admin", methods=['GET', 'POST'])
def admin():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')

        if username in admin_users and admin_users[username] == password:
            session['admin_logged_in'] = True
            return redirect(url_for('admin_dashboard'))

        return render_template("admin.html", error="Invalid admin credentials")

    if session.get('admin_logged_in'):
        return redirect(url_for('admin_dashboard'))

    return render_template("admin.html")

@app.route("/admin/dashboard")
def admin_dashboard():
    if not session.get('admin_logged_in'):
        return redirect(url_for('admin'))
    return render_template("admin_dashboard.html")

@app.route("/admin/logout")
def admin_logout():
    session.pop('admin_logged_in', None)
    return redirect(url_for('admin'))

@app.route("/admin/terminate_exam/<student_id>", methods=['POST'])
def terminate_exam(student_id):
    if not session.get('admin_logged_in'):
        return jsonify({'success': False, 'message': 'Admin login required'}), 403

    if student_id not in users:
        return jsonify({'success': False, 'message': 'Student not found'}), 404

    status = terminate_student_exam(student_id)
    return jsonify({
        'success': True,
        'student_id': student_id,
        'status': status
    })

@app.route('/exam/tab_violation', methods=['POST'])
def exam_tab_violation():
    student_id = session.get('candidate_id')
    if not student_id:
        return jsonify({'success': False, 'message': 'Candidate login required'}), 403

    if get_exam_status(student_id).get('terminated'):
        return jsonify({'success': False, 'message': 'Exam already terminated'}), 400

    data = request.get_json(silent=True) or {}
    violation_type = data.get('violation_type', 'TAB_SWITCH_TERMINATION')
    reason_text = 'Your exam has been automatically terminated due to tab switching violation.'
    status = terminate_student_exam(
        student_id,
        termination_reason=reason_text,
        log_message='Student Auto-Terminated — Tab Switching Detected',
        violation_type=violation_type,
        auto_terminated=True
    )

    add_violation_log(student_id, violation_type, auto_terminated=True)
    username = session.get('candidate_name', candidate_names.get(student_id, 'Candidate'))
    socketio.emit('student_auto_terminated', {
        'student_id': student_id,
        'student_name': username,
        'reason': 'Tab Switching Detected',
        'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'exam_status': 'terminated'
    }, broadcast=True)

    return jsonify({'success': True, 'message': reason_text, 'status': status})

@app.route("/exam")
def exam():
    student_id = session.get('candidate_id')
    if not student_id:
        return redirect(url_for('login'))

    if get_exam_status(student_id).get('terminated'):
        return redirect(url_for('exam_completed'))

    # Clear previous exam warnings when starting new exam
    if 'exam_warnings' in session:
        session.pop('exam_warnings')

    return render_template("exam.html", candidate_id=session.get('candidate_id', 'AIML000'), candidate_name=session.get('candidate_name', 'Candidate'))

@app.route("/exam/auto_submit", methods=['POST'])
def exam_auto_submit():
    student_id = session.get('candidate_id')
    if not student_id:
        return jsonify({'success': False, 'message': 'Candidate login required'}), 403

    data = request.get_json(silent=True) or {}
    answers = data.get('answers', {})
    terminated = get_exam_status(student_id).get('terminated', False)
    auto_submit_exam(student_id, answers=answers, terminated=terminated)
    return jsonify({'success': True, 'terminated': terminated})

@app.route("/exam/completed")
def exam_completed():
    student_id = session.get('candidate_id')
    status = get_exam_status(student_id) if student_id else {}
    message = None
    if status.get('terminated'):
        message = status.get('termination_reason') or 'Your exam has been terminated by the administrator due to suspicious activity.'
    return render_template("exam_completed.html", message=message, status=status)

@app.route("/dashboard")
def dashboard():
    return render_template("dashboard.html")


@socketio.on('process_frame')
def handle_frame(data):
    try:
        # Keep the active session updated for the connected candidate
        student_id = session.get('candidate_id', 'AIML000')
        username = session.get('candidate_name', candidate_names.get(student_id, 'Candidate'))
        if get_exam_status(student_id).get('terminated'):
            active_warnings_by_sid.pop(request.sid, None)
            warning_detection_state_by_sid.pop(request.sid, None)
            emit('exam_terminated', {
                'message': 'Your exam has been terminated by the administrator due to suspicious activity.'
            })
            return

        active_sessions_by_sid[request.sid] = {
            'student': student_id,
            'username': username,
            'connected_at': datetime.now().strftime('%H:%M:%S')
        }

        # Decode Base64 Image
        image_data = data['image'].split(",")[1]
        img_bytes = base64.b64decode(image_data)
        nparr = np.frombuffer(img_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if frame is None:
            return

        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        landmarks, face_count = detect_face_landmarks(rgb_frame)

        if not landmarks:
            get_confirmed_warnings([])
            emit_warning_state(['Face Not Visible'])
            return

        active_warnings = []
        if face_count > 1:
            active_warnings.append('Multiple Faces Detected')

        # --- GAZE LOGIC ---
        nose = landmarks[1]
        left_eye = landmarks[33]
        right_eye = landmarks[263]

        dist_left = abs(nose.x - left_eye.x)
        dist_right = abs(nose.x - right_eye.x)
        gaze_ratio = dist_left / (dist_right + 1e-6)

        # Vertical Check
        dist_up = abs(nose.y - landmarks[10].y)
        dist_down = abs(nose.y - landmarks[152].y)
        v_ratio = dist_up / (dist_down + 1e-6)

        # DEBUG PRINTS FOR TUNING
        print(f"Gaze: {gaze_ratio:.2f} | Vertical: {v_ratio:.2f} | Mouth: {abs(landmarks[13].y - landmarks[14].y):.3f}")

        # Simple detection (reverting to working system)
        if gaze_ratio < 0.7: # Looking Right
            active_warnings.append('Looking Right')
        elif gaze_ratio > 1.2: # Looking Left
            active_warnings.append('Looking Left')

        if v_ratio > 1.3: # Looking Down
            active_warnings.append('Looking Down')

        # Mouth Alerts
        m_dist = abs(landmarks[13].y - landmarks[14].y)
        if m_dist > 0.02: # Mouth Movement
            active_warnings.append('Suspicious Mouth Movement')

        emit_warning_state(get_confirmed_warnings(active_warnings))

    except Exception as e:
        print(f"Socket Error: {e}")

@socketio.on('disconnect')
def handle_disconnect():
    active_warnings_by_sid.pop(request.sid, None)
    warning_detection_state_by_sid.pop(request.sid, None)
    active_sessions_by_sid.pop(request.sid, None)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    available_port = find_available_port(port)

    print("--- AI PROCTOR STARTED (Debug Mode Active) ---")
    if available_port != port:
        print(f"Port {port} is already in use; using port {available_port} instead.")
    print(f"Visit: http://127.0.0.1:{available_port}")
    socketio.run(app, host="127.0.0.1", port=available_port, debug=False, allow_unsafe_werkzeug=True)
