// AI Proctoring - Real-time MediaPipe Logic
'use strict';

const videoElement = document.getElementById('video');
const logsContainer = document.getElementById('logs');
const warningCountEl = document.getElementById('warningCount');
const timerEl = document.getElementById('timer');

let warningCount = 0;
let lastAlertTime = 0;
const ALERT_COOLDOWN = 5000; // 5 seconds between same type alerts

// 1. Initialize Exam Timer
let timeRemaining = 60 * 60; // 60 minutes
if (timerEl) {
    setInterval(() => {
        let minutes = Math.floor(timeRemaining / 60);
        let seconds = timeRemaining % 60;
        seconds = seconds < 10 ? "0" + seconds : seconds;
        timerEl.innerText = `${minutes}:${seconds}`;
        timeRemaining--;
    }, 1000);
}

// 2. Helper to Add Logs
function addLog(message, type = 'danger') {
    if (!logsContainer) return;
    
    const div = document.createElement("div");
    div.classList.add("log");
    if (type === 'info') div.style.color = '#94a3b8';
    
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    div.innerText = `[${time}] ${message}`;
    
    logsContainer.prepend(div);
    
    // Auto-scroll to top (since we prepend)
    logsContainer.scrollTop = 0;
}

// 3. Trigger Alert & Increment Warning
function triggerAlert(message) {
    const now = Date.now();
    if (now - lastAlertTime < ALERT_COOLDOWN) return;

    warningCount++;
    if (warningCountEl) warningCountEl.innerText = warningCount;
    
    addLog(message, 'danger');
    lastAlertTime = now;
}

// 4. MediaPipe Face Mesh Logic
async function onResults(results) {
    const faces = results.multiFaceLandmarks;
    const numFaces = faces ? faces.length : 0;

    if (numFaces === 0) {
        triggerAlert("Candidate Not Visible");
    } else if (numFaces > 1) {
        triggerAlert("Multiple Faces Detected");
    } else {
        // Gaze Estimation
        const landmarks = faces[0];
        const leftEye = landmarks[33];
        const rightEye = landmarks[263];
        const nose = landmarks[1];
        
        const eyeCenter = (leftEye.x + rightEye.x) / 2;
        const gazeDiff = Math.abs(nose.x - eyeCenter);
        
        if (gazeDiff > 0.05) { // Threshold for looking away
            triggerAlert("Looking Away Detected");
        }
    }
}

// 5. Initialize Camera & AI
if (videoElement) {
    addLog("Initializing AI Proctoring Engine...", "info");

    const faceMesh = new FaceMesh({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
    });

    faceMesh.setOptions({
        maxNumFaces: 2,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    faceMesh.onResults(onResults);

    const camera = new Camera(videoElement, {
        onFrame: async () => {
            await faceMesh.send({ image: videoElement });
        },
        width: 640,
        height: 480
    });

    camera.start()
        .then(() => addLog("System Secure: Camera Stream Active", "info"))
        .catch(err => {
            console.error(err);
            addLog("Camera Error: " + err.message, "danger");
        });
}