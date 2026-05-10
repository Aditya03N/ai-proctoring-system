import mediapipe as mp
import cv2
import numpy as np

try:
    print("Initializing Face Mesh...")
    mp_face_mesh = mp.solutions.face_mesh
    face_mesh = mp_face_mesh.FaceMesh(
        max_num_faces=1,
        refine_landmarks=True,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5
    )
    print("Face Mesh initialized successfully.")
except Exception as e:
    print(f"Error initializing Face Mesh: {e}")
