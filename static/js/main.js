// AI Proctoring - Professional Exam UI Logic
'use strict';

const videoElement = document.getElementById('video');
const videoWrapper = document.getElementById('videoWrapper');
const alertsStream = document.getElementById('ai-alerts');
const overallStatus = document.getElementById('overallStatus');
const timerEl = document.getElementById('timer');
const warningCounterEl = document.getElementById('warningCounter');

// Metrics elements
const metricFace = document.getElementById('metricFace');
const metricEye = document.getElementById('metricEye');
const metricMouth = document.getElementById('metricMouth');

// Set Initial Time for Log
const initTimeEl = document.getElementById('initTime');
if(initTimeEl) {
    initTimeEl.innerText = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// Socket.IO Initialization
const socket = io();

let lastAlertTime = 0;
const ALERT_COOLDOWN = 3000; 
let warningsCount = 0;

// 1. Initialize Exam Timer
let timeRemaining = 60 * 60; 
if (timerEl) {
    setInterval(() => {
        let minutes = Math.floor(timeRemaining / 60);
        let seconds = timeRemaining % 60;
        seconds = seconds < 10 ? "0" + seconds : seconds;
        timerEl.innerText = `${minutes}:${seconds}`;
        timeRemaining--;
        if(timeRemaining < 0) timeRemaining = 0;
    }, 1000);
}

// 2. Helper to Add Alerts to Stream
function addAlert(message, type = 'warning') {
    if (!alertsStream) return;

    warningsCount++;
    if(warningCounterEl) warningCounterEl.innerText = warningsCount;

    const div = document.createElement("div");
    div.classList.add("alert-item");
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    div.innerHTML = `<span><i class="fas fa-exclamation-triangle"></i> ${message}</span><span class="time">${time}</span>`;
    
    alertsStream.prepend(div);
    
    // Visual Feedback
    if (type === 'warning') {
        videoWrapper.className = 'video-wrapper warning';
        overallStatus.innerHTML = '<i class="fas fa-circle"></i> WARNING';
        overallStatus.style.color = 'var(--warning)';
        
        updateMetrics(message);

        setTimeout(() => {
            videoWrapper.className = 'video-wrapper';
            overallStatus.innerHTML = '<i class="fas fa-circle"></i> SECURE';
            overallStatus.style.color = 'var(--success)';
            resetMetrics();
        }, 2500);
    }
}

function updateMetrics(msg) {
    const msgLower = msg.toLowerCase();
    if(msgLower.includes("visible") || msgLower.includes("face")) {
        metricFace.classList.add('alert');
        metricFace.querySelector('strong').innerText = 'Lost';
    } else if (msgLower.includes("looking")) {
        metricEye.classList.add('alert');
        metricEye.querySelector('strong').innerText = 'Deviated';
    } else if (msgLower.includes("mouth")) {
        metricMouth.classList.add('alert');
        metricMouth.querySelector('strong').innerText = 'Moving';
    }
}

function resetMetrics() {
    metricFace.classList.remove('alert');
    metricFace.querySelector('strong').innerText = 'Locked';
    
    metricEye.classList.remove('alert');
    metricEye.querySelector('strong').innerText = 'Centered';
    
    metricMouth.classList.remove('alert');
    metricMouth.querySelector('strong').innerText = 'Closed';
}

// 3. Listen for AI results
socket.on('proctor_update', (data) => {
    // console.log("AI Server Update:", data);
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
const context = canvas.getContext('2d', { willReadFrequently: true });

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
            videoWrapper.className = 'video-wrapper critical';
            overallStatus.innerHTML = '<i class="fas fa-times-circle"></i> CAM ERROR';
            overallStatus.style.color = 'var(--danger)';
        });
}

socket.on('connect', () => {
    console.log("Connected to AI Server");
});

// Submit Button Action
document.getElementById('submitBtn')?.addEventListener('click', () => {
    alert("Examination Submitted Securely. Disconnecting link.");
    window.location.href = "/dashboard";
});