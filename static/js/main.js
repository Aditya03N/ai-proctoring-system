// AI Proctoring - Server-Side Capture Logic
'use strict';

const videoElement = document.getElementById('video');
const logsContainer = document.getElementById('logs');
const warningCountEl = document.getElementById('warningCount');
const timerEl = document.getElementById('timer');

// Socket.IO Initialization
// This will connect to your Flask server
const socket = io();

let warningCount = 0;
let lastAlertTime = 0;
const ALERT_COOLDOWN = 5000; 

// 1. Initialize Exam Timer
let timeRemaining = 60 * 60; 
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
    logsContainer.scrollTop = 0;
}

// 3. Listen for AI results from the Python Server
socket.on('proctor_update', (data) => {
    // Data will look like: { "status": "warning", "message": "Multiple Faces Detected" }
    if (data.status === 'warning') {
        const now = Date.now();
        if (now - lastAlertTime > ALERT_COOLDOWN) {
            warningCount++;
            if (warningCountEl) warningCountEl.innerText = warningCount;
            addLog(data.message, 'danger');
            lastAlertTime = now;
        }
    } else if (data.status === 'info') {
        addLog(data.message, 'info');
    }
});

// 4. Capture & Send Frames to Python
const canvas = document.createElement('canvas');
const context = canvas.getContext('2d');

function sendFrame() {
    if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
        // Set canvas size to video size
        canvas.width = 320; // Lower resolution for faster transmission
        canvas.height = 240;
        
        // Draw current video frame to canvas
        context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        
        // Convert to Base64 JPEG (lower quality = faster)
        const frameData = canvas.toDataURL('image/jpeg', 0.5);
        
        // Send to Python server
        socket.emit('process_frame', { image: frameData });
    }
}

// 5. Initialize Camera
if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ video: true })
        .then((stream) => {
            videoElement.srcObject = stream;
            addLog("Camera Active: Sending data to AI Engine...", "info");
            
            // Start sending frames every 500ms (2 frames per second)
            setInterval(sendFrame, 500);
        })
        .catch((err) => {
            console.error(err);
            addLog("Camera Error: " + err.message, "danger");
        });
}

socket.on('connect', () => {
    addLog("Connected to AI Server", "info");
});

socket.on('disconnect', () => {
    addLog("Disconnected from AI Server", "danger");
});