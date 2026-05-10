document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const togglePassword = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('password');

    // Toggle Password Visibility
    if (togglePassword && passwordInput) {
        togglePassword.addEventListener('click', () => {
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            
            // Toggle icon with smooth color transition
            const icon = togglePassword.querySelector('i');
            if (type === 'text') {
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-eye-slash');
                togglePassword.style.color = 'var(--primary)';
            } else {
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-eye');
                togglePassword.style.color = 'var(--text-muted)';
            }
        });
    }

    // Handle Form Submission and Loading State
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            // Show futuristic loading overlay
            loadingOverlay.classList.add('active');
            
            // The form will submit naturally to the Flask backend.
            // We don't preventDefault() because we want the real POST to happen.
            
            // Optional: add a slight delay to ensure the animation is visible
            // e.preventDefault();
            // setTimeout(() => loginForm.submit(), 800);
        });
    }
});
