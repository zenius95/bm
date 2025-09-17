// insta/runInsta.js
const InstagramAPIFlow = require('./autoinsta282.js');
const { createService } = require('./serviceFactory.js');
const path = require('path');
const cheerio = require('cheerio');
const fetch = require('node-fetch');

// --- Helper Functions (No changes) ---
function makeid(length) {
    let result = '';
    const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    let counter = 0;
    while (counter < length) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
      counter += 1;
    }
    return result;
}

function getCookies(res) {
    try {
        const raw = res.headers.raw()['set-cookie'];
        return raw.map(entry => entry.split(';')[0]).join(';');
    } catch { return false; }
}

function getMoAktMail() {
	return new Promise(async (resolve, reject) => {
		try {
            const domains = [ 'teml.net', 'tmpeml.com', 'tmpbox.net', 'moakt.cc', 'disbox.net', 'tmpmail.org', 'tmpmail.net', 'tmails.net', 'disbox.org', 'moakt.co', 'moakt.ws', 'tmail.ws', 'bareed.ws' ];
            const random = Math.floor(Math.random() * domains.length);
            const domainName = makeid(6)+'.'+domains[random];
			const res = await fetch("https://moakt.com/vi/inbox", {
				headers: { "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7", "content-type": "application/x-www-form-urlencoded" },
				redirect: "manual",
				body: "domain="+domainName+"&username="+makeid(15)+"&setemail=T%E1%BA%A1o+m%E1%BB%9Bi&preferred_domain=disbox.net",
				method: "POST"
			});
			const cookie = getCookies(res);
			const res2 = await fetch("https://moakt.com/vi/inbox", { headers: { "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7", "cookie": cookie }, method: "GET" });
			const $ = cheerio.load(await res2.text());
			const address = $('#email-address').text();
			resolve({address, cookie});
		} catch (err) { reject(err); }
	});
}

function getMoAktMailInboxCode(cookie) {
	return new Promise(async (resolve, reject) => {
		try {
			let code = '';
			for (let index = 0; index < 30; index++) {
                try {
                    let res = await fetch("https://moakt.com/vi/inbox", { headers: { "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7", "cookie": cookie }, method: "GET" });
                    let $ = cheerio.load(await res.text());
                    const emails = [];
                    $('td:not(#email-control):not(#email-sender) > a:not(.is_read)').each(function() { emails.push('https://moakt.com'+$(this).attr('href')+'/content'); });
                    if(emails.length > 0) {
                        res = await fetch(emails[0], { headers: { "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7", "cookie": cookie }, method: "GET" });
                        const data = await res.text();
                        const codeMatch = data.match(/<span[^>]*>(\d{6})<\/span>/);
                        if (codeMatch && codeMatch[1]) {
                            code = codeMatch[1];
                            break;
                        }
                    }
                } catch (err) {}
                await delayTimeout(3000);
			}
			if (code) resolve(code);
			else reject(new Error("Không lấy được mã email."));
		} catch (err) { reject(err); }
	});
}

function delayTimeout(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function solveCaptchaImage(base64, serviceName, apiKey) {
    try {
        const service = await createService(serviceName, 'captcha', { apiKey }, path.resolve(__dirname, 'configs'));
        return await service.solve(base64);
    } catch (error) {
        console.error(`[CaptchaService] Lỗi: ${error.message}`);
        throw error;
    }
}

// --- Main Logic Function ---
async function runAppealProcess(account, bmIdToAppeal, logCallback) {
    const defaultLog = (message) => console.log(`[${account.id || 'N/A'}] ${message}`);
    const log = logCallback || defaultLog;

    const captchaService = { name: "omocaptcha_image", apiKey: "OMO_7GNHWXNX7H3YMSF72JMRZRDNME1OLJ2NV7UV3H8U2J2C6EB2SKBFXYEBURLUKV1757170914" };
    const mediaFiles = { video: path.resolve(__dirname, 'video.mp4'), image: path.resolve(__dirname, 'imagetest.jpeg') };
    
    log("Bắt đầu quy trình kháng nghị...");
    
    const flow = new InstagramAPIFlow(account.username, account.password, account.twofa_secret, account.proxy_string);
    
    // --- BƯỚC 1: ĐĂNG NHẬP ---
    log("Đang đăng nhập IG...");
    const loginResult = await flow.login(message => log(message));
    if (loginResult !== true) {
        throw new Error("Đăng nhập IG thất bại. Vui lòng kiểm tra lại tài khoản, mật khẩu hoặc proxy.");
    }
    log("Đăng nhập IG thành công.");
    await flow.wait_between_requests(3);

    // --- BƯỚC 2: BẮT ĐẦU LUỒNG KHÁNG NGHỊ ---
    log(`Bắt đầu xử lý cho BM: ${bmIdToAppeal}`);
    flow.set_asset_id(bmIdToAppeal);

    const restriction_details = await flow.api1_get_restriction_details();
    flow.extract_appeal_id_from_api1(restriction_details);
    await flow.wait_between_requests(3);

    const appeal_flow_response = await flow.api2_start_appeal_flow();
    flow.extract_challenge_ids_from_api2(appeal_flow_response);
    await flow.wait_between_requests(3);
    
    let state = appeal_flow_response;
    
    // --- BƯỚC 3: XỬ LÝ CÁC THỬ THÁCH ---
    if (state.includes('persisted_data')) {
        log("Phát hiện yêu cầu Captcha.");
        flow.extract_persisted_data(state);
        flow.extract_challenge_ids_from_api2(state);

        let captchaPassed = false;
        const maxRetries = 3;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            log(`Bắt đầu giải captcha (lần thử ${attempt}/${maxRetries})...`);
            try {
                if (attempt > 1) {
                    log("Thất bại, đang yêu cầu captcha mới...");
                    const new_appeal_flow_response = await flow.api2_start_appeal_flow();
                    flow.extract_persisted_data(new_appeal_flow_response);
                    flow.extract_challenge_ids_from_api2(new_appeal_flow_response);
                    await delayTimeout(2000);
                }
                const imageBase64 = await flow.getCaptchaAsBase64();
                if (!imageBase64) throw new Error("Không thể tải ảnh captcha.");

                const captchaSolution = await solveCaptchaImage(imageBase64, captchaService.name, captchaService.apiKey);
                log(`Dịch vụ trả về kết quả: "${captchaSolution}"`);
                state = await flow.api3_submit_captcha(captchaSolution);

                if (state.includes('phone number') || state.includes('this email')) {
                    log(`Gửi captcha thành công ở lần thử ${attempt}.`);
                    captchaPassed = true;
                    break;
                } else {
                    log(`Gửi captcha lần ${attempt} không thành công.`);
                    if (attempt < maxRetries) await delayTimeout(3000);
                }
            } catch (error) {
                log(`Lỗi khi gửi captcha lần ${attempt}: ${error.message}`);
                if (attempt < maxRetries) await delayTimeout(3000);
            }
        }
        if (!captchaPassed) throw new Error(`Giải captcha thất bại sau ${maxRetries} lần thử.`);
        await flow.wait_between_requests(3);
    }

    if (state.includes('confirmation code') && !state.includes('email')) {
        log("Phát hiện SĐT cũ còn tồn tại. Đang gỡ bỏ...");
        state = await flow.delete_old_phone();
        log("Gỡ số điện thoại cũ thành công.");
        await flow.wait_between_requests(3);
    }
    
    if (state.includes('phone number')) {
        log("Yêu cầu xác minh số điện thoại... (Chức năng này đang được bỏ qua, sẽ cập nhật sau)");
    }
    
    if (state.includes('email') && state.includes('Enter confirmation code')) {
        log("Phát hiện email cũ còn tồn tại. Đang gỡ bỏ...");
        state = await flow.delete_old_email();
        log("Gỡ email cũ thành công.");
        await flow.wait_between_requests(3);
    }
    
    if (state.includes('this email')) {
        log("Yêu cầu xác minh email...");
        let emailVerified = false;
        for (let i = 0; i < 3; i++) {
            log(`Đang lấy email mới (lần ${i + 1})...`);
            try {
                const email = await getMoAktMail();
                log(`Đang nhập email: ${email.address}`);
                await flow.api6_set_contact_point_email(email.address);
                const emailCode = await getMoAktMailInboxCode(email.cookie);
                log(`Đang nhập code: ${emailCode}`);
                state = await flow.api7_submit_email_code(emailCode);
                
                if (state.includes('selfie')) {
                     log("Xác minh email thành công.");
                     emailVerified = true;
                     break;
                } else {
                    log(`Xác minh email lần ${i + 1} thất bại, thử lại...`);
                }
            } catch (err) {
                log(`Thêm email lần ${i + 1} thất bại. Lỗi: ${err.message}`);
            }
        }
        if (!emailVerified) throw new Error("Xác minh email thất bại sau 3 lần thử.");
        await flow.wait_between_requests(3);
    }

    // --- BƯỚC 4: UPLOAD SELFIE ---
    if (state.includes('selfie')) {
        log("Yêu cầu tải lên video selfie. Đang xử lý...");
        await flow.extract_trigger_and_screen_id(state);
        await flow.api8_poll_ufac_api();
        await flow.wait_between_requests(2);
        await flow.api10_selfie_capture_onboarding();
        await flow.wait_between_requests(2);

        await flow.upload_file(mediaFiles.video, mediaFiles.image);
        
        log("🎉 Tải lên video selfie thành công!");
        return true;


    } else {
        throw new Error("Quy trình dừng lại trước bước selfie. Không thể tiếp tục.");
    }
}

module.exports = { runAppealProcess };