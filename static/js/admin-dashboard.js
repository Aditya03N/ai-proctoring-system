document.addEventListener('DOMContentLoaded', () => {
    const activeStudents = document.getElementById('activeStudents');
    const totalWarnings = document.getElementById('totalWarnings');
    const logBody = document.getElementById('logBody');

    const renderLogs = (logs) => {
        logBody.innerHTML = '';

        if (!logs.length) {
            const emptyRow = document.createElement('tr');
            emptyRow.innerHTML = `<td colspan="4" style="padding:40px; text-align:center; color: var(--text-muted);">No warnings detected yet.</td>`;
            logBody.appendChild(emptyRow);
            return;
        }

        logs.forEach((log, index) => {
            const row = document.createElement('tr');
            row.className = index === 0 ? 'new-entry' : '';
            row.innerHTML = `
                <td class="roll">${log.student}</td>
                <td>${log.username}</td>
                <td class="activity">${log.activity}</td>
                <td class="time">${log.time}</td>
            `;
            logBody.appendChild(row);
        });
    };

    const renderSummary = (data) => {
        activeStudents.textContent = String(data.active_students || 0).padStart(2, '0');
        totalWarnings.textContent = String(data.total_warnings || 0).padStart(2, '0');
    };

    const fetchLogs = async () => {
        try {
            const response = await fetch('/get_logs', { cache: 'no-store' });
            if (!response.ok) throw new Error('Unable to fetch logs');
            const data = await response.json();
            renderSummary(data);
            renderLogs(data.logs || []);
        } catch (error) {
            console.warn('Admin dashboard error:', error);
        }
    };

    fetchLogs();
    setInterval(fetchLogs, 1500);
});
