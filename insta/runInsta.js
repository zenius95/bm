// insta/runInsta.js
const InstagramAPIFlow = require('./autoinsta282.js');
const { createService } = require('./serviceFactory.js');
const path = require('path');
const cheerio = require('cheerio');
const fetch = require('node-fetch');
const settingsService = require('../utils/settingsService'); // <<< THÊM DÒNG NÀY
const Account = require('../models/Account.js')

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


// <<< THAY ĐỔI: Chuyển logic gọi service vào đây, không cần truyền apiKey nữa >>>
async function solveImageCaptcha(base64, serviceName, apiKey) {
    try {
        // === START: SỬA LỖI & DỌN DẸP ===
        // Bỏ đi logic kiểm tra .json thừa thãi
        const service = await createService(serviceName, 'captcha', { apiKey }, path.resolve(__dirname, 'configs'));
        // === END: SỬA LỖI & DỌN DẸP ===
        return await service.solve(base64);
    } catch (error) {
        console.error(`[ImageCaptcha] Lỗi: ${error.message}`);
        throw error;
    }
}

async function solveRecaptcha(websiteUrl, websiteKey, serviceName, apiKey) {
    try {
        const serviceId = serviceName.endsWith('.json') ? serviceName : `${serviceName}.json`;
        const service = await createService(serviceId, 'captcha', { apiKey }, path.resolve(__dirname, 'configs'));
        throw new Error("Luồng hiện tại không hỗ trợ reCAPTCHA.");
    } catch (error) {
        console.error(`[Recaptcha] Lỗi: ${error.message}`);
        throw error;
    }
}

// --- Main Logic Function ---
async function runAppealProcess(account, bmIdToAppeal, logCallback) {
    const defaultLog = (message) => console.log(`[${account.id || 'N/A'}] ${message}`);
    const log = logCallback || defaultLog;

    // <<< START: LẤY CẤU HÌNH DỊCH VỤ TỪ SETTINGS >>>
    const serviceSettings = settingsService.get('services');
    
    // Xác định dịch vụ captcha ảnh sẽ sử dụng
    const imageCaptchaService = {
        name: serviceSettings.selectedImageCaptchaService,
        apiKey: serviceSettings.apiKeys.captcha[serviceSettings.selectedImageCaptchaService] || null
    };

    // (Tương lai) Xác định dịch vụ SĐT sẽ sử dụng
    const phoneService = {
        name: serviceSettings.selectedPhoneService,
        apiKey: serviceSettings.apiKeys.phone[serviceSettings.selectedPhoneService] || null
    };
    // <<< END: LẤY CẤU HÌNH DỊCH VỤ TỪ SETTINGS >>>

    const mediaFiles = { video: path.resolve(__dirname, 'video.mp4'), image: path.resolve(__dirname, 'imagetest.jpeg') };
    
    log("Bắt đầu quy trình kháng nghị...");
    
    const flow = new InstagramAPIFlow(account.uid, account.password, account.twofa, account.proxy);
    
    log("Đang đăng nhập IG...");
    const loginResult = await flow.login(message => log(message));
    if (loginResult !== true) {
        throw new Error("Đăng nhập IG thất bại.");
    }
    log("Đăng nhập IG thành công.");
    await flow.wait_between_requests(3);

    log(`Bắt đầu xử lý cho BM: ${bmIdToAppeal}`);
    flow.set_asset_id(bmIdToAppeal);

    const restriction_details = await flow.api1_get_restriction_details();
    flow.extract_appeal_id_from_api1(restriction_details);
    await flow.wait_between_requests(3);

    const appeal_flow_response = await flow.api2_start_appeal_flow();
    flow.extract_challenge_ids_from_api2(appeal_flow_response);
    await flow.wait_between_requests(3);
    
    let state = appeal_flow_response;
        
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

                // <<< START: SỬ DỤNG DỊCH VỤ ĐÃ CẤU HÌNH >>>
                if (!imageCaptchaService.name || !imageCaptchaService.apiKey) {
                    throw new Error("Dịch vụ Captcha Ảnh chưa được cấu hình hoặc thiếu API Key.");
                }
                log(`Sử dụng dịch vụ: ${imageCaptchaService.name}`);
                const captchaSolution = await solveImageCaptcha(imageBase64, imageCaptchaService.name, imageCaptchaService.apiKey);
                // <<< END: SỬ DỤNG DỊCH VỤ ĐÃ CẤU HÌNH >>>

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
    
    // ... (Các bước còn lại của quy trình giữ nguyên) ...
    if (state.includes('confirmation code') && !state.includes('email')) {
        log("Phát hiện SĐT cũ còn tồn tại. Đang gỡ bỏ...");
        state = await flow.delete_old_phone();
        log("Gỡ số điện thoại cũ thành công.");
        await flow.wait_between_requests(3);
    }
    
    // === START: LOGIC MỚI CHO VIỆC THÊM SĐT ===
    if (state.includes('phone number')) {
        log("Yêu cầu xác minh số điện thoại...");
        if (!phoneService.name || !phoneService.apiKey) {
            throw new Error("Dịch vụ thuê số điện thoại chưa được cấu hình hoặc thiếu API Key.");
        }

        let phoneVerified = false;

        // BƯỚC 1: Thử sử dụng lại SĐT & OTP đã lưu trong DB
        if (account.lastUsedPhone && account.lastUsedPhoneCode) {
            log(`Thử sử dụng lại SĐT đã lưu trong DB: ${account.lastUsedPhone}`);
            try {
                await flow.api4_set_contact_point_phone(account.lastUsedPhone);
                log("Đã gửi SĐT cũ, đang thử gửi lại mã OTP...");
                state = await flow.api5_submit_phone_code(account.lastUsedPhoneCode);

                if (state.includes('this email') || state.includes('selfie')) {
                    log("Sử dụng lại SĐT và mã OTP đã lưu thành công!");
                    phoneVerified = true;
                } else {
                    log("Sử dụng lại SĐT/OTP đã lưu thất bại. Sẽ tiến hành lấy số mới.");
                    await Account.findByIdAndUpdate(account.id, { $set: { lastUsedPhone: null, lastUsedPhoneId: null, lastUsedPhoneCode: null } });
                }
            } catch (err) {
                log(`Lỗi khi sử dụng lại SĐT/OTP đã lưu: ${err.message}. Sẽ tiến hành lấy số mới.`);
                await Account.findByIdAndUpdate(account.id, { $set: { lastUsedPhone: null, lastUsedPhoneId: null, lastUsedPhoneCode: null } });
            }
        }

        // BƯỚC 2: Nếu dùng lại thất bại, lấy số mới (với cơ chế thử lại 3 lần)
        if (!phoneVerified) {
            for (let i = 0; i < 3; i++) {
                log(`Bắt đầu lấy SĐT mới (lần thử ${i + 1}/3)...`);
                try {

                    const res = await flow.api4_set_contact_point_phone('18068553764');

                    if (res.includes('we sent via WhatsApp')) {

                        log("Phát hiện số Whatsapp, đang chuyển sang SMS...");

                        try {
                            await flow.switch_to_sms()
                        } catch {}

                    }

                    log("Đã gửi SĐT mới lên Instagram, đang chờ mã xác nhận...");

                    await delayTimeout(5000000)

                    const phoneCode = await phoneServiceProvider.getCode(id);
                    log(`Đã nhận được mã mới: ${phoneCode}`);

                    state = await flow.api5_submit_phone_code(phoneCode);


                    if (state.includes('this email') || state.includes('selfie')) {
                        log("Xác minh SĐT mới thành công.");
                        phoneVerified = true;
                        // Lưu lại thông tin SĐT và mã vào DB cho account này
                        log(`Lưu SĐT ${phone} vào DB cho tài khoản ${account.username}`);
                        await Account.findByIdAndUpdate(account.id, {
                            $set: {
                                lastUsedPhone: phone,
                                lastUsedPhoneId: id,
                                lastUsedPhoneCode: phoneCode
                            }
                        });
                        break; 
                    } else {
                        log(`Xác minh SĐT mới lần ${i + 1} thất bại, thử lại...`);

                        if (phoneRequestId) {
                            await phoneServiceProvider.cancelPhoneNumber(phoneRequestId);
                        }

                        try {
                            log("Thử gỡ SĐT cũ...");
                            await flow.delete_old_phone();
                            log("Gỡ SĐT cũ thành công.");
                        } catch (e) {
                            log(`Gỡ SĐT cũ thất bại: ${e.message}`);
                        }
                    }
                } catch (err) {
                    log(`Thêm SĐT mới lần ${i + 1} thất bại. Lỗi: ${err.message}`);
                    try {
                        log("Thử gỡ SĐT cũ...");
                        await flow.delete_old_phone();
                        log("Gỡ SĐT cũ thành công.");
                    } catch (e) {
                        log(`Gỡ SĐT cũ thất bại: ${e.message}`);
                    }
                }
            }
        }

        if (!phoneVerified) throw new Error("Xác minh số điện thoại thất bại sau tất cả các lần thử.");
        await flow.wait_between_requests(3);
    }

    // === END: LOGIC MỚI CHO VIỆC THÊM SĐT ===
    
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
                    // Thử gỡ email cũ khi thất bại
                    try {
                        log("Thử gỡ email cũ...");
                        await flow.delete_old_email();
                        log("Gỡ email cũ thành công.");
                    } catch (e) {
                        log(`Gỡ email cũ thất bại: ${e.message}`);
                    }

                    await flow.wait_between_requests(3);
                    
                }
            } catch (err) {
                log(`Thêm email lần ${i + 1} thất bại. Lỗi: ${err.message}`);
                // Thử gỡ email cũ khi có lỗi
                try {
                    log("Thử gỡ email cũ...");
                    await flow.delete_old_email();
                    log("Gỡ email cũ thành công.");
                } catch (e) {
                    log(`Gỡ email cũ thất bại: ${e.message}`);
                }
            }
        }
        if (!emailVerified) throw new Error("Xác minh email thất bại sau 3 lần thử.");
        await flow.wait_between_requests(3);
    }

    if (state.includes('selfie')) {
        log("Yêu cầu tải lên video selfie. Đang xử lý...");
        await flow.extract_trigger_and_screen_id(state);
        await flow.api8_poll_ufac_api();
        await flow.wait_between_requests(2);
        await flow.api10_selfie_capture_onboarding();
        await flow.wait_between_requests(2);
        
        const uploadResult = await flow.upload_file(mediaFiles.video, mediaFiles.image);
        
        if (uploadResult && uploadResult.data) {
             log("🎉 Tải lên video selfie thành công!");
             return true;
        } else {
            throw new Error("Upload file không trả về kết quả mong đợi.");
        }

    } else {
        throw new Error("Quy trình dừng lại trước bước selfie. Không thể tiếp tục.");
    }
}

module.exports = { runAppealProcess };