document.addEventListener('DOMContentLoaded', () => {
    // === Tab Logic ===
    const tabLinks = document.querySelectorAll('#settings-tab-list a[role="tab"]');
    const tabPanes = document.querySelectorAll('#settings-tab-content .tab-pane');
    const activeClasses = ['text-white', 'bg-blue-600', 'shadow-lg'];
    const inactiveClasses = ['text-gray-400', 'hover:bg-white/10', 'hover:text-white'];

    function activateTab(targetId) {
        tabLinks.forEach(link => {
            const linkTarget = link.getAttribute('data-tab-target');
            if (linkTarget === targetId) {
                link.classList.add(...activeClasses);
                link.classList.remove(...inactiveClasses);
            } else {
                link.classList.remove(...activeClasses);
                link.classList.add(...inactiveClasses);
            }
        });
        tabPanes.forEach(pane => {
            if (pane.id === targetId.substring(1)) {
                pane.classList.remove('hidden');
            } else {
                pane.classList.add('hidden');
            }
        });
         localStorage.setItem('activeSettingsTab', targetId);
    }

    tabLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('data-tab-target');
            activateTab(targetId);
        });
    });

    const savedTab = localStorage.getItem('activeSettingsTab');
    if (savedTab && document.querySelector(`[data-tab-target="${savedTab}"]`)) {
        activateTab(savedTab);
    } else if (tabLinks.length > 0) {
        activateTab(tabLinks[0].getAttribute('data-tab-target'));
    }

    const initialState = JSON.parse(document.body.dataset.initialState || '{}');
    const settings = JSON.parse(document.body.dataset.settings || '{}');
    const socket = io();

    // --- Security & API Key ---
    const apiKeyForm = document.getElementById('api-key-form');
    if(apiKeyForm) {
        const apiKeyInput = document.getElementById('masterApiKey');
        const regenerateBtn = document.getElementById('regenerate-api-key-btn');
        const copyBtn = document.getElementById('copy-api-key-btn');

        regenerateBtn.addEventListener('click', () => {
            apiKeyInput.value = [...Array(64)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
        });
        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(apiKeyInput.value).then(() => {
                 showToast('Đã copy API Key!', 'Thành công', 'success');
            });
        });
        apiKeyForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                const response = await fetch('/admin/settings/api-key/update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ masterApiKey: apiKeyInput.value })
                });
                const result = await response.json();
                if (result.success) {
                    showToast(result.message, 'Thành công!', 'success');
                } else {
                    showToast(result.message, 'Lỗi!', 'error');
                }
            } catch (error) {
                showToast('Lỗi kết nối server.', 'Lỗi mạng!', 'error');
            }
        });
    }

    // --- Order Settings ---
    const orderSettingsForm = document.getElementById('order-settings-form');
    if (orderSettingsForm) {
        const container = document.getElementById('pricing-tiers-container');
        const addBtn = document.getElementById('add-tier-btn');
        const maxItemsInput = document.getElementById('maxItemsPerOrder');
        let initialTiers = settings.order.pricingTiers || [];

        const createTierRow = (tier = { quantity: 1, price: 100 }) => {
            const row = document.createElement('div');
            row.className = 'flex items-center gap-3 p-2 bg-gray-900/50 rounded-lg tier-row';
            row.innerHTML = `
                <div class="flex-1">
                    <label class="block text-xs text-gray-400 mb-1">Số lượng từ</label>
                    <input type="number" class="form-input !py-2 text-sm tier-quantity" value="${tier.quantity}" min="1" required>
                </div>
                <div class="flex-1">
                    <label class="block text-xs text-gray-400 mb-1">Đơn giá (VNĐ)</label>
                    <input type="number" class="form-input !py-2 text-sm tier-price" value="${tier.price}" min="0" required>
                </div>
                <button type="button" class="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-full self-end remove-tier-btn">
                    <i class="ri-delete-bin-line"></i>
                </button>
            `;
            container.appendChild(row);

            row.querySelector('.remove-tier-btn').addEventListener('click', () => {
                if (container.querySelectorAll('.tier-row').length > 1) {
                    row.remove();
                } else {
                    showToast('Phải có ít nhất một bậc giá.', 'Cảnh báo', 'warning');
                }
            });
        };

        const renderInitialTiers = () => {
            container.innerHTML = '';
            const sortedTiers = [...initialTiers].sort((a, b) => a.quantity - b.quantity);
            if (sortedTiers.length === 0) {
                createTierRow();
            } else {
                sortedTiers.forEach(createTierRow);
            }
        };

        addBtn.addEventListener('click', () => createTierRow());
        orderSettingsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const tiers = [];
            container.querySelectorAll('.tier-row').forEach(row => {
                const quantity = parseInt(row.querySelector('.tier-quantity').value, 10);
                const price = parseInt(row.querySelector('.tier-price').value, 10);
                if (!isNaN(quantity) && !isNaN(price)) {
                    tiers.push({ quantity, price });
                }
            });

            const payload = {
                pricingTiers: tiers,
                maxItemsPerOrder: maxItemsInput.value
            };

            try {
                const response = await fetch('/admin/settings/order/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const result = await response.json();
                if (result.success) {
                    showToast(result.message, 'Thành công!', 'success');
                } else {
                    showToast(result.message, 'Lỗi!', 'error');
                }
            } catch (error) {
                showToast('Lỗi kết nối server.', 'Lỗi mạng!', 'error');
            }
        });
        renderInitialTiers();
    }

    // --- Services Settings ---
    const servicesSettingsForm = document.getElementById('services-settings-form');
    if (servicesSettingsForm) {
        const imageCaptchaSelect = document.getElementById('image-captcha-service-select');
        const imageCaptchaApiKeyInput = document.getElementById('image-captcha-api-key');
        const recaptchaSelect = document.getElementById('recaptcha-service-select');
        const recaptchaApiKeyInput = document.getElementById('recaptcha-api-key');
        const phoneSelect = document.getElementById('phone-service-select');
        const phoneApiKeyInput = document.getElementById('phone-api-key');
        const userAgentsTextarea = document.getElementById('user-agents-list');
        const allApiKeys = settings.services.apiKeys || { captcha: {}, phone: {} };

        function updateApiKeyInput(selectElement, inputElement, keyGroup) {
            const selectedService = selectElement.value;
            inputElement.value = (selectedService && allApiKeys[keyGroup] && allApiKeys[keyGroup][selectedService]) || '';
        }

        imageCaptchaSelect.addEventListener('change', () => updateApiKeyInput(imageCaptchaSelect, imageCaptchaApiKeyInput, 'captcha'));
        recaptchaSelect.addEventListener('change', () => updateApiKeyInput(recaptchaSelect, recaptchaApiKeyInput, 'captcha'));
        phoneSelect.addEventListener('change', () => updateApiKeyInput(phoneSelect, phoneApiKeyInput, 'phone'));
        
        updateApiKeyInput(imageCaptchaSelect, imageCaptchaApiKeyInput, 'captcha');
        updateApiKeyInput(recaptchaSelect, recaptchaApiKeyInput, 'captcha');
        updateApiKeyInput(phoneSelect, phoneApiKeyInput, 'phone');

        servicesSettingsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                selectedImageCaptchaService: imageCaptchaSelect.value,
                imageCaptchaApiKey: imageCaptchaApiKeyInput.value,
                selectedRecaptchaService: recaptchaSelect.value,
                recaptchaApiKey: recaptchaApiKeyInput.value,
                selectedPhoneService: phoneSelect.value,
                phoneApiKey: phoneApiKeyInput.value,
                userAgents: userAgentsTextarea.value
            };
            try {
                const response = await fetch('/admin/settings/services/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const result = await response.json();
                if (result.success) {
                    showToast(result.message, 'Thành công!', 'success');
                    setTimeout(() => window.location.reload(), 1500);
                } else {
                    showToast(result.message, 'Lỗi!', 'error');
                }
            } catch (error) {
                showToast('Lỗi kết nối server.', 'Lỗi mạng!', 'error');
            }
        });
    }

    // --- Deposit Settings ---
    const depositSettingsForm = document.getElementById('deposit-settings-form');
    if (depositSettingsForm) {
        depositSettingsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(depositSettingsForm);
            const data = Object.fromEntries(formData.entries());
            try {
                const response = await fetch('/admin/settings/deposit/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                const result = await response.json();
                if (result.success) {
                    showToast(result.message, 'Thành công!', 'success');
                } else {
                    showToast(result.message, 'Lỗi!', 'error');
                }
            } catch (error) {
                showToast('Lỗi kết nối server.', 'Lỗi mạng!', 'error');
            }
        });
    }
    
    // --- Generic Log Handler ---
    function setupLogHandler(logContainerId, initialLogs, eventName) {
        const logsContainer = document.getElementById(logContainerId);
        if (!logsContainer) return;

        function addLogMessage(logEntry) {
            const firstChild = logsContainer.querySelector('div:first-child');
            if(firstChild && (firstChild.textContent.includes('Connecting') || firstChild.textContent.includes('Chưa có'))) {
                logsContainer.innerHTML = '';
            }
            if (logsContainer.childElementCount > 150) {
                 logsContainer.removeChild(logsContainer.lastChild);
            }
            
            const logLine = document.createElement('div');
            const timestamp = new Date(logEntry.timestamp).toLocaleTimeString('vi-VN');
            logLine.innerHTML = `
                <span class="text-gray-600 flex-shrink-0">[${timestamp}]</span>
                <p class="ml-2 whitespace-pre-wrap break-words">${logEntry.message}</p>
            `;
            logLine.className = 'flex items-start';
            logsContainer.prepend(logLine);
        }
        
        logsContainer.innerHTML = '';
        if (initialLogs && initialLogs.length > 0) {
            initialLogs.forEach(log => addLogMessage(log));
        } else {
            logsContainer.innerHTML = '<div class="text-gray-500">Chưa có log nào.</div>';
        }

        socket.on(eventName, (logEntry) => addLogMessage(logEntry, true));
    }
    
    // --- Auto Deposit ---
    const autoDepositForm = document.getElementById('autodeposit-settings-form');
    if (autoDepositForm) {
        const apiKeyInput = document.getElementById('ad-apiKey');
        const intervalInput = document.getElementById('ad-intervalMinutes');
        const prefixInput = document.getElementById('ad-prefix');
        const startBtn = document.getElementById('ad-start-btn');
        const stopBtn = document.getElementById('ad-stop-btn');
        const statusBadge = document.getElementById('ad-status-badge');
        const nextRunContainer = document.getElementById('ad-next-run-container');
        const nextRunTime = document.getElementById('ad-next-run-time');

        function updateAutoDepositUI(state) {
            if (!state) return;
            statusBadge.className = 'px-2 py-1 text-xs font-semibold rounded-full '; 
            if (state.status === 'RUNNING') {
                statusBadge.textContent = state.isJobRunning ? 'Đang quét...' : 'Đang chạy';
                statusBadge.classList.add('bg-green-500/20', 'text-green-300');
                startBtn.disabled = true;
                stopBtn.disabled = false;
            } else {
                statusBadge.textContent = 'Đã dừng';
                statusBadge.classList.add('bg-red-500/20', 'text-red-300');
                startBtn.disabled = false;
                stopBtn.disabled = true;
            }
            apiKeyInput.value = state.config.apiKey;
            intervalInput.value = state.config.intervalMinutes;
            prefixInput.value = state.config.prefix;
            
            if (state.nextRun && !state.isJobRunning) {
                nextRunTime.textContent = new Date(state.nextRun).toLocaleString('vi-VN');
                nextRunContainer.style.display = 'block';
            } else {
                nextRunContainer.style.display = 'none';
            }
        }

        async function updateAutoDepositConfig(payload) {
            try {
                const response = await fetch('/admin/settings/auto-deposit/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const result = await response.json();
                if (result.success) {
                    showToast(result.message, 'Thành công!', 'success');
                    updateAutoDepositUI(result.data);
                } else {
                    showToast(result.message, 'Lỗi', 'error');
                }
            } catch (error) {
                showToast('Lỗi kết nối server', 'Lỗi', 'error');
            }
        }

        autoDepositForm.addEventListener('submit', (e) => {
            e.preventDefault();
            updateAutoDepositConfig({
                apiKey: apiKeyInput.value,
                intervalMinutes: intervalInput.value,
                prefix: prefixInput.value
            });
        });
        startBtn.addEventListener('click', () => updateAutoDepositConfig({ isEnabled: true }));
        stopBtn.addEventListener('click', () => updateAutoDepositConfig({ isEnabled: false }));
        
        updateAutoDepositUI(initialState.autoDeposit);
        socket.on('autoDeposit:statusUpdate', (state) => updateAutoDepositUI(state));
        setupLogHandler('autodeposit-logs', initialState.autoDeposit?.logs, 'autoDeposit:log');
    }
    
    // --- Auto Check Live ---
    const autoCheckForm = document.getElementById('autocheck-settings-form');
    if (autoCheckForm) {
        const intervalInput = document.getElementById('ac-intervalMinutes');
        const concurrencyInput = document.getElementById('ac-concurrency');
        const delayInput = document.getElementById('ac-delay');
        const timeoutInput = document.getElementById('ac-timeout');
        const batchSizeInput = document.getElementById('ac-batchSize'); 
        const startBtn = document.getElementById('ac-start-btn');
        const stopBtn = document.getElementById('ac-stop-btn');
        const statusBadge = document.getElementById('ac-status-badge');

        function updateAutoCheckUI(state) {
            if (!state) return;
            statusBadge.className = 'px-2 py-1 text-xs font-semibold rounded-full '; 
            if (state.status === 'RUNNING') {
                statusBadge.textContent = 'Đang chạy';
                statusBadge.classList.add('bg-green-500/20', 'text-green-300');
                startBtn.disabled = true;
                stopBtn.disabled = false;
            } else {
                statusBadge.textContent = 'Đã dừng';
                statusBadge.classList.add('bg-red-500/20', 'text-red-300');
                startBtn.disabled = false;
                stopBtn.disabled = true;
            }
        }

        async function updateAutoCheckConfig(payload) {
             try {
                const response = await fetch('/admin/settings/auto-check/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const result = await response.json();
                if (result.success) {
                    showToast(result.message, 'Thành công!', 'success');
                    updateAutoCheckUI(result.data);
                } else {
                    showToast(result.message, 'Lỗi!', 'error');
                }
            } catch (error) {
                showToast('Lỗi kết nối server', 'Lỗi', 'error');
            }
        }

        autoCheckForm.addEventListener('submit', (e) => {
            e.preventDefault();
            updateAutoCheckConfig({
                intervalMinutes: intervalInput.value,
                concurrency: concurrencyInput.value,
                delay: delayInput.value,
                timeout: timeoutInput.value,
                batchSize: batchSizeInput.value
            });
        });
        startBtn.addEventListener('click', () => updateAutoCheckConfig({ isEnabled: true }));
        stopBtn.addEventListener('click', () => updateAutoCheckConfig({ isEnabled: false }));
        
        updateAutoCheckUI(initialState.autoCheck);
        socket.on('autoCheck:statusUpdate', (state) => updateAutoCheckUI(state));
        setupLogHandler('autocheck-logs', initialState.autoCheck?.logs, 'autoCheck:log');
    }
    
    // --- Auto Proxy Check ---
    const autoProxyCheckForm = document.getElementById('autoproxycheck-settings-form');
    if (autoProxyCheckForm) {
        const intervalInput = document.getElementById('apc-intervalMinutes');
        const concurrencyInput = document.getElementById('apc-concurrency');
        const delayInput = document.getElementById('apc-delay');
        const timeoutInput = document.getElementById('apc-timeout');
        const batchSizeInput = document.getElementById('apc-batchSize'); 
        const retriesInput = document.getElementById('apc-retries');
        const startBtn = document.getElementById('apc-start-btn');
        const stopBtn = document.getElementById('apc-stop-btn');
        const statusBadge = document.getElementById('apc-status-badge');
        const nextRunContainer = document.getElementById('apc-next-run-container');
        const nextRunTime = document.getElementById('apc-next-run-time');

        function updateAutoProxyCheckUI(state) {
            if (!state) return;
            statusBadge.className = 'px-2 py-1 text-xs font-semibold rounded-full '; 
            if (state.status === 'RUNNING') {
                statusBadge.textContent = state.isJobRunning ? 'Đang check...' : 'Đang chạy';
                statusBadge.classList.add('bg-green-500/20', 'text-green-300');
                startBtn.disabled = true;
                stopBtn.disabled = false;
            } else {
                statusBadge.textContent = 'Đã dừng';
                statusBadge.classList.add('bg-red-500/20', 'text-red-300');
                startBtn.disabled = false;
                stopBtn.disabled = true;
            }
            if (state.nextRun && !state.isJobRunning) {
                nextRunTime.textContent = new Date(state.nextRun).toLocaleString('vi-VN');
                nextRunContainer.style.display = 'block';
            } else {
                nextRunContainer.style.display = 'none';
            }
        }

        async function updateAutoProxyCheckConfig(payload) {
            try {
                const response = await fetch('/admin/settings/auto-proxy-check/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const result = await response.json();
                if (result.success) {
                    showToast(result.message, 'Thành công!', 'success');
                    updateAutoProxyCheckUI(result.data);
                } else {
                    showToast(result.message, 'Lỗi!', 'error');
                }
            } catch (error) {
                showToast('Lỗi kết nối server', 'Lỗi', 'error');
            }
        }

        autoProxyCheckForm.addEventListener('submit', (e) => {
            e.preventDefault();
            updateAutoProxyCheckConfig({
                intervalMinutes: intervalInput.value,
                concurrency: concurrencyInput.value,
                delay: delayInput.value,
                timeout: timeoutInput.value,
                batchSize: batchSizeInput.value,
                retries: retriesInput.value
            });
        });
        startBtn.addEventListener('click', () => updateAutoProxyCheckConfig({ isEnabled: true }));
        stopBtn.addEventListener('click', () => updateAutoProxyCheckConfig({ isEnabled: false }));
        
        updateAutoProxyCheckUI(initialState.autoProxyCheck);
        socket.on('autoProxyCheck:statusUpdate', (state) => updateAutoProxyCheckUI(state));
        setupLogHandler('autoproxycheck-logs', initialState.autoProxyCheck?.logs, 'autoProxyCheck:log');
    }

    // <<< LOGIC MỚI CHO TỰ ĐỘNG LẤY SĐT >>>
    const autoPhoneForm = document.getElementById('ap-settings-form');
    if (autoPhoneForm) {
        const intervalInput = document.getElementById('ap-intervalMinutes');
        const countriesInput = document.getElementById('ap-countries');
        const sourcesInput = document.getElementById('ap-sources');
        const startBtn = document.getElementById('ap-start-btn');
        const stopBtn = document.getElementById('ap-stop-btn');
        const statusBadge = document.getElementById('ap-status-badge');
        const nextRunContainer = document.getElementById('ap-next-run-container');
        const nextRunTime = document.getElementById('ap-next-run-time');

        function updateAutoPhoneUI(state) {
            if (!state || !state.config) return;
            statusBadge.className = 'px-2 py-1 text-xs font-semibold rounded-full ';
            if (state.status === 'RUNNING') {
                statusBadge.textContent = state.isJobRunning ? 'Đang lấy số...' : 'Đang chạy';
                statusBadge.classList.add('bg-green-500/20', 'text-green-300');
                startBtn.disabled = true;
                stopBtn.disabled = false;
            } else {
                statusBadge.textContent = 'Đã dừng';
                statusBadge.classList.add('bg-red-500/20', 'text-red-300');
                startBtn.disabled = false;
                stopBtn.disabled = true;
            }
            
            if (state.nextRun && state.status === 'RUNNING' && !state.isJobRunning) {
                nextRunTime.textContent = new Date(state.nextRun).toLocaleString('vi-VN');
                nextRunContainer.style.display = 'block';
            } else {
                nextRunContainer.style.display = 'none';
            }
        }

        async function updateAutoPhoneConfig(payload) {
            try {
                const response = await fetch('/admin/settings/auto-phone/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const result = await response.json();
                if (result.success) {
                    showToast(result.message, 'Thành công!', 'success');
                    updateAutoPhoneUI(result.data);
                } else {
                    showToast(result.message, 'Lỗi!', 'error');
                }
            } catch (error) {
                showToast('Lỗi kết nối server.', 'Lỗi mạng!', 'error');
            }
        }

        autoPhoneForm.addEventListener('submit', (e) => {
            e.preventDefault();
            updateAutoPhoneConfig({
                intervalMinutes: intervalInput.value,
                countries: countriesInput.value.split(',').map(c => c.trim()).filter(Boolean),
                sources: sourcesInput.value.split(',').map(s => s.trim()).filter(Boolean)
            });
        });

        startBtn.addEventListener('click', () => updateAutoPhoneConfig({ isEnabled: true }));
        stopBtn.addEventListener('click', () => updateAutoPhoneConfig({ isEnabled: false }));

        if(initialState.autoPhone) {
            updateAutoPhoneUI(initialState.autoPhone);
            setupLogHandler('ap-logs', initialState.autoPhone.logs, 'autoPhone:log');
        }

        socket.on('autoPhone:statusUpdate', (state) => updateAutoPhoneUI(state));
    }
    // <<< KẾT THÚC LOGIC MỚI >>>

    // --- Item Processor ---
    const procForm = document.getElementById('processor-settings-form');
    if (procForm) {
        procForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(procForm);
            const data = Object.fromEntries(formData.entries());
             try {
                const response = await fetch('/admin/settings/item-processor/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                const result = await response.json();
                if (result.success) {
                    showToast(result.message, 'Thành công!', 'success');
                } else {
                    showToast(result.message, 'Lỗi!', 'error');
                }
            } catch (error) {
                showToast('Lỗi kết nối server', 'Lỗi', 'error');
            }
        });
    }
});