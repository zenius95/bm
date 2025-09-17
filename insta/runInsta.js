/**
 * TỆP KỊCH BẢN ĐỘC LẬP ĐỂ CHẠY LUỒNG KHÁNG NGHỊ INSTAGRAM
 * *** PHIÊN BẢN HOÀN CHỈNH - ĐÃ SỬA LỖI KIỂM TRA ĐĂNG NHẬP ***
 * * Các chức năng chính:
 * - Tự động xử lý chuỗi proxy.
 * - Tạm thời vô hiệu hóa module giải captcha, dùng giá trị mặc định để chạy.
 * - Bao gồm logic gỡ SĐT/Email cũ để tăng độ ổn định.
 * * * Hướng dẫn sử dụng:
 * 1. Đảm bảo bạn đã có file `autoinsta282.js` trong cùng thư mục.
 * 2. Cài đặt các thư viện cần thiết: npm install moment node-fetch https-proxy-agent
 * 3. Điền đầy đủ thông tin vào mục "CONFIG" bên dưới.
 * 4. Tự triển khai logic cho các hàm giả lập (Placeholder Functions).
 * 5. Chạy tệp bằng lệnh: node runInsta_final_fixed.js
 */

const InstagramAPIFlow = require('./autoinsta282.js');
const { createService } = require('./serviceFactory.js');
const path = require('path');
const moment = require('moment');
const cheerio = require('cheerio')
const fetch = require('node-fetch')

// ===================================================================================
// CẤU HÌNH (CONFIG) - VUI LÒNG ĐIỀN ĐẦY ĐỦ THÔNG TIN CỦA BẠN
// ===================================================================================

const CONFIG = {
    account: {
        username: "oddbartender56274",
        password: "tblDrTCqKdFU",
        twofa_secret: "I2D56DHBHBOU6UDRIAWDIKC57JBYCF6J",
        id: "ACCOUNT_01"
    },
    
    // Chuỗi proxy đầy đủ (bao gồm http://user:pass@host:port).
    // Để trống hoặc đặt là null nếu không dùng proxy.
    proxy_string: "http://Xrpadl:bGErAV@171.236.161.151:12481", // ví dụ: "http://Xrpadl:bGErAV@171.236.43.135:38096"

    // ID của Business Manager (BM) cần kháng nghị
    bmIdToAppeal: "2318331278590722",
    
    // Bổ sung cấu hình cho dịch vụ giải captcha
    captchaService: {
        name: "omocaptcha_image",
        apiKey: "OMO_7GNHWXNX7H3YMSF72JMRZRDNME1OLJ2NV7UV3H8U2J2C6EB2SKBFXYEBURLUKV1757170914"
    },

    phoneService: {
        name: "viotp",
        apiKey: "API_KEY_DICH_VU_THUE_SDT"
    },

    mediaFiles: {
        video: path.resolve(__dirname, 'video.mp4'),
        image: path.resolve(__dirname, 'imagetest.jpeg')
    }
};


// ===================================================================================
// HÀM GIẢ LẬP (PLACEHOLDER FUNCTIONS) - BẠN CẦN TỰ TRIỂN KHAI LOGIC RIÊNG
// ===================================================================================

/**
 * BỔ SUNG: Hàm giả lập cho việc giải captcha.
 * @param {string} serviceName - Tên dịch vụ.
 * @param {string} apiKey - API key của dịch vụ.
 * @returns {Promise<string>} - Promise trả về kết quả captcha.
 */
async function solveCaptchaImage(base64, serviceName, apiKey) {
    
    try {

        const result = await createService(serviceName, 'captcha', {apiKey}, path.resolve(__dirname, 'configs'));

        return await result.solve(base64);

    } catch (error) {
        throw new Error(err);
        
    }


}

async function getPhone(serviceName, apiKey) {
    console.log(`[TODO] Đang gọi dịch vụ '${serviceName}' để lấy số điện thoại...`);
    return { id: "123456", number: "912345678", country: "84" };
}

async function getPhoneCode(serviceName, apiKey, requestId) {
    console.log(`[TODO] Đang chờ mã OTP cho yêu cầu '${requestId}' từ dịch vụ '${serviceName}'...`);
    return "123456";
}

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

        const raw = res.headers.raw()['set-cookie']
    
        return raw.map(entry => {
            const parts = entry.split(';')
            const cookiePart = parts[0]
            return cookiePart
        }).join(';')

    } catch {
        return false
    }
}

function getMoAktMail() {
	return new Promise(async (resolve, reject) => {
		try {

            const domains = [
                'teml.net',
                'tmpeml.com',
                'tmpbox.net',
                'moakt.cc',
                'disbox.net',
                'tmpmail.org',
                'tmpmail.net',
                'tmails.net',
                'disbox.org',
                'moakt.co',
                'moakt.ws',
                'tmail.ws',
                'bareed.ws',
            ]

            const random = Math.floor(Math.random() * domains.length);
                
            const domainName = makeid(6)+'.'+domains[random]
            

			const res = await fetch("https://moakt.com/vi/inbox", {
				"headers": {
					"accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
					"content-type": "application/x-www-form-urlencoded",
				},
				"redirect": "manual",
				"body": "domain="+domainName+"&username="+makeid(15)+"&setemail=T%E1%BA%A1o+m%E1%BB%9Bi&preferred_domain=disbox.net",
				"method": "POST"
			})

			const cookie = getCookies(res)

			const res2 = await fetch("https://moakt.com/vi/inbox", {
				"headers": {
					"accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
					"cookie": cookie,
				},
				"body": null,
				"method": "GET"
			})

			const $ = cheerio.load(await res2.text())

			const address = $('#email-address').text()

			resolve({address, cookie})

		} catch (err) {

            console.log(err)

			reject()
		}
	})
}

function getMoAktMailInboxCode(cookie) {

	return new Promise(async (resolve, reject) => {
		try {

			let code = ''

			for (let index = 0; index < 30; index++) {

                try {

                    let res = await fetch("https://moakt.com/vi/inbox", {
                        "headers": {
                            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
                            "cookie": cookie,
                        },
                        "body": null,
                        "method": "GET"
                    })

                    let $ = cheerio.load(await res.text())

                    const emails = []

                    $('td:not(#email-control):not(#email-sender) > a:not(.is_read)').each(function() {
                        const url = $(this).attr('href')

                        emails.push('https://moakt.com'+url+'/content')
                        
                    })
                        
                    const email = emails[0]

                    res = await fetch(email, {
                        "headers": {
                            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
                            "cookie": cookie,
                        },
                        "body": null,
                        "method": "GET"
                    })

                    const data = await res.text()


                    const codeMatch = data.match(/<span[^>]*>(\d{6})<\/span>/)

                    if (codeMatch[1]) {
                        code = codeMatch[1]

                        break
                    }

                } catch (err) {


                }

                await delayTimeout(3000)

			}

			if (code) {
				resolve(code)
			} else {
				reject()
			}

		} catch (err) {
			console.log(err)
			reject()
		}
	})
}

function delayTimeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


// ===================================================================================
// LUỒNG CHÍNH (MAIN FLOW)
// ===================================================================================

async function runAppealProcess() {
    const { account, proxy_string, bmIdToAppeal, captchaService, phoneService, mediaFiles } = CONFIG;
    const logPrefix = `[${account.id}]`;

    console.log(`${logPrefix} Bắt đầu quy trình kháng nghị...`);
    
    const flow = new InstagramAPIFlow(account.username, account.password, account.twofa_secret, proxy_string);

    let success = false
    
    try {
        // --- BƯỚC 1: ĐĂNG NHẬP ---
        console.log(`${logPrefix} Đang đăng nhập IG...`);
        const loginResult = await flow.login(message => console.log(`${logPrefix} ${message}`));
        if (loginResult !== true) {
            throw new Error("Đăng nhập IG thất bại. Vui lòng kiểm tra lại tài khoản, mật khẩu hoặc proxy.");
        }
        console.log(`${logPrefix} Đăng nhập IG thành công.`);
        await flow.wait_between_requests(3);

        if (!bmIdToAppeal || bmIdToAppeal.trim() === "ID_BM_DUY_NHAT_CAN_Khang") {
            throw new Error("Vui lòng cung cấp một ID BM hợp lệ trong CONFIG để kháng.");
        }

        // --- BƯỚC 2: BẮT ĐẦU LUỒNG KHÁNG NGHỊ ---
        console.log(`${logPrefix} Bắt đầu xử lý cho BM: ${bmIdToAppeal}`);
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
            console.log(`${logPrefix} Phát hiện yêu cầu Captcha.`);
            
            flow.extract_persisted_data(state);
            flow.extract_challenge_ids_from_api2(state);

            let captchaPassed = false;
            const maxRetries = 3;

            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                console.log(`${logPrefix} Bắt đầu giải captcha (lần thử ${attempt}/${maxRetries})...`);
                
                try {
                    if (attempt > 1) {
                        console.log(`${logPrefix} Thất bại, đang yêu cầu captcha mới...`);
                        const new_appeal_flow_response = await flow.api2_start_appeal_flow();
                        flow.extract_persisted_data(new_appeal_flow_response);
                        flow.extract_challenge_ids_from_api2(new_appeal_flow_response);
                        await delayTimeout(2000);
                    }

                    // SỬA ĐỔI: Lấy dữ liệu ảnh trước
                    const imageBase64 = await flow.getCaptchaAsBase64();

                    // SỬA ĐỔI: Truyền dữ liệu ảnh vào hàm giải captcha
                    const captchaSolution = await solveCaptchaImage(imageBase64, captchaService.name, captchaService.apiKey)
                    
                    console.log(`${logPrefix} Dịch vụ giả lập trả về kết quả: "${captchaSolution}"`);
                    state = await flow.api3_submit_captcha(captchaSolution);

                    if (state.includes('phone number') || state.includes('this email')) {
                        console.log(`${logPrefix} Gửi captcha thành công ở lần thử ${attempt}.`);
                        captchaPassed = true;
                        break;
                    } else {
                        console.warn(`${logPrefix} Gửi captcha lần ${attempt} không thành công.`);
                        if (attempt < maxRetries) await delayTimeout(3000);
                    }
                } catch (error) {
                    console.error(`${logPrefix} Lỗi khi gửi captcha lần ${attempt}: ${error.message}`);
                    if (attempt < maxRetries) await delayTimeout(3000);
                }
            }
            
            if (!captchaPassed) {
                throw new Error(`Giải captcha thất bại sau ${maxRetries} lần thử.`);
            }
            
            await flow.wait_between_requests(3);
        }

        
        if (state.includes('confirmation code') && !state.includes('email')) {
            console.log(`${logPrefix} Phát hiện SĐT cũ còn tồn tại. Đang gỡ bỏ...`);
            const delete_old_phone_response = await flow.delete_old_phone();
            console.log(`${logPrefix} Gỡ số điện thoại cũ thành công.`);
            state = delete_old_phone_response;
            await flow.wait_between_requests(3);
        }
        
        if (state.includes('phone number')) {
            console.log(`${logPrefix} Yêu cầu xác minh số điện thoại...`);
            let phoneVerified = false;

            for (let i = 0; i < 3; i++) {
                console.log(`${logPrefix} Đang lấy số điện thoại mới (lần ${i + 1})...`);
                try {
                    const phone = await getPhone(phoneService.name, phoneService.apiKey);
                    if (phone && phone.number) {
                        const phoneNumber = `+${phone.country}${phone.number}`;
                        console.log(`${logPrefix} Đang nhập số: ${phoneNumber}`);
                        const response = await flow.api4_set_contact_point_phone(phoneNumber);

                        if (response.includes('confirmation code')) {
                            console.log(`${logPrefix} Đang chờ mã kích hoạt SĐT...`);
                            const code = await getPhoneCode(phoneService.name, phoneService.apiKey, phone.id);
                            console.log(`${logPrefix} Đang nhập mã kích hoạt SĐT: ${code}`);
                            state = await flow.api5_submit_phone_code(code);

                            if (state.includes('this email')) {
                                console.log(`${logPrefix} Thêm số điện thoại thành công.`);
                                phoneVerified = true;
                                break;
                            }
                        } else {
                            console.log(`${logPrefix} Không thể nhập SĐT mới. Thử gỡ SĐT cũ nếu có...`);
                            try {
                                await flow.delete_old_phone();
                                console.log(`${logPrefix} Gỡ SĐT cũ thành công (trong lúc thử lại).`);
                            } catch (e) {
                                console.log(`${logPrefix} Không có SĐT cũ để gỡ hoặc gỡ thất bại.`);
                            }
                            throw new Error("Gửi SĐT mới thất bại, sẽ thử lại.");
                        }
                    }
                } catch (err) {
                    console.log(`${logPrefix} Thêm số điện thoại lần ${i + 1} thất bại. Lỗi: ${err.message}`);
                }
            }

            if (!phoneVerified) {
                throw new Error("Nhập số điện thoại thất bại sau 3 lần thử.");
            }
            await flow.wait_between_requests(3);
        }
        
        // === START: NÂNG CẤP LOGIC XÁC MINH EMAIL ===
        if (state.includes('email') && state.includes('Enter confirmation code')) {
            console.log(`${logPrefix} Phát hiện email cũ còn tồn tại. Đang gỡ bỏ...`);
            state = await flow.delete_old_email();
            console.log(`${logPrefix} Gỡ email cũ thành công.`);
            await flow.wait_between_requests(3);
        }
        
        if (state.includes('this email')) {
            console.log(`${logPrefix} Yêu cầu xác minh email...`);
            let emailVerified = false;

            for (let i = 0; i < 3; i++) {
                console.log(`${logPrefix} Đang lấy email mới (lần ${i + 1})...`);
                try {
                    const email = await getMoAktMail();


                    console.log(email)


                    console.log(`${logPrefix} Đang nhập email: ${email.address}`);

                    await flow.api6_set_contact_point_email(email.address);

                    const emailCode = await getMoAktMailInboxCode(email.cookie);
                    console.log(`${logPrefix} Đang nhập code: ${emailCode}`);
                    state = await flow.api7_submit_email_code(emailCode);

                    console.log()
                    
                    // Kiểm tra kết quả sau khi nhập code
                    if (state.includes('selfie')) {
                         console.log(`${logPrefix} Xác minh email thành công.`);
                         emailVerified = true;
                         break; // Thoát vòng lặp khi thành công
                    } else {
                        console.log(`${logPrefix} Xác minh email lần ${i + 1} thất bại, thử lại...`);
                    }
                } catch (err) {
                    console.log(`${logPrefix} Thêm email lần ${i + 1} thất bại. Lỗi: ${err.message}`);
                }
            }

            if (!emailVerified) {
                throw new Error("Xác minh email thất bại sau 3 lần thử.");
            }
            await flow.wait_between_requests(3);
        }
        // === END: NÂNG CẤP LOGIC XÁC MINH EMAIL ===

        // --- BƯỚC 4: UPLOAD SELFIE ---
        if (state.includes('selfie')) {
            console.log(`${logPrefix} Yêu cầu tải lên video selfie. Đang xử lý...`);
            await flow.extract_trigger_and_screen_id(state);
            await flow.api8_poll_ufac_api();
            await flow.wait_between_requests(2);
            await flow.api10_selfie_capture_onboarding();
            await flow.wait_between_requests(2);

            await flow.upload_file(mediaFiles.video, mediaFiles.image);

            success = true

        }
        

    } catch (error) {
        console.error(`${logPrefix} [ERROR] Đã xảy ra lỗi trong quá trình kháng nghị BM ${bmIdToAppeal}:`);
        console.error(`${logPrefix} ${error.message}`);
        console.error(error.stack);
        console.log(`${logPrefix} === QUY TRÌNH THẤT BẠI ===`);
    }

    if (success) {
        console.log('Thành công')
    }
}

// Chạy hàm chính
runAppealProcess();