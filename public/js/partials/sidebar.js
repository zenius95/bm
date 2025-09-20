document.addEventListener('DOMContentLoaded', () => {
    const userMenuContainer = document.getElementById('user-menu-container');
    if (userMenuContainer) {
        const button = document.getElementById('user-menu-button');
        const dropdown = document.getElementById('user-menu-dropdown');
        const arrow = document.getElementById('user-menu-arrow');

        button.addEventListener('click', (event) => {
            event.stopPropagation();
            const isHidden = dropdown.classList.contains('hidden');
            if (isHidden) {
                dropdown.classList.remove('hidden');
                setTimeout(() => {
                    dropdown.classList.remove('opacity-0', 'scale-95');
                    arrow.classList.add('rotate-180');
                }, 10);
            } else {
                dropdown.classList.add('opacity-0', 'scale-95');
                arrow.classList.remove('rotate-180');
                setTimeout(() => {
                    dropdown.classList.add('hidden');
                }, 300);
            }
        });

        document.addEventListener('click', (event) => {
            if (!userMenuContainer.contains(event.target)) {
                dropdown.classList.add('opacity-0', 'scale-95');
                arrow.classList.remove('rotate-180');
                setTimeout(() => {
                    dropdown.classList.add('hidden');
                }, 300);
            }
        });
    }
});