import eventlet
eventlet.monkey_patch()

import os
import socket
import warnings
import base64
import cv2
import numpy as np
import mediapipe as mp
from datetime import datetime


from flask import Flask, render_template, request, redirect, url_for, flash, session
from flask_socketio import SocketIO, emit
import logging

# Candidate Credentials
users = {
    "AIML001": "1234",
    "AIML002": "abcd",
    "AIML003": "pass"
}

# os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
# warnings.filterwarnings("ignore")
# log = logging.getLogger('werkzeug')
# log.setLevel(logging.ERROR)

# from mediapipe.python.solutions import face_mesh as mp_face_mesh
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    static_image_mode=False,
    max_num_faces=1,
    refine_landmarks=False,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app, cors_allowed_origins="*", logger=False, engineio_logger=False)
active_warnings_by_sid = {}

# Simple detection thresholds (reverting to working system)
FACE_NOT_VISIBLE_THRESHOLD = 5  # Quick detection
LOOKING_AWAY_THRESHOLD = 8      # Faster response
MOUTH_MOVEMENT_THRESHOLD = 5    # Quick detection

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

    for warning in current_warnings - previous_warnings:
        store_warning(warning)

    active_warnings_by_sid[request.sid] = current_warnings
    emit('proctor_update', {
        'status': 'warning' if active_warnings else 'normal',
        'warnings': active_warnings
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
            return redirect(url_for('dashboard'))
        else:
            return render_template("login.html", error="Invalid Candidate ID or Password")
            
    return render_template("login.html")

@app.route("/exam")
def exam():
    # Clear previous exam warnings when starting new exam
    if 'exam_warnings' in session:
        session.pop('exam_warnings')
    return render_template("exam.html")

@app.route("/dashboard")
def dashboard():
    return render_template("dashboard.html")

@app.route("/admin")
def admin():
    return render_template("admin.html")


@socketio.on('process_frame')
def handle_frame(data):
    try:
        # Decode Base64 Image
        image_data = data['image'].split(",")[1]
        img_bytes = base64.b64decode(image_data)
        nparr = np.frombuffer(img_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if frame is None:
            return

        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = face_mesh.process(rgb_frame)

        if not results.multi_face_landmarks:
            emit_warning_state(['Face Not Visible'])
            return

        landmarks = results.multi_face_landmarks[0].landmark
        active_warnings = []

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
        elif gaze_ratio > 1.4: # Looking Left
            active_warnings.append('Looking Left')

        if v_ratio > 1.3: # Looking Down
            active_warnings.append('Looking Down')

        # Mouth Alerts
        m_dist = abs(landmarks[13].y - landmarks[14].y)
        if m_dist > 0.06: # Mouth Movement
            active_warnings.append('Suspicious Mouth Movement')

        emit_warning_state(active_warnings)

    except Exception as e:
        print(f"Socket Error: {e}")

@socketio.on('disconnect')
def handle_disconnect():
    active_warnings_by_sid.pop(request.sid, None)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    available_port = find_available_port(port)

    print("--- AI PROCTOR STARTED (Debug Mode Active) ---")
    if available_port != port:
        print(f"Port {port} is already in use; using port {available_port} instead.")
    print(f"Visit: http://127.0.0.1:{available_port}")
    socketio.run(app, host="127.0.0.1", port=available_port, debug=False)
