// AI Proctoring - Professional Exam UI Logic
'use strict';

const videoElement = document.getElementById('video');
const alertsStream = document.getElementById('ai-alerts');
const statusTxt = document.getElementById('statusTxt');
const timerEl = document.getElementById('timer');

// Socket.IO Initialization
const socket = io();

let lastAlertTime = 0;
const ALERT_COOLDOWN = 3000; 

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

// 2. Helper to Add Alerts to Stream
function addAlert(message, type = 'warning') {
    if (!alertsStream) return;
    
    // Remove the "System initialized" placeholder
    const info = alertsStream.querySelector('.alert-info');
    if (info) info.remove();

    const div = document.createElement("div");
    div.classList.add("alert-item");
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    div.innerText = `[${time}] ${message}`;
    
    alertsStream.prepend(div);
    
    // Visual Feedback
    if (type === 'warning') {
        const wrapper = document.querySelector('.webcam-wrapper');
        wrapper.style.borderColor = '#ef4444';
        statusTxt.innerText = "WARNING";
        statusTxt.className = "red";
        
        setTimeout(() => {
            wrapper.style.borderColor = 'transparent';
            statusTxt.innerText = "SECURE";
            statusTxt.className = "green";
        }, 2000);
    }
}

// 3. Listen for AI results
socket.on('proctor_update', (data) => {
    console.log("AI Server Update:", data);
    if (data.status === 'warning') {
        const now = Date.now();
        if (now - lastAlertTime > ALERT_COOLDOWN) {
            addAlert(data.message, 'warning');
            lastAlertTime = now;
        }
    }
});

// 4. Capture & Send Frames
const canvas = document.createElement('canvas');
const context = canvas.getContext('2d');

function sendFrame() {
    if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
        canvas.width = 320; 
        canvas.height = 240;
        context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        const frameData = canvas.toDataURL('image/jpeg', 0.5);
        socket.emit('process_frame', { image: frameData });
    }
}

// 5. Initialize Camera
if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ video: true })
        .then((stream) => {
            videoElement.srcObject = stream;
            setInterval(sendFrame, 500);
        })
        .catch((err) => {
            addAlert("Camera Error: " + err.message, 'error');
        });
}

socket.on('connect', () => {
    console.log("Connected to AI Server");
});

// Submit Button Action
document.getElementById('submitBtn')?.addEventListener('click', () => {
    alert("Exam Submitted Successfully! Please wait for results.");
    window.location.href = "/dashboard";
});