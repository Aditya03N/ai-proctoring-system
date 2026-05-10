import mediapipe as mp
print(f"MediaPipe Version: {mp.__version__}")
try:
    from mediapipe.solutions import face_mesh
    print("Successfully imported mediapipe.solutions.face_mesh")
except ImportError as e:
    print(f"Error importing face_mesh: {e}")

import os
import mediapipe
print(f"MediaPipe path: {mediapipe.__file__}")
print(f"Contents: {os.listdir(os.path.dirname(mediapipe.__file__))}")
