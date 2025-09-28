// utils/phoneScraper.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker');
const browserManager = require('./browserManager');

puppeteer.use(StealthPlugin());
puppeteer.use(AdblockerPlugin({ blockTrackers: true }));

const BASE_URL = 'https://www.receive-sms-free.cc';

// === START: HÀM ĐƯỢC NÂNG CẤP ===
/**
 * Chuyển đổi chuỗi thời gian tương đối (vd: "2 min ago", "5 seconds ago") thành số giây.
 * @param {string} timeString - Chuỗi thời gian từ trang web.
 * @returns {number|null} - Số giây đã trôi qua, hoặc null nếu không parse được.
 */
function parseRelativeTime(timeString) {
    if (!timeString) return null;
    
    // Regex được nâng cấp để hiểu cả "min" và "minute", "sec" và "second",...
    const match = timeString.toLowerCase().match(/(\d+)\s+(sec(?:ond)?|min(?:ute)?|hou?r|day|month|year)s?/);
    if (!match) return null;

    const value = parseInt(match[1], 10);
    let unit = match[2];

    // Chuẩn hóa đơn vị để xử lý nhất quán
    if (unit.startsWith('sec')) unit = 'second';
    if (unit.startsWith('min')) unit = 'minute';
    if (unit.startsWith('h')) unit = 'hour';

    switch (unit) {
        case 'second': return value;
        case 'minute': return value * 60;
        case 'hour':   return value * 3600;
        case 'day':    return value * 86400;
        case 'month':  return value * 2592000; // 30 days
        case 'year':   return value * 31536000; // 365 days
        default: return null;
    }
}
// === END: HÀM ĐƯỢC NÂNG CẤP ===

async function scrapeAllPhoneData(configuredCountries = [], logCallback = console.log) {
    let page = null;
    try {
        logCallback(`[PhoneScraper] Mượn tab để cào danh sách SĐT...`);
        page = await browserManager.acquirePage();

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
        if (page) {
            logCallback('[PhoneScraper] Trả tab sau khi cào SĐT xong.');
            await browserManager.releasePage(page);
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
    let page = null; 
    try {
        logCallback(`[MessageScraper] Mượn tab để lấy tin nhắn cho ${phoneNumber}...`);
        page = await browserManager.acquirePage();
        
        const phoneUrl = `${BASE_URL}/Free-${countrySlug}-Phone-Number/${phoneNumber}/`;
        
        logCallback(`[MessageScraper] Truy cập: ${phoneUrl}`);
        await page.goto(phoneUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        const messages = await page.evaluate(() => {
            const msgs = [];
            document.querySelectorAll('div.casetext > div.row.border-bottom').forEach(row => {
                const fromEl = row.querySelector('.col-xs-12.col-md-2');
                const timeEl = row.querySelector('.col-xs-0.col-md-2.mobile_hide');
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
        logCallback(`[MessageScraper] Tìm thấy ${messages.length} tin nhắn cho ${phoneNumber}.`);
        return messages;
    } catch (error) {
        logCallback(`<span class="text-red-400">[MessageScraper] Lỗi khi lấy tin nhắn cho ${phoneNumber}: ${error.message}</span>`);
        return [];
    } finally {
        if (page) {
             logCallback(`[MessageScraper] Trả tab sau khi lấy tin nhắn xong.`);
             await browserManager.releasePage(page);
        }
    }
}

async function getCodeFromPhonePage(countrySlug, phoneNumber, service = 'instagram', maxAgeInSeconds = 300, logCallback = console.log) {
    const messages = await getMessages(countrySlug, phoneNumber, logCallback);
    
    let foundCode = null;
    let foundLatestMessage = null;
    const relevantMessages = [];

    for (const message of messages) {
        if (message.from.toLowerCase().includes(service.toLowerCase())) {
            relevantMessages.push({ text: message.text, time: message.time });

            const messageAgeInSeconds = parseRelativeTime(message.time);
            
            if (!foundCode && messageAgeInSeconds !== null && messageAgeInSeconds <= maxAgeInSeconds) {
                const codeMatch = message.text.match(/\b(\d{6})\b/);
                
                if (codeMatch && codeMatch[1]) {
                    foundCode = codeMatch[1];
                    foundLatestMessage = message.text;
                    logCallback(`[CodeFound] Dịch vụ: ${service}, SĐT: ${phoneNumber}, Tin nhắn hợp lệ (${message.time}), Code: ${foundCode}`);
                }
            }
        }
    }
    
    if (foundCode) {
        return { code: foundCode, latestMessage: foundLatestMessage, allMessages: relevantMessages };
    }

    logCallback(`[CodeNotFound] Không tìm thấy code MỚI nào (dưới ${maxAgeInSeconds}s) cho dịch vụ '${service}' của SĐT ${phoneNumber}.`);
    return { code: null, allMessages: relevantMessages }; 
}

module.exports = { scrapeAllPhoneData, getCodeFromPhonePage, getMessages };