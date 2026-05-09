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

        h, w, _ = frame.shape
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = face_mesh.process(rgb_frame)

        if not results.multi_face_landmarks:
            emit('proctor_update', {'status': 'warning', 'message': 'Candidate Not Visible'})
            return

        # We found a face!
        landmarks = results.multi_face_landmarks[0].landmark
        
        # --- GAZE / HEAD POSE LOGIC ---
        # 1. Horizontal Gaze (Looking Left/Right)
        # Compare nose (1) relative to the outer corners of eyes (33, 263)
        nose = landmarks[1]
        left_eye_outer = landmarks[33]
        right_eye_outer = landmarks[263]
        
        # Calculate ratio of distance
        dist_left = abs(nose.x - left_eye_outer.x)
        dist_right = abs(nose.x - right_eye_outer.x)
        gaze_ratio = dist_left / (dist_right + 1e-6) # Avoid zero division

        # Sensitve Thresholds: 
        # < 0.6 means looking far right, > 1.7 means looking far left
        if gaze_ratio < 0.55:
            emit('proctor_update', {'status': 'warning', 'message': 'Looking Away (Right)'})
        elif gaze_ratio > 1.85:
            emit('proctor_update', {'status': 'warning', 'message': 'Looking Away (Left)'})

        # 2. Vertical Gaze (Looking Up/Down)
        # Compare nose (1) relative to chin (152) and forehead (10)
        forehead = landmarks[10]
        chin = landmarks[152]
        dist_up = abs(nose.y - forehead.y)
        dist_down = abs(nose.y - chin.y)
        vertical_ratio = dist_up / (dist_down + 1e-6)

        # > 1.2 means head tilted down, < 0.4 means head tilted up
        if vertical_ratio > 1.3:
            emit('proctor_update', {'status': 'warning', 'message': 'Looking Down Detected'})

        # 3. Mouth Opening (Talking)
        upper_lip = landmarks[13]
        lower_lip = landmarks[14]
        mouth_dist = abs(upper_lip.y - lower_lip.y)
        if mouth_dist > 0.045: # Slightly more sensitive
            emit('proctor_update', {'status': 'warning', 'message': 'Mouth Movement Detected'})

    except Exception as e:
        # print(f"Error: {e}")
        pass

if __name__ == "__main__":
    print("--- AI Proctoring Server Started (V2 - Sensitive Mode) ---")
    print("Visit: http://127.0.0.1:5000")
    socketio.run(app, debug=False)
