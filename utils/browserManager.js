// utils/browserManager.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker');
const settingsService = require('./settingsService');
const Proxy = require('../models/Proxy'); // Import model Proxy

puppeteer.use(StealthPlugin());
puppeteer.use(AdblockerPlugin({ blockTrackers: true }));

const browserPool = [];
const requestQueue = [];

/**
 * Checks if a single proxy works by launching a temporary, lightweight browser.
 * @param {string} proxyString - The proxy URL (e.g., http://user:pass@host:port).
 * @returns {Promise<boolean>}
 */
async function checkProxyWithBrowser(proxyString) {
    if (!proxyString) return false;
    let browser = null;
    try {
        const launchArgs = [
            '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
            '--disable-gpu', '--mute-audio', '--no-pings'
        ];
        const proxyUrl = new URL(proxyString);
        launchArgs.push(`--proxy-server=${proxyUrl.hostname}:${proxyUrl.port}`);
        
        let proxyAuth = null;
        if (proxyUrl.username && proxyUrl.password) {
            proxyAuth = { username: proxyUrl.username, password: proxyUrl.password };
        }
        
        browser = await puppeteer.launch({ headless: 'new', args: launchArgs, timeout: 20000 });
        const page = await browser.newPage();
        if (proxyAuth) await page.authenticate(proxyAuth);
        await page.goto('https://api.ipify.org', { waitUntil: 'domcontentloaded', timeout: 15000 });
        return true;
    } catch (error) {
        return false; 
    } finally {
        if (browser) await browser.close();
    }
}

/**
 * Soft-deletes a failed proxy from the database.
 * @param {object} proxy - The proxy object from the database.
 */
async function _handleFailedProxy(proxy) {
    // if (!proxy || !proxy._id) return;
    // console.log(`[BrowserManager] 🗑️ Proxy ${proxy.host}:${proxy.port} đã được chuyển vào thùng rác do không hoạt động.`);
    // try {
    //     await Proxy.findByIdAndUpdate(proxy._id, { isDeleted: true });
    // } catch (dbError) {
    //     console.error(`[BrowserManager] Lỗi khi cập nhật trạng thái proxy ${proxy.host}: ${dbError.message}`);
    // }
}

/**
 * The core logic for launching a browser instance.
 * @param {number} browserId - The ID for the browser.
 * @param {string|null} proxyString - The full proxy string to use, or null.
 * @returns {Promise<object|null>}
 */
async function _launchBrowser(browserId, proxyString) {
    console.log(`[BrowserManager] 🚀 (ID #${browserId}) Đang khởi chạy trình duyệt...`);
    if(proxyString) console.log(`   └──> Sử dụng proxy: ${proxyString.split('@').pop()}`); // Hide credentials in log
    
    try {
        const browserConfig = settingsService.get('browserManager');
        const launchArgs = [
            '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote',
            '--disable-gpu', '--mute-audio', '--no-pings'
        ];
        
        let proxyAuth = null;
        if (proxyString) {
            const proxyUrl = new URL(proxyString);
            launchArgs.push(`--proxy-server=${proxyUrl.hostname}:${proxyUrl.port}`);
            if (proxyUrl.username && proxyUrl.password) {
                proxyAuth = { username: proxyUrl.username, password: proxyUrl.password };
            }
        }

        const browser = await puppeteer.launch({ headless: 'new', args: launchArgs, timeout: 60000 });
        const pagePool = [];
        const MAX_PAGES_PER_BROWSER = browserConfig.maxPagesPerBrowser || 5;
        for (let j = 0; j < MAX_PAGES_PER_BROWSER; j++) {
            const page = await browser.newPage();
            if (proxyAuth) await page.authenticate(proxyAuth);
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
            await page.setViewport({ width: 1366, height: 768 });
            pagePool.push(page);
        }

        const browserPoolItem = { browser, pagePool, id: browserId, usedProxy: proxyString };
        browser.on('disconnected', () => {
            console.log(`[BrowserManager] 🔴 Trình duyệt #${browserId} đã bị ngắt kết nối.`);
            const index = browserPool.findIndex(b => b.id === browserId);
            if (index > -1) browserPool.splice(index, 1);
            const RESPAWN_DELAY_MS = settingsService.get('browserManager').respawnDelayMs || 5000;
            console.log(`[BrowserManager] 🔄 Sẽ khởi động lại trình duyệt #${browserId} sau ${RESPAWN_DELAY_MS / 1000} giây...`);
            setTimeout(() => respawnBrowser(browserId), RESPAWN_DELAY_MS);
        });
        
        console.log(`[BrowserManager] ✅ Trình duyệt #${browserId} đã sẵn sàng.`);
        return browserPoolItem;
    } catch (error) {
        console.error(`[BrowserManager] ❌ Lỗi nghiêm trọng khi khởi chạy trình duyệt #${browserId}: ${error.message}`);
        return null;
    }
}

async function createBrowserInstance(browserId) {
    const browserConfig = settingsService.get('browserManager');
    
    if (!browserConfig.useProxies) {
        return _launchBrowser(browserId, null);
    }

    const availableProxies = await Proxy.find({ isDeleted: false, status: 'LIVE' }).lean();
    if (availableProxies.length === 0) {
        console.warn(`[BrowserManager] ⚠️ (ID #${browserId}) Đã bật sử dụng proxy nhưng không tìm thấy proxy LIVE nào. Khởi chạy không proxy.`);
        return _launchBrowser(browserId, null);
    }

    console.log(`[BrowserManager] Tìm thấy ${availableProxies.length} proxy khả dụng. Bắt đầu kiểm tra và khởi chạy cho trình duyệt #${browserId}...`);

    for (const proxy of availableProxies) {
        const proxyString = `http://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`;
        console.log(`[BrowserManager] 🔍 Đang kiểm tra proxy: ${proxy.host}:${proxy.port}...`);
        
        const isProxyWorking = await checkProxyWithBrowser(proxyString);

        if (isProxyWorking) {
            return _launchBrowser(browserId, proxyString);
        } else {
            await _handleFailedProxy(proxy);
        }
    }
    
    console.error(`[BrowserManager] ❌ Đã kiểm tra tất cả ${availableProxies.length} proxy nhưng không có proxy nào hoạt động. Không thể khởi chạy trình duyệt #${browserId} với proxy.`);
    return null;
}

async function respawnBrowser(browserId) {
    const RESPAWN_DELAY_MS = settingsService.get('browserManager').respawnDelayMs || 5000;
    try {
        const newBrowserInstance = await createBrowserInstance(browserId);
        if (newBrowserInstance) {
            browserPool.push(newBrowserInstance);
            console.log(`[BrowserManager] ✅ Đã hồi sinh thành công trình duyệt #${browserId}. Tổng số trình duyệt hiện tại: ${browserPool.length}`);
        } else {
             console.error(`[BrowserManager] ❌ Hồi sinh trình duyệt #${browserId} thất bại hoàn toàn. Sẽ không thử lại cho đến khi server khởi động lại.`);
        }
    } catch (error) {
        console.error(`[BrowserManager] ❌ Lỗi không xác định khi hồi sinh trình duyệt #${browserId}. Thử lại sau ${RESPAWN_DELAY_MS / 1000} giây.`);
        setTimeout(() => respawnBrowser(browserId), RESPAWN_DELAY_MS);
    }
}

const launchBrowsers = async () => {
    if (browserPool.length > 0) return;
    
    const MAX_BROWSERS = settingsService.get('browserManager').maxBrowsers || 2;
    console.log(`[BrowserManager] 🚀 Khởi chạy ban đầu ${MAX_BROWSERS} trình duyệt...`);
    const launchPromises = [];
    for (let i = 1; i <= MAX_BROWSERS; i++) {
        launchPromises.push(createBrowserInstance(i));
    }
    const resolvedBrowsers = await Promise.all(launchPromises);
    browserPool.push(...resolvedBrowsers.filter(Boolean));
};

// ... (Các hàm acquirePage, releasePage, closeBrowser không thay đổi)
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
};