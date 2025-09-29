// utils/browserManager.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker');
const settingsService = require('./settingsService');

puppeteer.use(StealthPlugin());
puppeteer.use(AdblockerPlugin({ blockTrackers: true }));

const browserPool = [];
const requestQueue = [];

/**
 * Checks if a single proxy string is working by launching a temporary, lightweight browser.
 * This is the most reliable method as it mimics the real execution environment.
 * @param {string} proxyString - The proxy URL (e.g., http://user:pass@host:port).
 * @returns {Promise<boolean>} - True if the proxy is working, false otherwise.
 */
async function checkProxyWithBrowser(proxyString) {
    if (!proxyString) return false;

    let browser = null;
    try {
        const launchArgs = [
            '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
            '--disable-gpu', '--mute-audio', '--no-pings', '--disable-accelerated-2d-canvas',
            '--no-first-run', '--no-zygote'
        ];
        
        const proxyUrl = new URL(proxyString);
        const proxyServer = `${proxyUrl.hostname}:${proxyUrl.port}`;
        launchArgs.push(`--proxy-server=${proxyServer}`);
        
        let proxyAuth = null;
        if (proxyUrl.username && proxyUrl.password) {
            proxyAuth = { username: proxyUrl.username, password: proxyUrl.password };
        }
        
        browser = await puppeteer.launch({
            headless: 'new',
            args: launchArgs,
            timeout: 20000 // 20-second timeout for launch
        });
        
        const page = await browser.newPage();
        if (proxyAuth) {
            await page.authenticate(proxyAuth);
        }

        // Use a simple, reliable site for checking
        await page.goto('https://api.ipify.org', {
            waitUntil: 'domcontentloaded',
            timeout: 15000 // 15-second timeout for navigation
        });

        return true; // If no errors, the proxy is considered working

    } catch (error) {
        // Any error during launch or navigation means the proxy is not working reliably
        return false; 
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}


/**
 * Creates a browser instance, with built-in proxy checking and retry logic.
 * @param {number} browserId - The ID for the browser instance.
 * @param {string[]} excludedProxies - A list of proxies to exclude from selection.
 * @returns {Promise<object|null>} The browser pool item or null if launch fails.
 */
async function createBrowserInstance(browserId, excludedProxies = []) {
    const browserConfig = settingsService.get('browserManager');
    const allProxies = browserConfig.proxies || [];
    const availableProxies = allProxies.filter(p => !excludedProxies.includes(p));

    if (allProxies.length > 0 && availableProxies.length === 0) {
        console.error(`[BrowserManager] ❌ Đã thử hết các proxy cho trình duyệt #${browserId} nhưng đều thất bại.`);
        return null;
    }
    
    const proxyToTry = allProxies.length > 0 ? availableProxies[0] : null;

    if (proxyToTry) {
        console.log(`[BrowserManager] 🔍 (ID #${browserId}) Đang kiểm tra proxy: ${proxyToTry}...`);
        const isProxyWorking = await checkProxyWithBrowser(proxyToTry);
        
        if (!isProxyWorking) {
            console.log(`[BrowserManager] ❌ Proxy ${proxyToTry} không hoạt động. Thử proxy tiếp theo.`);
            return createBrowserInstance(browserId, [...excludedProxies, proxyToTry]);
        }
        console.log(`[BrowserManager] ✅ Proxy ${proxyToTry} hoạt động tốt.`);
    }

    console.log(`[BrowserManager] 🚀 (ID #${browserId}) Đang khởi chạy trình duyệt...`);
    if(proxyToTry) console.log(`   └──> Sử dụng proxy: ${proxyToTry}`);

    try {
        const launchArgs = [
            '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote',
            '--disable-gpu', '--mute-audio', '--no-pings'
        ];
        
        let proxyAuth = null;

        if (proxyToTry) {
            const proxyUrl = new URL(proxyToTry);
            const proxyServer = `${proxyUrl.hostname}:${proxyUrl.port}`;
            launchArgs.push(`--proxy-server=${proxyServer}`);

            if (proxyUrl.username && proxyUrl.password) {
                proxyAuth = { username: proxyUrl.username, password: proxyUrl.password };
                console.log(`   └──> Đã tìm thấy thông tin xác thực cho proxy.`);
            }
        }

        const browser = await puppeteer.launch({
            headless: 'new',
            args: launchArgs,
            timeout: 60000 
        });

        const pagePool = [];
        const MAX_PAGES_PER_BROWSER = browserConfig.maxPagesPerBrowser || 5;
        for (let j = 0; j < MAX_PAGES_PER_BROWSER; j++) {
            const page = await browser.newPage();
            if (proxyAuth) {
                await page.authenticate(proxyAuth);
            }
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
            await page.setViewport({ width: 1366, height: 768 });
            pagePool.push(page);
        }

        const browserPoolItem = { browser, pagePool, id: browserId, usedProxy: proxyToTry };

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
        console.error(`[BrowserManager] ❌ Lỗi khi khởi chạy trình duyệt #${browserId} với proxy "${proxyToTry || 'không có'}": ${error.message}`);
        
        if (proxyToTry) {
             return createBrowserInstance(browserId, [...excludedProxies, proxyToTry]);
        }
        
        console.error(`[BrowserManager] ❌ Lỗi nghiêm trọng khi khởi chạy trình duyệt mà không có proxy. Vui lòng kiểm tra môi trường hệ thống.`);
        return null;
    }
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