document.querySelectorAll('.btn-copy').forEach(button => {
    button.addEventListener('click', () => {
        const targetId = button.dataset.target;
        const targetElement = document.getElementById(targetId);
        if (targetElement) {
            const textToCopy = targetElement.textContent.trim();
            const tempInput = document.createElement('textarea');
            tempInput.value = textToCopy;
            document.body.appendChild(tempInput);
            tempInput.select();
            try {
                document.execCommand('copy');
                showToast(`Đã sao chép: ${textToCopy}`, 'Thành công', 'success');
            } catch (err) {
                showToast('Sao chép thất bại!', 'Lỗi', 'error');
            }
            document.body.removeChild(tempInput);
        }
    });
});