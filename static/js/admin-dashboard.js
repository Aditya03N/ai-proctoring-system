document.addEventListener('DOMContentLoaded', () => {
    const activeStudents = document.getElementById('activeStudents');
    const totalWarnings = document.getElementById('totalWarnings');
    const logBody = document.getElementById('logBody');

    const renderLogs = (logs, activeStudentIds = [], examStatuses = {}) => {
        logBody.innerHTML = '';
        const activeStudentSet = new Set(activeStudentIds);

        if (!logs.length) {
            const emptyRow = document.createElement('tr');
            emptyRow.innerHTML = `<td colspan="5" style="padding:40px; text-align:center; color: var(--text-muted);">No warnings detected yet.</td>`;
            logBody.appendChild(emptyRow);
            return;
        }

        logs.forEach((log, index) => {
            const row = document.createElement('tr');
            const status = examStatuses[log.student] || {};
            const canTerminate = activeStudentSet.has(log.student) && !status.terminated;
            const actionCell = status.terminated
                ? '<span class="badge terminated-badge"><i class="fas fa-times-circle"></i> Terminated</span>'
                : canTerminate
                    ? `<button class="btn-glow btn-danger terminate-btn" data-student="${log.student}"><i class="fas fa-ban"></i> Terminate Exam</button>`
                    : '<span class="text-muted">--</span>';

            row.className = index === 0 ? 'new-entry' : '';
            row.innerHTML = `
                <td class="roll">${log.student}</td>
                <td>${log.username}</td>
                <td class="activity">${log.activity}</td>
                <td class="time">${log.time}</td>
                <td>${actionCell}</td>
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
            renderLogs(data.logs || [], data.active_student_ids || [], data.exam_statuses || {});
        } catch (error) {
            console.warn('Admin dashboard error:', error);
        }
    };

    logBody.addEventListener('click', async (event) => {
        const button = event.target.closest('.terminate-btn');
        if (!button) return;

        const studentId = button.dataset.student;
        const confirmed = window.confirm("Are you sure you want to terminate this student's exam?");
        if (!confirmed) return;

        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Terminating';

        try {
            const response = await fetch(`/admin/terminate_exam/${encodeURIComponent(studentId)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Unable to terminate exam');
            }
            fetchLogs();
        } catch (error) {
            console.warn('Terminate exam error:', error);
            alert('Unable to terminate exam. Please try again.');
            button.disabled = false;
            button.innerHTML = '<i class="fas fa-ban"></i> Terminate Exam';
        }
    });

    fetchLogs();
    setInterval(fetchLogs, 1500);
});
