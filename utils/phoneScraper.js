// utils/phoneScraper.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker');

puppeteer.use(StealthPlugin());
puppeteer.use(AdblockerPlugin({ blockTrackers: true }));

const BASE_URL = 'https://www.receive-sms-free.cc';

async function scrapeAllPhoneData(configuredCountries = [], logCallback = console.log) {
    let browser = null;
    try {
        logCallback(`[PhoneScraper] Khởi chạy trình duyệt (Stealth + Adblock Mode)...`);
        browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        await page.setViewport({ width: 1366, height: 768 });

        const allCountryLinks = await _getAllCountryLinks(page, configuredCountries, logCallback);

        if (allCountryLinks.length === 0) {
            logCallback(`<span class="text-red-400">[PhoneScraper] CẢNH BÁO: Không thể lấy được danh sách quốc gia từ trang web.</span>`);
            return [];
        }

        const countriesToScrape = allCountryLinks.filter(country => {
            if (configuredCountries.length === 0) return true;
            const scrapedName = country.countryName.toLowerCase();
            const scrapedKey = country.countryKey.toLowerCase();
            return configuredCountries.some(cfgName => 
                scrapedName.includes(cfgName) || cfgName.includes(scrapedName) ||
                scrapedKey.includes(cfgName) || cfgName.includes(scrapedKey)
            );
        });

        if (countriesToScrape.length === 0) {
            logCallback('<span class="text-yellow-400">Bỏ qua: Không có quốc gia nào trên web khớp với cấu hình của bạn.</span>');
            return [];
        }

        logCallback(`Sẽ tiến hành cào dữ liệu cho ${countriesToScrape.length} quốc gia: ${countriesToScrape.map(c => c.countryName).join(', ')}`);

        let allPhones = [];
        for (const country of countriesToScrape) {
            const phones = await _getPhonesFromCountryPage(page, country.countryName, country.url, logCallback);
            allPhones = allPhones.concat(phones);
        }

        return allPhones;

    } catch (error) {
        logCallback(`<span class="text-red-400">[PhoneScraper] Lỗi nghiêm trọng: ${error.message}</span>`);
        return [];
    } finally {
        if (browser) {
            logCallback('[PhoneScraper] Đóng trình duyệt.');
            await browser.close();
        }
    }
}

async function _getAllCountryLinks(page, configuredCountries, logCallback) {
    const regionsUrl = `${BASE_URL}/regions/`;
    logCallback(`[PhoneScraper] Đang lấy danh sách quốc gia từ: ${regionsUrl}`);
    await page.goto(regionsUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    const allCountries = new Map();
    let currentPageNum = 1;
    const foundConfiguredCountries = new Set();

    while (true) {
        logCallback(`[PhoneScraper] Đang cào trang ${currentPageNum} của danh sách quốc gia...`);
        const selector = 'ul#ul > li.wow.fadeInUp';
        try {
            await page.waitForSelector(selector, { timeout: 30000 });
        } catch (e) {
            logCallback(`[PhoneScraper] Không tìm thấy mục quốc gia trên trang ${currentPageNum}.`);
            break;
        }

        const countriesOnPage = await page.evaluate((baseUrl) => {
            const countryList = [];
            document.querySelectorAll('ul#ul > li.wow.fadeInUp').forEach(item => {
                const linkElement = item.querySelector('a[href*="-Phone-Number/"]');
                const countryNameElement = item.querySelector('h2 > span');
                if (linkElement && countryNameElement) {
                    const countryName = countryNameElement.textContent.trim().replace(/ Phone Number$/, '');
                    const relativeUrl = linkElement.getAttribute('href');
                    if (countryName && relativeUrl) {
                        const fullUrl = relativeUrl.startsWith('http') ? relativeUrl : `${baseUrl}${relativeUrl}`;
                        const urlMatch = relativeUrl.match(/Free-([a-zA-Z0-9_-]+)-Phone-Number/);
                        const countryKey = urlMatch ? urlMatch[1].replace(/-/g, ' ') : countryName;
                        countryList.push({ countryName, countryKey, url: fullUrl });
                    }
                }
            });
            return countryList;
        }, BASE_URL);
        
        if (countriesOnPage.length === 0) break;

        countriesOnPage.forEach(country => {
            if (!allCountries.has(country.url)) {
                allCountries.set(country.url, country);
                if (configuredCountries.length > 0) {
                    const scrapedName = country.countryName.toLowerCase();
                    const scrapedKey = country.countryKey.toLowerCase();
                    const matchedConfig = configuredCountries.find(cfgName => 
                        scrapedName.includes(cfgName) || cfgName.includes(scrapedName) ||
                        scrapedKey.includes(cfgName) || cfgName.includes(scrapedKey)
                    );
                    if (matchedConfig) {
                        foundConfiguredCountries.add(matchedConfig);
                    }
                }
            }
        });
        logCallback(`[PhoneScraper] Tìm thấy ${countriesOnPage.length} quốc gia. Tổng số hiện tại: ${allCountries.size}`);
        
        if (configuredCountries.length > 0 && foundConfiguredCountries.size === configuredCountries.length) {
            logCallback(`[PhoneScraper] Đã tìm thấy tất cả ${configuredCountries.length} quốc gia trong cài đặt. Dừng cào danh sách.`);
            break;
        }

        const nextButtonHandle = await page.evaluateHandle((currentPage) => {
            const nextPageNum = currentPage + 1;
            const paginationLinks = document.querySelectorAll('.pagination li a.page-link');
            return Array.from(paginationLinks).find(link => link.textContent.trim() == nextPageNum);
        }, currentPageNum);

        const nextElement = await nextButtonHandle.asElement();
        
        if (nextElement) {
            currentPageNum++;
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }),
                nextElement.click(),
            ]);
            await page.waitForTimeout(1500);
        } else {
            logCallback('[PhoneScraper] Đã cào hết các trang danh sách quốc gia.');
            break;
        }
    }
    return Array.from(allCountries.values());
}

async function _getPhonesFromCountryPage(page, countryName, countryUrl, logCallback) {
    logCallback(`[PhoneScraper] Bắt đầu cào SĐT cho ${countryName} tại: ${countryUrl}`);
    await page.goto(countryUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    const allPhoneNumbers = new Set();
    let currentPageNum = 1;

    while (true) {
        logCallback(`[PhoneScraper] Đang cào trang ${currentPageNum} của ${countryName}...`);
        const selector = 'ul#ul > li.wow.fadeInUp'; 
        try {
            await page.waitForSelector(selector, { timeout: 30000 });
        } catch (e) {
            logCallback(`[PhoneScraper] Không tìm thấy SĐT trên trang ${currentPageNum} của ${countryName}.`);
            break;
        }
        
        const numbersOnPage = await page.evaluate(() => {
            const numbers = new Set();
            document.querySelectorAll('ul#ul > li.wow.fadeInUp a h2 > span').forEach(el => {
                const phone = el.textContent.trim();
                if (phone) numbers.add(phone.replace(/\D/g, ''));
            });
            return Array.from(numbers);
        });
        
        if (numbersOnPage.length === 0) break;

        numbersOnPage.forEach(num => allPhoneNumbers.add(num));
        logCallback(`[PhoneScraper] Tìm thấy ${numbersOnPage.length} SĐT. Tổng số hiện tại cho ${countryName}: ${allPhoneNumbers.size}`);
        
        const nextButtonHandle = await page.evaluateHandle((currentPage) => {
            const nextPageNum = currentPage + 1;
            const paginationLinks = document.querySelectorAll('.pagination li a.page-link');
            return Array.from(paginationLinks).find(link => link.textContent.trim() == nextPageNum);
        }, currentPageNum);

        const nextElement = await nextButtonHandle.asElement();

        if (nextElement) {
            currentPageNum++;
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }),
                nextElement.click(),
            ]);
            await page.waitForTimeout(1500);
        } else {
            logCallback(`[PhoneScraper] Đã đến trang cuối cùng của ${countryName}.`);
            break;
        }
    }

    return Array.from(allPhoneNumbers).map(number => ({
        phoneNumber: number,
        country: countryName,
        source: 'receive-sms-free.cc'
    }));
}

async function getMessages(country, phoneNumber) {
    let browser = null;
    try {
        logCallback(`[MessageScraper] Khởi chạy trình duyệt lấy tin nhắn cho ${phoneNumber}...`);
        browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        const countryKey = country.replace(/\s/g, '-');
        const phoneUrl = `${BASE_URL}/Free-${countryKey}-Phone-Number/${phoneNumber}.html`;
        
        logCallback(`[MessageScraper] Truy cập: ${phoneUrl}`);
        await page.goto(phoneUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        const messages = await page.evaluate(() => {
            const msgs = [];
            // Selector đã được kiểm tra lại cho trang tin nhắn
            document.querySelectorAll('div.mobile_and_detail_new_message_list div.row').forEach(row => {
                const fromEl = row.querySelector('.col-xs-12.col-md-2.message-from');
                const textEl = row.querySelector('.col-xs-12.col-md-8');
                const timeEl = row.querySelector('.col-xs-12.col-md-2.ago');

                if (fromEl && textEl && timeEl) {
                     msgs.push({
                        from: fromEl.textContent.trim(),
                        text: textEl.textContent.trim(),
                        time: timeEl.textContent.trim()
                    });
                }
            });
            return msgs;
        });
        logCallback(`[MessageScraper] Tìm thấy ${messages.length} tin nhắn cho ${phoneNumber}.`);
        return messages;
    } catch (error) {
        logCallback(`<span class="text-red-400">[MessageScraper] Lỗi khi lấy tin nhắn cho ${phoneNumber}: ${error.message}</span>`);
        return [];
    } finally {
        if (browser) await browser.close();
    }
}

async function getCodeFromPhonePage(country, phoneNumber) {
    const messages = await getMessages(country, phoneNumber); // Tái sử dụng hàm getMessages
    for (const message of messages) {
        if (message.text.toLowerCase().includes('instagram')) {
            const codeMatch = message.text.match(/\b(\d{6})\b/);
            if (codeMatch && codeMatch[1]) {
                return codeMatch[1];
            }
        }
    }
    return null;
}

module.exports = { scrapeAllPhoneData, getCodeFromPhonePage, getMessages };