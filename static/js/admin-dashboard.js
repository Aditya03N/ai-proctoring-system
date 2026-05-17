document.addEventListener('DOMContentLoaded', () => {
    const activeStudents = document.getElementById('activeStudents');
    const totalWarnings = document.getElementById('totalWarnings');
    const logBody = document.getElementById('logBody');
    const warningMonitorBody = document.getElementById('warningMonitorBody');

    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

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
                    ? `<button class="btn-glow btn-danger terminate-btn" data-student="${escapeHtml(log.student)}"><i class="fas fa-ban"></i> Terminate Exam</button>`
                    : '<span class="text-muted">--</span>';

            row.className = index === 0 ? 'new-entry' : '';
            row.innerHTML = `
                <td class="roll">${escapeHtml(log.student)}</td>
                <td>${escapeHtml(log.username)}</td>
                <td class="activity">${escapeHtml(log.activity)}</td>
                <td class="time">${escapeHtml(log.time)}</td>
                <td>${actionCell}</td>
            `;
            logBody.appendChild(row);
        });
    };

    const getStatusClass = (status) => {
        const normalizedStatus = String(status || '').toLowerCase();
        if (normalizedStatus === 'terminated') return 'status-terminated';
        if (normalizedStatus === 'suspicious') return 'status-suspicious';
        if (normalizedStatus === 'warning') return 'status-warning';
        return 'status-active';
    };

    const renderWarningRows = (rows = []) => {
        warningMonitorBody.innerHTML = '';

        if (!rows.length) {
            const emptyRow = document.createElement('tr');
            emptyRow.innerHTML = `<td colspan="6" style="padding:40px; text-align:center; color: var(--text-muted);">Waiting for student warnings...</td>`;
            warningMonitorBody.appendChild(emptyRow);
            return;
        }

        rows.forEach((row, index) => {
            const tableRow = document.createElement('tr');
            const isTerminated = Boolean(row.terminated) || row.status === 'Terminated';
            const actionCell = isTerminated
                ? '<span class="badge terminated-badge"><i class="fas fa-times-circle"></i> Terminated</span>'
                : `<button class="btn-glow btn-danger terminate-btn" data-student="${escapeHtml(row.student_id)}"><i class="fas fa-ban"></i> Terminate Exam</button>`;

            tableRow.className = index === 0 ? 'new-entry' : '';
            tableRow.innerHTML = `
                <td>
                    <span>${escapeHtml(row.student_name)}</span>
                    <span class="student-id">${escapeHtml(row.student_id)}</span>
                </td>
                <td class="activity">${escapeHtml(row.warning_type)}</td>
                <td class="time">${escapeHtml(row.timestamp)}</td>
                <td class="roll">${escapeHtml(row.warning_count)}</td>
                <td><span class="status-pill ${getStatusClass(row.status)}">${escapeHtml(row.status)}</span></td>
                <td>${actionCell}</td>
            `;
            warningMonitorBody.appendChild(tableRow);
        });
    };

    const socket = io();

    const renderSummary = (data) => {
        activeStudents.textContent = String(data.active_students || 0).padStart(2, '0');
        totalWarnings.textContent = String(data.total_warnings || 0).padStart(2, '0');
    };

    socket.on('student_auto_terminated', (data) => {
        fetchLogs();
    });

    socket.on('admin_warning_monitor_update', (data) => {
        renderSummary(data);
        renderLogs(data.logs || [], data.active_student_ids || [], data.exam_statuses || {});
        renderWarningRows(data.warning_rows || []);
    });

    const fetchLogs = async () => {
        try {
            const response = await fetch('/get_logs', { cache: 'no-store' });
            if (!response.ok) throw new Error('Unable to fetch logs');
            const data = await response.json();
            renderSummary(data);
            renderLogs(data.logs || [], data.active_student_ids || [], data.exam_statuses || {});
            renderWarningRows(data.warning_rows || []);
        } catch (error) {
            console.warn('Admin dashboard error:', error);
        }
    };

    document.addEventListener('click', async (event) => {
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
});
