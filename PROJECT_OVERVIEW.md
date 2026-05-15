# AI-Based Online Exam Proctoring System - Complete Overview

## 📋 Project Summary
**Project Name:** VIGILANCE AI - AI-Based Online Exam Proctoring System

A real-time online examination monitoring platform that uses AI-powered facial recognition and behavior analysis to detect suspicious activities during exams.

---

## 🎯 What Does This Project Do?

### Core Functionality:
1. **Real-Time Exam Monitoring** - Monitors candidates during online exams using webcam feeds
2. **AI Facial Landmark Detection** - Analyzes face movements and positions using MediaPipe
3. **Suspicious Activity Detection** - Identifies and flags:
   - Face not visible (exam paused)
   - Looking left/right/down (potential cheating)
   - Suspicious mouth movement (potential communication/cheating)
4. **Live Admin Dashboard** - Administrators can view all active exams, warnings, and terminate exams
5. **Activity Logging** - Maintains complete audit trail of all suspicious activities
6. **Session Management** - Tracks exam status, warnings, and submissions

### User Roles:
- **Candidates**: Take exams with real-time proctoring
- **Administrators**: Monitor all candidates, review warnings, and take action

---

## 🛠️ Technology Stack & Tools Used

### Backend Framework
- **Flask** - Python web framework for routing and server logic
- **Flask-SocketIO** - Real-time bidirectional communication between client and server
- **Eventlet** - WSGI server for async operations

### AI/Computer Vision Libraries
- **MediaPipe** - Google's framework for face landmark detection
  - FaceMesh: Detects 468 facial landmarks in real-time
  - Face Landmarker Task: Advanced facial analysis model
- **OpenCV (cv2)** - Image processing (frame decoding, color conversion)
- **NumPy** - Array operations for landmark analysis

### Frontend Technologies
- **HTML5** - Structure for exam interface
- **CSS3** - Glass-morphism design, responsive layouts
- **JavaScript (Vanilla)** - Canvas API for video frame capture
- **Socket.IO Client** - Real-time updates from server

### Additional Tools
- **Base64 Encoding** - Efficient frame transmission over WebSocket
- **Session Management** - Flask sessions for state tracking

---

## 📁 Project Structure

```
ai-proctoring-system/
├── app.py                          # Main Flask application + WebSocket logic
├── face_landmarker.task            # MediaPipe facial landmark model
├── requirements.txt                # Python dependencies
├── run.bat                         # Windows startup script
├── README.md                       # Project documentation
│
├── static/
│   ├── css/
│   │   ├── main.css               # Exam interface styling (glass-morphism UI)
│   │   └── style.css              # Additional styles
│   └── js/
│       ├── main.js                # Real-time frame capture & WebSocket logic
│       ├── admin-dashboard.js     # Admin monitoring interface
│       └── script.js              # Additional utilities
│
├── templates/
│   ├── index.html                 # Home/landing page
│   ├── login.html                 # Candidate login
│   ├── dashboard.html             # Candidate pre-exam dashboard
│   ├── exam.html                  # Main exam interface with monitoring
│   ├── exam_completed.html        # Post-exam completion page
│   ├── admin.html                 # Admin login
│   └── admin_dashboard.html       # Admin monitoring dashboard
│
└── scratch/
    ├── test_mp.py                 # MediaPipe testing/debugging
    └── check_mp.py                # MediaPipe configuration check
```

---

## 🔄 How It Works: From Scratch to Production

### Phase 1: Initialization & Setup

**1. Application Startup (`app.py`)**
```
- Flask app initialized with SECRET_KEY for sessions
- SocketIO enabled for real-time communication
- Face detector (MediaPipe) created and loaded
- Candidate credentials defined in-memory
- Activity logs initialized (max 80 entries)
```

**2. User Credentials**
```
Candidates:
- AIML001 (Aditya) / password: 1234
- AIML002 (Rushi) / password: abcd
- AIML003 (Arjun) / password: pass

Admin:
- username: admin / password: admin
```

---

### Phase 2: User Authentication

**Candidate Login Flow:**
1. User visits `/login` page
2. Enters Candidate ID + Password
3. Flask validates credentials against `users` dict
4. Session created with `candidate_id` and `candidate_name`
5. Redirected to `/dashboard`

**Admin Login Flow:**
1. Admin visits `/admin` page
2. Enters username/password
3. Session flag `admin_logged_in` set to True
4. Redirected to `/admin/dashboard`

---

### Phase 3: Exam Session

**Candidate Exam Start:**
```
1. Candidate navigates to /exam route
2. HTML/CSS loaded (exam interface with webcam feed)
3. JavaScript initializes video stream using MediaAPI
4. Canvas captures video frames every ~50-100ms
5. Frames encoded as Base64 JPEG and sent via WebSocket
```

**Real-Time Monitoring (WebSocket: `process_frame`):**
```
Browser (JavaScript)              Server (Python)              Admin
    │                                  │                         │
    ├──➜ Base64 Frame ──────────────➜ @socketio.on('process_frame')
    │                                  │
    │                     ┌────── Decode Base64
    │                     ├────── Convert BGR→RGB
    │                     ├────── MediaPipe detects landmarks
    │                     ├────── Analyze 468 facial points
    │                     │
    │                     ├─── Check Gaze Ratio (left/right looking)
    │                     ├─── Check Vertical Ratio (looking down)
    │                     ├─── Check Mouth Distance (movement)
    │                     │
    │                     ├─── Generate warnings if thresholds exceeded
    │                     ├─── Store in activity_logs
    │                     │
    │  ◀────── proctor_update ◀─┐ emit('proctor_update', {...})
    │  (update UI)              │
    │                           └─ Broadcast to admin dashboard
```

---

### Phase 4: Facial Analysis & Detection

**MediaPipe Landmarks Used:**
- **Landmark 1**: Nose (center reference point)
- **Landmark 10**: Forehead (vertical reference)
- **Landmark 33**: Left eye outer corner
- **Landmark 152**: Chin (vertical reference)
- **Landmark 263**: Right eye outer corner
- **Landmarks 13-14**: Mouth corners (for mouth movement)

**Detection Thresholds:**
```
GAZE DETECTION:
- gaze_ratio < 0.7  ──→ Looking Right
- gaze_ratio > 1.2  ──→ Looking Left
- v_ratio > 1.3     ──→ Looking Down

MOUTH DETECTION:
- mouth_distance > 0.02 ──→ Suspicious Mouth Movement

FACE DETECTION:
- No landmarks detected ──→ Face Not Visible

CONFIRMATION:
- Head warnings (Looking Left/Right/Down) require 1.1 seconds of sustained detection
- Other warnings trigger immediately
```

---

### Phase 5: Warning System

**Warning States:**
```javascript
MESSAGE_TYPES = {
    'Looking Left'              → Eye (warning)
    'Looking Right'             → Eye (warning)
    'Looking Down'              → Head (warning)
    'Suspicious Mouth Movement' → Mouth (warning)
    'Face Not Visible'          → All boxes (critical)
}
```

**What Happens When Warning Detected:**
1. Warning stored in session (`exam_warnings` list)
2. Entry added to `activity_logs` with timestamp
3. Emitted to admin dashboard in real-time
4. Warning chip displayed in exam UI
5. Corresponding warning box changes color (yellow → red)

**Admin Actions:**
- View all warnings across all candidates
- See which candidate is still taking exam
- **Terminate Exam** button: Stops exam, auto-submits, locks candidate out

---

### Phase 6: Exam Submission & Completion

**Normal Submission:**
1. Candidate clicks "Submit Examination" button
2. Collects all radio button selections
3. Sends to `/exam/auto_submit` via POST
4. Exam status marked as `submitted`
5. Redirected to `/exam/completed` page

**Admin Termination:**
1. Admin clicks "Terminate Exam" for a candidate
2. Server sets `terminated = True` in exam status
3. Activity logged: "Exam terminated by administrator"
4. Candidate's exam auto-submitted
5. Candidate receives termination message
6. All monitoring data cleaned from session

**Exam Completion Page:**
- Shows if exam was terminated or submitted normally
- Displays completion timestamp

---

### Phase 7: Data Storage & Admin View

**Activity Logs Structure:**
```python
{
    'student': 'AIML001',
    'username': 'Aditya',
    'activity': 'Looking Right',
    'time': '03:45:30 PM',
    'type': 'warning'  # or 'info', 'terminated'
}
```

**Admin Dashboard Updates:**
- Fetches `/get_logs` endpoint every few seconds
- Shows:
  - Total active candidates
  - Total warnings issued
  - Log table with all activities
  - Individual terminate buttons per student
  - Exam status (submitted/terminated)

---

## 🚀 Deployment Architecture

```
                    ┌─────────────────┐
                    │   Candidate PC  │
                    │  (Exam Session) │
                    └────────┬────────┘
                             │
                        WebSocket
                    (Socket.IO via HTTP)
                             │
                    ┌────────▼────────┐
                    │   Flask Server  │
                    │ 127.0.0.1:5000  │
                    │                 │
                    │ ├─ Routes       │
                    │ ├─ WebSocket    │
                    │ ├─ MediaPipe    │
                    │ └─ Sessions     │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  Admin Client   │
                    │ (Dashboard)     │
                    └─────────────────┘
```

**Server Port Discovery:**
- Tries to start on port 5000
- If occupied, finds next available port
- Notifies user of actual port on startup

---

## 📊 Data Flow Summary

### Exam Flow:
1. **Login** → Session created
2. **Dashboard** → Pre-exam screen
3. **Exam Start** → Webcam initialized
4. **Frame Capture** → Every ~100ms
5. **Analysis** → MediaPipe processing
6. **Decision** → Warning or Normal
7. **Logging** → Activity recorded
8. **Broadcast** → Admin sees update
9. **UI Update** → Warning boxes change
10. **Submission** → Exam ends

### Admin Flow:
1. **Admin Login** → Session verified
2. **Dashboard Load** → Display interface
3. **Poll Logs** → Fetch every 2-3 seconds
4. **Action** → Can terminate any exam
5. **Real-time Updates** → See candidate actions live

---

## 🔐 Security Features

1. **Session-Based Auth** - Secure login per candidate
2. **Admin-Only Termination** - Only admin can stop exams
3. **Real-Time Audit Trail** - Complete logging of activities
4. **WebSocket CORS** - Allowed origins control
5. **Frame Compression** - Base64 JPEG reduces bandwidth

---

## 📈 Performance Considerations

- **Frame Rate**: ~10 FPS (100ms intervals)
- **JPEG Compression**: 0.5 quality (50% reduction)
- **Canvas Downsampling**: 320x240 resolution
- **Log Limit**: Max 80 entries in memory
- **Landmark Detection**: ~15-30ms per frame (MediaPipe optimized)

---

## 🔧 Running the Project

**1. Install Dependencies:**
```bash
pip install -r requirements.txt
```

**2. Start Server:**
```bash
python app.py
# or
run.bat
```

**3. Access Application:**
- **Candidate**: `http://127.0.0.1:5000/login`
- **Admin**: `http://127.0.0.1:5000/admin`

---

## 🎨 Frontend Components

### Exam Interface:
- **Left Panel**: Question card with multiple-choice format
- **Right Panel**: Live monitoring section with:
  - Timer display (60:00 format, counts down)
  - Live webcam feed with status indicator
  - Three warning boxes (Eyes/Head/Mouth)
  - Live warning chips appearing above camera

### Admin Dashboard:
- Active student count
- Total warnings count
- Activity log table with:
  - Roll number (Student ID)
  - Username
  - Activity description
  - Timestamp
  - Action buttons (Terminate/Status badge)

---

## 📝 Key Algorithms

### Gaze Direction Detection:
```
gaze_ratio = distance(nose.x - left_eye.x) / distance(nose.x - right_eye.x)

if gaze_ratio < 0.7:  Looking RIGHT (too far right)
if gaze_ratio > 1.2:  Looking LEFT (too far left)
```

### Vertical Head Position:
```
v_ratio = distance(nose.y - forehead.y) / distance(nose.y - chin.y)

if v_ratio > 1.3:  Looking DOWN (chin closer to nose than forehead)
```

### Mouth Movement:
```
mouth_distance = |upper_lip.y - lower_lip.y|

if mouth_distance > 0.02:  Suspicious mouth movement detected
```

---

## ✅ Features Implemented

- [x] Real-time facial landmark detection
- [x] Gaze direction analysis
- [x] Head position tracking
- [x] Mouth movement detection
- [x] Activity logging with timestamps
- [x] Admin dashboard with live updates
- [x] Exam termination capability
- [x] WebSocket real-time communication
- [x] Session management
- [x] Multi-candidate support
- [x] Glass-morphism UI design
- [x] Responsive layout

---

## 🐛 Debug Features

- Print statements in `handle_frame()` for tuning detection thresholds
- `DEBUG PRINTS FOR TUNING` shows real-time gaze, vertical, and mouth ratios
- Can adjust thresholds in `app.py` easily

---

## 🚀 Future Enhancements

1. Eye contact duration tracking
2. Multiple face detection (group proctoring)
3. Sound/speech analysis for suspicious audio
4. Device screen share detection
5. Browser tab switch detection
6. Database persistence (instead of in-memory)
7. Email notifications to admin
8. PDF exam report generation
9. Video recording playback
10. Mobile app support

---

*Created: AI Proctoring System - VIGILANCE AI*
