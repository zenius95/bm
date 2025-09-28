// utils/browserManager.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker');

puppeteer.use(StealthPlugin());
puppeteer.use(AdblockerPlugin({ blockTrackers: true }));

// === CẤU HÌNH TỐI ƯU ===
const MAX_BROWSERS = 2; // Số lượng trình duyệt chạy song song
const MAX_PAGES_PER_BROWSER = 5; // Số tab tối đa cho MỖI trình duyệt
const RESPAWN_DELAY_MS = 5000; // Thời gian chờ (5 giây) trước khi khởi động lại trình duyệt lỗi

const browserPool = []; // "Liên đoàn hồ bơi", chứa các trình duyệt
const requestQueue = []; // Hàng đợi chung cho tất cả các yêu cầu

/**
 * Hàm này tạo ra một trình duyệt đơn lẻ và thiết lập cơ chế tự hồi sinh.
 * @param {number} browserId - ID để định danh trình duyệt
 * @returns {Promise<{browser: import('puppeteer').Browser, pagePool: Array, id: number}>}
 */
async function createBrowserInstance(browserId) {
    console.log(`[BrowserManager] 🚀 Đang khởi chạy trình duyệt #${browserId}...`);
    try {
        const browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',      // Quan trọng cho môi trường Docker và VPS hạn chế tài nguyên
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process',             // Chỉ dùng cho môi trường không có GPU
                '--disable-gpu',                // Quan trọng cho server không có card đồ họa
                '--disable-background-networking',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-breakpad',
                '--disable-client-side-phishing-detection',
                '--disable-component-update',
                '--disable-default-apps',
                '--disable-extensions',
                '--disable-features=AudioServiceOutOfProcess',
                '--disable-hang-monitor',
                '--disable-ipc-flooding-protection',
                '--disable-notifications',
                '--disable-offer-store-unmasked-wallet-cards',
                '--disable-popup-blocking',
                '--disable-print-preview',
                '--disable-prompt-on-repost',
                '--disable-renderer-backgrounding',
                '--disable-sync',
                '--metrics-recording-only',
                '--mute-audio',
                '--no-pings',
                '--password-store=basic',
                '--use-gl=swiftshader',
                '--use-mock-keychain'
            ]
        });

        const pagePool = [];
        for (let j = 0; j < MAX_PAGES_PER_BROWSER; j++) {
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
            await page.setViewport({ width: 1366, height: 768 });
            pagePool.push(page);
        }

        const browserPoolItem = { browser, pagePool, id: browserId };

        // === CƠ CHẾ TỰ HỒI SINH ===
        browser.on('disconnected', () => {
            console.log(`[BrowserManager] 🔴 Trình duyệt #${browserId} đã bị ngắt kết nối.`);
            
            // Xóa trình duyệt hỏng khỏi "liên đoàn"
            const index = browserPool.findIndex(b => b.id === browserId);
            if (index > -1) {
                browserPool.splice(index, 1);
            }
            
            // Lên lịch khởi động lại trình duyệt mới sau một khoảng trễ
            console.log(`[BrowserManager] 🔄 Sẽ khởi động lại trình duyệt #${browserId} sau ${RESPAWN_DELAY_MS / 1000} giây...`);
            setTimeout(() => respawnBrowser(browserId), RESPAWN_DELAY_MS);
        });

        console.log(`[BrowserManager] ✅ Trình duyệt #${browserId} đã sẵn sàng với ${MAX_PAGES_PER_BROWSER} tab.`);
        return browserPoolItem;
    } catch (error) {
        console.error(`[BrowserManager] ❌ Lỗi nghiêm trọng khi khởi chạy trình duyệt #${browserId}: ${error.message}`);
        throw error;
    }
}

/**
 * Hàm được gọi để khởi động lại một trình duyệt đã bị ngắt kết nối.
 * @param {number} browserId 
 */
async function respawnBrowser(browserId) {
    try {
        const newBrowserInstance = await createBrowserInstance(browserId);
        browserPool.push(newBrowserInstance);
        console.log(`[BrowserManager] ✅ Đã hồi sinh thành công trình duyệt #${browserId}. Tổng số trình duyệt hiện tại: ${browserPool.length}`);
    } catch (error) {
        console.error(`[BrowserManager] ❌ Hồi sinh trình duyệt #${browserId} thất bại. Sẽ thử lại sau ${RESPAWN_DELAY_MS / 1000} giây.`);
        setTimeout(() => respawnBrowser(browserId), RESPAWN_DELAY_MS);
    }
}

/**
 * Khởi tạo đồng thời tất cả các trình duyệt trong "liên đoàn".
 */
const launchBrowsers = async () => {
    if (browserPool.length > 0) return;

    console.log(`[BrowserManager] 🚀 Khởi chạy ban đầu ${MAX_BROWSERS} trình duyệt...`);
    const launchPromises = [];
    for (let i = 1; i <= MAX_BROWSERS; i++) {
        launchPromises.push(createBrowserInstance(i));
    }
    const resolvedBrowsers = await Promise.all(launchPromises);
    browserPool.push(...resolvedBrowsers);
};

/**
 * "Mượn" một tab từ hồ bơi.
 * @returns {Promise<import('puppeteer').Page>}
 */
const acquirePage = () => {
    return new Promise(async (resolve) => {
        await launchBrowsers();
        
        const availableBrowserPool = browserPool.find(pool => pool.pagePool.length > 0);

        if (availableBrowserPool) {
            const page = availableBrowserPool.pagePool.pop();
            page.browserId = availableBrowserPool.id;
            console.log(`[BrowserManager] Cấp phát tab từ Trình duyệt #${page.browserId}. Tab còn lại trong hồ bơi này: ${availableBrowserPool.pagePool.length}`);
            resolve(page);
        } else {
            console.log(`[BrowserManager] Hết tab rảnh. Xếp hàng yêu cầu. Hàng đợi: ${requestQueue.length + 1}`);
            requestQueue.push(resolve);
        }
    });
};

/**
 * "Trả" một tab về lại hồ bơi của nó.
 * @param {import('puppeteer').Page} page
 */
const releasePage = (page) => {
    return new Promise((resolve) => {
        const ownerBrowserPool = browserPool.find(pool => pool.id === page.browserId);

        if (!ownerBrowserPool) {
            console.error(`[BrowserManager] ⚠️ Không tìm thấy trình duyệt gốc #${page.browserId} để trả tab. Tab sẽ bị hủy.`);
            page.close().catch(err => console.error(`Lỗi khi cố gắng đóng tab mồ côi: ${err.message}`));
            return resolve();
        }

        if (requestQueue.length > 0) {
            const nextResolve = requestQueue.shift();
            console.log(`[BrowserManager] Trả tab từ trình duyệt #${page.browserId} và cấp phát ngay cho yêu cầu đang đợi. Hàng đợi còn: ${requestQueue.length}`);
            nextResolve(page);
        } else {
            ownerBrowserPool.pagePool.push(page);
            console.log(`[BrowserManager] Trả tab về hồ bơi của trình duyệt #${page.browserId}. Tab còn lại: ${ownerBrowserPool.pagePool.length}`);
        }
        resolve();
    });
};

/**
 * Đóng tất cả các trình duyệt.
 */
const closeBrowser = async () => {
    console.log('[BrowserManager] 👋 Đang đóng tất cả các trình duyệt...');
    const closePromises = browserPool.map(pool => pool.browser.close());
    await Promise.all(closePromises);
    browserPool.length = 0;
    console.log('[BrowserManager] ✅ Tất cả trình duyệt đã được đóng.');
};

module.exports = {
    launchBrowser: launchBrowsers,
    acquirePage,
    releasePage,
    closeBrowser,
    // Xuất ra các hằng số để file test có thể sử dụng
    MAX_BROWSERS,
    MAX_PAGES_PER_BROWSER
};