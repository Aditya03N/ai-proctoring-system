import os
import warnings
import base64
import cv2
import numpy as np
import mediapipe as mp
from flask import Flask, render_template
from flask_socketio import SocketIO, emit
import logging

# Silence all warnings and info logs
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
warnings.filterwarnings("ignore")
log = logging.getLogger('werkzeug')
log.setLevel(logging.ERROR)

from mediapipe.python.solutions import face_mesh as mp_face_mesh

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app, cors_allowed_origins="*", logger=False, engineio_logger=False)

# Initialize MediaPipe Face Mesh
face_mesh = mp_face_mesh.FaceMesh(
    max_num_faces=1,
    refine_landmarks=True,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

@app.route("/")
def home():
    return render_template("index.html")

@app.route("/exam")
def exam():
    return render_template("exam.html")

@app.route("/dashboard")
def dashboard():
    return render_template("dashboard.html")

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
            emit('proctor_update', {'status': 'warning', 'message': 'Candidate Not Visible'})
            return

        landmarks = results.multi_face_landmarks[0].landmark
        
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

        # Horizontal Alerts
        if gaze_ratio < 0.75: # Looking Right
            emit('proctor_update', {'status': 'warning', 'message': 'Looking Away (Right)'})
        elif gaze_ratio > 1.35: # Looking Left
            emit('proctor_update', {'status': 'warning', 'message': 'Looking Away (Left)'})

        # Vertical Alerts
        if v_ratio > 1.25: # Looking Down
            emit('proctor_update', {'status': 'warning', 'message': 'Looking Down Detected'})

        # Mouth Alerts
        m_dist = abs(landmarks[13].y - landmarks[14].y)
        if m_dist > 0.045:
            emit('proctor_update', {'status': 'warning', 'message': 'Mouth Movement Detected'})

    except Exception as e:
        # print(f"Error: {e}")
        pass

if __name__ == "__main__":
    print("--- AI PROCTOR STARTED (Debug Mode Active) ---")
    print("Visit: http://127.0.0.1:5000")
    socketio.run(app, debug=False)
