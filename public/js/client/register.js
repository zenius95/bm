document.addEventListener('DOMContentLoaded', () => {
    const usernameInput = document.getElementById('username');
    const usernameError = document.getElementById('username-error');
    const registerForm = document.getElementById('register-form');
    const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;

    let isUsernameValid = false;

    usernameInput.addEventListener('input', () => {
        const username = usernameInput.value;
        if (username && !USERNAME_REGEX.test(username)) {
            usernameError.classList.remove('hidden');
            usernameInput.classList.add('border-red-500');
            isUsernameValid = false;
        } else {
            usernameError.classList.add('hidden');
            usernameInput.classList.remove('border-red-500');
            isUsernameValid = true;
        }
    });

    registerForm.addEventListener('submit', (e) => {
        if (!isUsernameValid) {
            e.preventDefault(); // Ngăn form gửi đi nếu username không hợp lệ
            usernameError.classList.remove('hidden');
            usernameInput.focus();
        }
    });
});