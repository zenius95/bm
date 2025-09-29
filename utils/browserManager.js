// utils/browserManager.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker');
const settingsService = require('./settingsService');

puppeteer.use(StealthPlugin());
puppeteer.use(AdblockerPlugin({ blockTrackers: true }));

const activeBrowserPool = new Set();
const requestQueue = [];
let browserIdCounter = 0;

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
            headless: false,
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
 * Creates and returns a new Puppeteer browser instance on demand.
 * It will try proxies from the settings until a working one is found.
 * @returns {Promise<import('puppeteer').Browser>} A promise that resolves to a browser instance.
 */
async function createBrowser(excludedProxies = []) {
    const browserConfig = settingsService.get('browserManager');
    const allProxies = browserConfig.proxies || [];
    const availableProxies = allProxies.filter(p => !excludedProxies.includes(p));

    if (allProxies.length > 0 && availableProxies.length === 0) {
        throw new Error('Đã thử hết các proxy nhưng không có proxy nào hoạt động.');
    }
    
    const proxyToTry = allProxies.length > 0 ? availableProxies[Math.floor(Math.random() * availableProxies.length)] : null;

    if (proxyToTry) {
        console.log(`[BrowserManager] 🔍 Đang kiểm tra proxy: ${proxyToTry}...`);
        const isProxyWorking = await checkProxyWithBrowser(proxyToTry);
        
        if (!isProxyWorking) {
            console.log(`[BrowserManager] ❌ Proxy ${proxyToTry} không hoạt động. Thử proxy khác.`);
            return createBrowser([...excludedProxies, proxyToTry]); // Thử lại với proxy khác
        }
        console.log(`[BrowserManager] ✅ Proxy ${proxyToTry} hoạt động tốt.`);
    }

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
            }
        }

        const browser = await puppeteer.launch({ headless: false, args: launchArgs, timeout: 60000 });
        
        // This is a workaround to attach authentication to all pages
        if (proxyAuth) {
            browser.on('targetcreated', async (target) => {
                const page = await target.page();
                if (page) {
                    await page.authenticate(proxyAuth);
                }
            });
        }
        
        browserIdCounter++;
        const browserId = browserIdCounter;
        browser.id = browserId;
        activeBrowserPool.add(browser);
        console.log(`[BrowserManager] ✅ (ID #${browserId}) Trình duyệt đã khởi chạy ${proxyToTry ? 'với proxy ' + proxyToTry : ''}. Tổng số trình duyệt đang hoạt động: ${activeBrowserPool.size}`);

        browser.on('disconnected', () => {
            activeBrowserPool.delete(browser);
            console.log(`[BrowserManager] 🔴 (ID #${browserId}) Trình duyệt đã đóng. Tổng số trình duyệt còn lại: ${activeBrowserPool.size}`);
            processNextRequest();
        });

        return browser;
    } catch (error) {
        console.error(`[BrowserManager] ❌ Lỗi khi khởi chạy trình duyệt với proxy "${proxyToTry || 'không có'}": ${error.message}`);
        if (proxyToTry) {
            return createBrowser([...excludedProxies, proxyToTry]);
        }
        throw new Error('Lỗi nghiêm trọng khi khởi chạy trình duyệt mà không có proxy.');
    }
}

function processNextRequest() {
    const browserConfig = settingsService.get('browserManager');
    if (requestQueue.length > 0 && activeBrowserPool.size < browserConfig.maxBrowsers) {
        const resolve = requestQueue.shift();
        resolve(createBrowser());
    }
}

const acquireBrowser = () => {
    return new Promise((resolve) => {
        const browserConfig = settingsService.get('browserManager');
        if (activeBrowserPool.size < browserConfig.maxBrowsers) {
            resolve(createBrowser());
        } else {
            console.log(`[BrowserManager] Đã đạt giới hạn ${browserConfig.maxBrowsers} trình duyệt. Yêu cầu được xếp vào hàng đợi...`);
            requestQueue.push(resolve);
        }
    });
};

const releaseBrowser = async (browser) => {
    if (browser) {
        console.log(`[BrowserManager] 🚪 Đang đóng trình duyệt #${browser.id}...`);
        await browser.close();
        // processNextRequest() được gọi tự động bởi event 'disconnected'
    }
};

const closeAllBrowsers = async () => {
    console.log('[BrowserManager] 👋 Đang đóng tất cả các trình duyệt...');
    const closePromises = Array.from(activeBrowserPool).map(browser => browser.close());
    await Promise.all(closePromises);
    activeBrowserPool.clear();
    console.log('[BrowserManager] ✅ Tất cả trình duyệt đã được đóng.');
};

module.exports = {
    acquireBrowser,
    releaseBrowser,
    closeAllBrowsers,
};