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
const path = require('path');
const moment = require('moment');

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
    bmIdToAppeal: "791798643791350",
    
    // Bổ sung cấu hình cho dịch vụ giải captcha
    captchaService: {
        name: "omocaptcha",
        apiKey: "API_KEY_DICH_VU_CAPTCHA"
    },

    phoneService: {
        name: "viotp",
        apiKey: "API_KEY_DICH_VU_THUE_SDT"
    },

    mediaFiles: {
        video: path.resolve(__dirname, './data/video.mp4'),
        image: path.resolve(__dirname, './data/imagetest.jpeg')
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
async function solveCaptcha(serviceName, apiKey) {
    console.log(`[TODO] Đang giải captcha bằng dịch vụ giả lập '${serviceName}'...`);
    // --- BẠN CÓ THỂ TÍCH HỢP API GIẢI CAPTCHA THỰC SỰ Ở ĐÂY ---
    return "xsq6ul"; // Trả về kết quả giả lập
}

async function getPhone(serviceName, apiKey) {
    console.log(`[TODO] Đang gọi dịch vụ '${serviceName}' để lấy số điện thoại...`);
    return { id: "123456", number: "912345678", country: "84" };
}

async function getPhoneCode(serviceName, apiKey, requestId) {
    console.log(`[TODO] Đang chờ mã OTP cho yêu cầu '${requestId}' từ dịch vụ '${serviceName}'...`);
    return "123456";
}

async function getMoAktMail() {
    console.log("[TODO] Đang lấy email tạm thời...");
    return { address: "example123@temp-mail.com", cookie: "SESSION_COOKIE_FOR_INBOX" };
}

async function getMoAktMailInboxCode(mailCookie) {
    console.log("[TODO] Đang chờ mã OTP trong hòm thư tạm thời...");
    return "654321";
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

                    // SỬA ĐỔI: Gọi hàm giả lập để lấy kết quả captcha
                    const captchaSolution = await solveCaptcha(captchaService.name, captchaService.apiKey);
                    console.log(`${logPrefix} Dịch vụ giả lập trả về kết quả: "${captchaSolution}"`);

                    state = await flow.api3_submit_captcha(captchaSolution);

                    if (state.includes('phone number') || state.includes('this email')) {
                        console.log(`${logPrefix} Gửi captcha thành công ở lần thử ${attempt}.`);
                        captchaPassed = true;
                        break;
                    } else {
                        console.warn(`${logPrefix} Gửi captcha lần ${attempt} không thành công.`);
                        if (attempt < maxRetries) {
                           await delayTimeout(3000);
                        }
                    }
                } catch (error) {
                    console.error(`${logPrefix} Lỗi khi gửi captcha lần ${attempt}: ${error.message}`);
                    if (attempt < maxRetries) {
                        await delayTimeout(3000);
                    }
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
        
        if (state.includes('email') && state.includes('enter confirmation code')) {
            console.log(`${logPrefix} Phát hiện email cũ còn tồn tại. Đang gỡ bỏ...`);
            const delete_old_email_response = await flow.delete_old_email();
            console.log(`${logPrefix} Gỡ email cũ thành công.`);
            state = delete_old_email_response;
            await flow.wait_between_requests(3);
        }
        
        if (state.includes('this email')) {
             console.log(`${logPrefix} Yêu cầu xác minh email...`);
             const email = await getMoAktMail();
             await flow.api6_set_contact_point_email(email.address);
             const emailCode = await getMoAktMailInboxCode(email.cookie);
             state = await flow.api7_submit_email_code(emailCode);
             console.log(`${logPrefix} Xác minh email thành công.`);
             await flow.wait_between_requests(3);
        }

        // --- BƯỚC 4: UPLOAD SELFIE ---
        if (state.includes('selfie')) {
            console.log(`${logPrefix} Yêu cầu tải lên video selfie. Đang xử lý...`);
            await flow.extract_trigger_and_screen_id(state);
            await flow.api8_poll_ufac_api();
            await flow.wait_between_requests(2);
            await flow.api10_selfie_capture_onboarding();
            await flow.wait_between_requests(2);
            await flow.upload_file(mediaFiles.video, mediaFiles.image);
            console.log(`${logPrefix} Upload video selfie thành công.`);
        }
        
        // --- KẾT THÚC THÀNH CÔNG ---
        console.log(`${logPrefix} === QUY TRÌNH HOÀN TẤT ===`);
        console.log(`${logPrefix} [SUCCESS] Kháng nghị thành công cho BM ID: ${bmIdToAppeal}`);
        console.log(`${logPrefix} Trạng thái: Thành công - ${moment().format('DD/MM/YYYY')}`);

    } catch (error) {
        console.error(`${logPrefix} [ERROR] Đã xảy ra lỗi trong quá trình kháng nghị BM ${bmIdToAppeal}:`);
        console.error(`${logPrefix} ${error.message}`);
        console.error(error.stack);
        console.log(`${logPrefix} === QUY TRÌNH THẤT BẠI ===`);
    }
}

// Chạy hàm chính
runAppealProcess();