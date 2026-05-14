// AI Proctoring - Professional Exam UI Logic
'use strict';

const videoElement = document.getElementById('video');
const videoWrapper = document.getElementById('videoWrapper');
const liveWarnings = document.getElementById('live-warnings');
const overallStatus = document.getElementById('overallStatus');
const timerEl = document.getElementById('timer');

const eyeWarning = document.getElementById('eye-warning');
const headWarning = document.getElementById('head-warning');
const mouthWarning = document.getElementById('mouth-warning');

const eyeStatus = document.getElementById('eye-status');
const headStatus = document.getElementById('head-status');
const mouthStatus = document.getElementById('mouth-status');

const socket = io();
let frameIntervalId = null;
let monitoringStopped = false;

const WARNING_TYPES = {
    normal: { color: '#00ff88', icon: '<i class="fas fa-check"></i>' },
    warning: { color: '#ffaa00', icon: '<i class="fas fa-exclamation-triangle"></i>' },
    critical: { color: '#ff3333', icon: '<i class="fas fa-exclamation-circle"></i>' }
};

const MESSAGE_TYPES = {
    'Looking Left': { type: 'warning', box: 'eye' },
    'Looking Right': { type: 'warning', box: 'eye' },
    'Looking Down': { type: 'warning', box: 'head' },
    'Suspicious Mouth Movement': { type: 'warning', box: 'mouth' },
    'Face Not Visible': { type: 'critical', box: 'all' }
};

let timeRemaining = 60 * 60;
if (timerEl) {
    setInterval(() => {
        let minutes = Math.floor(timeRemaining / 60);
        let seconds = timeRemaining % 60;
        seconds = seconds < 10 ? '0' + seconds : seconds;
        timerEl.innerText = `${minutes}:${seconds}`;
        timeRemaining--;
        if (timeRemaining < 0) timeRemaining = 0;
    }, 1000);
}

function getBoxElements(box) {
    if (box === 'eye') return { boxElement: eyeWarning, statusElement: eyeStatus };
    if (box === 'head') return { boxElement: headWarning, statusElement: headStatus };
    if (box === 'mouth') return { boxElement: mouthWarning, statusElement: mouthStatus };
    return {};
}

function setBoxState(box, message, messageType) {
    const { boxElement, statusElement } = getBoxElements(box);
    const type = WARNING_TYPES[messageType];

    if (!boxElement || !statusElement || !type) return;

    boxElement.style.borderColor = type.color;
    statusElement.style.color = type.color;
    statusElement.innerHTML = `${type.icon} ${message}`;
}

function resetWarningBoxes() {
    ['eye', 'head', 'mouth'].forEach((box) => {
        const { boxElement, statusElement } = getBoxElements(box);

        if (!boxElement || !statusElement) return;

        boxElement.style.borderColor = WARNING_TYPES.normal.color;
        statusElement.style.color = WARNING_TYPES.normal.color;
        statusElement.innerHTML = `${WARNING_TYPES.normal.icon} Normal`;
    });
}

function createWarningChip(message, messageType) {
    const type = WARNING_TYPES[messageType] || WARNING_TYPES.warning;
    const chip = document.createElement('div');

    chip.className = 'warning-chip';
    chip.style.cssText = `
        background: rgba(0,0,0,0.85);
        color: ${type.color};
        padding: 10px 16px;
        border-radius: 20px;
        font-size: 0.8rem;
        white-space: nowrap;
        border: 1px solid ${type.color};
        font-weight: 600;
        backdrop-filter: blur(10px);
        animation: slideInWarning 0.4s ease-out;
        box-shadow: 0 0 15px ${messageType === 'critical' ? 'rgba(255,51,51,0.4)' : 'rgba(255,170,0,0.4)'};
        transition: all 0.3s ease;
    `;
    chip.innerHTML = `${type.icon} ${message}`;

    return chip;
}

function renderWarnings(activeWarnings = []) {
    resetWarningBoxes();
    liveWarnings.innerHTML = '';

    const hasCritical = activeWarnings.some((message) => MESSAGE_TYPES[message]?.type === 'critical');
    const hasWarning = activeWarnings.length > 0;
    const statusType = hasCritical ? 'critical' : hasWarning ? 'warning' : 'normal';
    const statusColor = WARNING_TYPES[statusType].color;

    activeWarnings.forEach((message) => {
        const warningConfig = MESSAGE_TYPES[message] || { type: 'warning', box: 'all' };
        const boxes = warningConfig.box === 'all' ? ['eye', 'head', 'mouth'] : [warningConfig.box];

        boxes.forEach((box) => setBoxState(box, message, warningConfig.type));
        liveWarnings.appendChild(createWarningChip(message, warningConfig.type));
    });

    videoWrapper.style.borderColor = statusType === 'normal' ? 'var(--primary)' : statusColor;
    overallStatus.style.color = statusType === 'normal' ? 'var(--success)' : statusColor;
    overallStatus.innerHTML = statusType === 'normal'
        ? '<i class="fas fa-circle"></i> SECURE'
        : '<i class="fas fa-exclamation-circle"></i> WARNING';
}

socket.on('proctor_update', (data) => {
    renderWarnings(data.warnings || (data.message ? [data.message] : []));
});

const canvas = document.createElement('canvas');
const context = canvas.getContext('2d', { willReadFrequently: true });

function sendFrame() {
    if (monitoringStopped) return;
    if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
        canvas.width = 320;
        canvas.height = 240;
        context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        const frameData = canvas.toDataURL('image/jpeg', 0.5);
        socket.emit('process_frame', { image: frameData });
    }
}

function collectAnswers() {
    const answers = {};
    document.querySelectorAll('input[type="radio"]:checked').forEach((input) => {
        answers[input.name] = input.value;
    });
    return answers;
}

function stopMonitoring() {
    monitoringStopped = true;
    if (frameIntervalId) {
        clearInterval(frameIntervalId);
        frameIntervalId = null;
    }
    if (videoElement?.srcObject) {
        videoElement.srcObject.getTracks().forEach((track) => track.stop());
        videoElement.srcObject = null;
    }
    socket.disconnect();
}

async function submitCurrentAnswers() {
    const answers = collectAnswers();
    try {
        await fetch('/exam/auto_submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ answers }),
            keepalive: true
        });
    } catch (error) {
        console.warn('Auto-submit failed:', error);
    }
}

async function completeExam(terminated = false, message = null) {
    stopMonitoring();
    if (terminated && message) {
        alert(message);
    }
    await submitCurrentAnswers();
    window.location.href = '/exam/completed';
}

if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ video: true })
        .then((stream) => {
            videoElement.srcObject = stream;
            frameIntervalId = setInterval(sendFrame, 500);
        })
        .catch((err) => {
            renderWarnings(['Camera Error: ' + err.message]);
            videoWrapper.style.borderColor = '#ff3333';
            overallStatus.innerHTML = '<i class="fas fa-times-circle"></i> CAM ERROR';
            overallStatus.style.color = '#ff3333';
        });
}

const style = document.createElement('style');
style.textContent = `
    @keyframes slideInWarning {
        from {
            opacity: 0;
            transform: translateY(-15px) scale(0.9);
        }
        to {
            opacity: 1;
            transform: translateY(0) scale(1);
        }
    }

    .warning-chip:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
`;
document.head.appendChild(style);

socket.on('connect', () => {
    console.log('Connected to AI Server');
});

socket.on('exam_terminated', (data) => {
    completeExam(true, data.message || 'Your exam has been terminated by the administrator due to suspicious activity.');
});

document.getElementById('submitBtn')?.addEventListener('click', () => {
    alert('Examination Submitted Securely. Disconnecting link.');
    stopMonitoring();
    submitCurrentAnswers().finally(() => {
        window.location.href = '/dashboard';
    });
});
