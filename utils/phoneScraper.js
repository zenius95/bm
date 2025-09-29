// utils/phoneScraper.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker');
const browserManager = require('./browserManager');

puppeteer.use(StealthPlugin());
puppeteer.use(AdblockerPlugin({ blockTrackers: true }));

const BASE_URL = 'https://www.receive-sms-free.cc';

/**
 * Chuyển đổi chuỗi thời gian tương đối (vd: "2 min ago", "5 months ago") thành số giây.
 * @param {string} timeString - Chuỗi thời gian từ trang web.
 * @returns {number|null} - Số giây đã trôi qua, hoặc null nếu không parse được.
 */
function parseRelativeTime(timeString) {
    if (!timeString) return null;
    
    const lowerCaseTime = timeString.toLowerCase();
    // Regex được cải tiến để ưu tiên khớp các đơn vị dài hơn trước (ví dụ: 'month' trước 'min')
    const match = lowerCaseTime.match(/(\d+)\s+(month|year|day|hour|hr|minute|min|second|sec)s?/);
    if (!match) return null;

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
        case 'sec':
        case 'second':
             return value;
        case 'min':
        case 'minute':
            return value * 60;
        case 'hr':
        case 'hour':
            return value * 3600;
        case 'day':
            return value * 86400;
        case 'month':
            return value * 2592000; // ~30 days
        case 'year':
            return value * 31536000; // 365 days
        default: return null;
    }
}


async function scrapeAllPhoneData(configuredCountries = [], logCallback = console.log) {
    let browser = null;
    try {
        logCallback(`[PhoneScraper] Yêu cầu trình duyệt mới để cào danh sách SĐT...`);
        browser = await browserManager.acquireBrowser();
        const page = await browser.newPage();

        const allCountryLinks = await _getAllCountryLinks(page, configuredCountries, logCallback);

        if (allCountryLinks.length === 0) {
            logCallback(`<span class="text-red-400">[PhoneScraper] CẢNH BÁO: Không thể lấy được danh sách quốc gia từ trang web.</span>`);
            return [];
        }

        const countriesToScrape = allCountryLinks.filter(country => {
            if (configuredCountries.length === 0) return true;
            const scrapedName = country.countryName.toLowerCase();
            const scrapedSlug = country.countryUrlSlug.toLowerCase().replace(/-/g, ' ');
            return configuredCountries.some(cfgName =>
                scrapedName.includes(cfgName) || cfgName.includes(scrapedName) ||
                scrapedSlug.includes(cfgName) || cfgName.includes(scrapedSlug)
            );
        });

        if (countriesToScrape.length === 0) {
            logCallback('<span class="text-yellow-400">Bỏ qua: Không có quốc gia nào trên web khớp với cấu hình của bạn.</span>');
            return [];
        }

        logCallback(`Sẽ tiến hành cào dữ liệu cho ${countriesToScrape.length} quốc gia: ${countriesToScrape.map(c => c.countryName).join(', ')}`);

        let allPhones = [];
        for (const country of countriesToScrape) {
            const phones = await _getPhonesFromCountryPage(page, country.countryName, country.countryUrlSlug, country.url, logCallback);
            allPhones = allPhones.concat(phones);
        }

        return allPhones;

    } catch (error) {
        logCallback(`<span class="text-red-400">[PhoneScraper] Lỗi nghiêm trọng: ${error.message}</span>`);
        return [];
    } finally {
        if (browser) {
            logCallback('[PhoneScraper] Trả lại trình duyệt sau khi cào SĐT xong.');
            await browserManager.releaseBrowser(browser);
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
                        const countryUrlSlug = urlMatch ? urlMatch[1] : null; 
                        if (countryUrlSlug) {
                            countryList.push({ countryName, countryUrlSlug, url: fullUrl });
                        }
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
                     const scrapedSlug = country.countryUrlSlug.toLowerCase().replace(/-/g, ' ');
                     const matchedConfig = configuredCountries.find(cfgName =>
                        scrapedName.includes(cfgName) || cfgName.includes(scrapedName) ||
                        scrapedSlug.includes(cfgName) || cfgName.includes(scrapedSlug)
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

async function _getPhonesFromCountryPage(page, countryName, countryUrlSlug, countryUrl, logCallback) {
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
        country: countryUrlSlug,
        source: 'receive-sms-free.cc'
    }));
}

async function getMessages(countrySlug, phoneNumber, logCallback = console.log) {
    let browser = null;
    const maxRetries = 3; // Thử lại tối đa 3 lần với các proxy khác nhau
    let attempts = 0;

    while (attempts < maxRetries) {
        attempts++;
        try {
            logCallback(`[MessageScraper] Lần thử ${attempts}/${maxRetries}: Yêu cầu trình duyệt mới để lấy tin nhắn cho ${phoneNumber}...`);
            browser = await browserManager.acquireBrowser();
            const page = await browser.newPage();
            
            const phoneUrl = `${BASE_URL}/Free-${countrySlug}-Phone-Number/${phoneNumber}/`;
            
            logCallback(`[MessageScraper] Truy cập: ${phoneUrl}`);
            await page.goto(phoneUrl, { waitUntil: 'networkidle2', timeout: 60000 });

            // --- START: SỬA LỖI ---
            const messages = await page.evaluate(() => {
                const msgs = [];
                document.querySelectorAll('div.casetext > div.row.border-bottom').forEach(row => {
                    // Cột 1: Người gửi
                    const fromEl = row.querySelector('.col-xs-12.col-md-2 .mobile_hide');
                    // Cột 2: Thời gian (bị ẩn trên mobile)
                    const timeEl = row.querySelector('.col-xs-0.col-md-2.mobile_hide');
                    // Cột 3: Nội dung tin nhắn
                    const textEl = row.querySelector('.col-xs-12.col-md-8');

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
            // --- END: SỬA LỖI ---

            const isCensored = messages.some(msg => msg.text.includes('*** ***'));

            if (isCensored) {
                logCallback(`<span class="text-yellow-400">[MessageScraper] Phát hiện nội dung bị ẩn (*** ***). Có thể proxy đã bị chặn. Thử lại với proxy khác...</span>`);
                if (browser) await browserManager.releaseBrowser(browser);
                browser = null; 
                if (attempts < maxRetries) await new Promise(resolve => setTimeout(resolve, 2000));
                continue;
            }

            logCallback(`[MessageScraper] Tìm thấy ${messages.length} tin nhắn cho ${phoneNumber}.`);
            return messages;
        } catch (error) {
            logCallback(`<span class="text-red-400">[MessageScraper] Lỗi khi lấy tin nhắn cho ${phoneNumber} (lần thử ${attempts}): ${error.message}</span>`);
            if (browser) {
                await browserManager.releaseBrowser(browser);
                browser = null;
            }
            if (attempts < maxRetries) await new Promise(resolve => setTimeout(resolve, 2000));
        } finally {
            if (browser) {
                 logCallback(`[MessageScraper] Trả lại trình duyệt sau khi lấy tin nhắn xong.`);
                 await browserManager.releaseBrowser(browser);
            }
        }
    }

    throw new Error(`Không thể lấy được tin nhắn cho ${phoneNumber} sau ${maxRetries} lần thử.`);
}


async function getCodeFromPhonePage(countrySlug, phoneNumber, service = 'instagram', maxAgeInSeconds = 300, logCallback = console.log) {
    try {
        const messages = await getMessages(countrySlug, phoneNumber, logCallback);
        
        let foundCode = null;
        let foundLatestMessage = null;
        const relevantMessages = [];

        for (const message of messages) {
            // Nếu có service, lọc theo service. Nếu không, lấy tất cả tin nhắn.
            if (!service || message.from.toLowerCase().includes(service.toLowerCase())) {
                relevantMessages.push({ 
                    from: message.from, 
                    text: message.text, 
                    time: message.time 
                });

                const messageAgeInSeconds = parseRelativeTime(message.time);
                
                if (!foundCode && messageAgeInSeconds !== null && messageAgeInSeconds <= maxAgeInSeconds) {
                    const codeMatch = message.text.match(/\b(\d{6})\b/);
                    
                    if (codeMatch && codeMatch[1]) {
                        foundCode = codeMatch[1];
                        foundLatestMessage = message.text;
                        logCallback(`[CodeFound] Dịch vụ: ${service || 'Bất kỳ'}, SĐT: ${phoneNumber}, Tin nhắn hợp lệ (${message.time}), Code: ${foundCode}`);
                    }
                }
            }
        }
        
        if (foundCode) {
            return { code: foundCode, latestMessage: foundLatestMessage, allMessages: relevantMessages };
        }

        logCallback(`[CodeNotFound] Không tìm thấy code MỚI nào (dưới ${maxAgeInSeconds}s) cho dịch vụ '${service || 'Bất kỳ'}' của SĐT ${phoneNumber}.`);
        return { code: null, allMessages: relevantMessages }; 
    } catch (error) {
        logCallback(`<span class="text-red-400">[CodeFinder] Lỗi cuối cùng khi cố gắng lấy mã: ${error.message}</span>`);
        return { code: null, allMessages: [] };
    }
}

module.exports = { scrapeAllPhoneData, getCodeFromPhonePage, getMessages };