const fetch = require('node-fetch').default;
const {resolveCaptchaImage, useProxy} = require('./core.js')
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { URLSearchParams } = require('url');
const fs = require('fs');
const FormData = require('form-data');
 
class InstagramAPIFlow {
    constructor(username, password, secret_2fa = null, ip = false) {
        this.username = username;
        this.password = password;
        this.actor_id = null;
        this.secret_2fa = secret_2fa;
 
        this.base_url = "https://i.instagram.com/api/v1";

        this.ip = ip
 
        // Session data
        this.authorization_token = null;
        this.user_id = null;
        this.device_id = uuidv4();
        this.family_device_id = uuidv4();
        this.android_id = `android-${uuidv4().replace(/-/g, '').substring(0, 16)}`;
        this.x_mid = null;
        this.ig_u_rur = null;
        this.csrftoken = null;
        this.ig_did = null; // <-- THÊM DÒNG NÀY VÀO
 
        // Fixed values
        this.bloks_version = "16e9197b928710eafdf1e803935ed8c450a1a2e3eb696bff1184df088b900bcf";
        this.app_id = "567067343352427";
        this.user_agent = "Instagram 361.0.0.46.88 Android (29/10; 560dpi; 1440x2792; samsung; SM-G960N; starlteks; samsungexynos9810; en_US; 674675098)";
        this.cuid = `cuid_${uuidv4().replace(/-/g, '')}`;
        this.x_pigeon_session_id = `UFS-${uuidv4()}`;
 
        // Challenge/flow specific values
        this.challenge_root_id = null;
        this.enrollment_id = null;
        this.appeal_id = null;
        this.session_id = null;
        this.captcha_url = null;
        this.captcha_api_key = null;
        this.persisted_data = null;
        this.latency_qpl_instance_id = null;
        this.serialized_state = null;
        this.submission_id = null;
        this.internal_infra_screen_id = null;
        this.trigger_session_id = null;
        this.internal_infra_screen_id_9 = null;
        this.authenticity_product = null;
        this.external_flow_id = null;
        this.ixt_initial_screen_id = null;
        this.challenge_root_id_8 = null;
        this.enrollment_id_8 = null;
        this.internal_latency_qpl_instance_id_8 = null;
        this.internal_latency_qpl_marker_id_8 = null;
        this.latency_qpl_instance_id = 1.08604267300007E14;
 
        // VioTP integration
        this.viotp_api_key = null;
        this.viotp_phone_number = null;
        this.viotp_request_id = null;
 
        // Tempmail integration
        this.tempmail_email = null;
        this.tempmail_token = null;
 
    }

    async session(url, options = {}, proxy = false) {
        // Wrapper method for fetch with proper agent handling
        const fetchOptions = {
            ...options,
        };

        if (this.ip) {

            fetchOptions.agent = useProxy(this.ip)
        }

        
        return await fetch(url, fetchOptions);
    }

    async set_asset_id(id) {
        this.actor_id = id;

        if (!this.actor_id || !/^\d+$/.test(this.actor_id)) {
            throw new Error("actor_id must be a valid numeric business ID");
        }
    }
 
    async get_public_key() {
        const url = `${this.base_url}/qe/sync/`;
        const headers = { "User-Agent": this.user_agent };
        const resp = await this.session(url, { headers });
 
        const publicKeyId = parseInt(resp.headers.get("ig-set-password-encryption-key-id") || "1", 10);
        const publicKey = resp.headers.get("ig-set-password-encryption-pub-key") || "";
        return { publicKeyId, publicKey };
    }
 
    async encrypt_password() {
        const { publicKeyId, publicKey } = await this.get_public_key();
 
        if (!publicKey) {
            throw new Error("Could not get public key.");
        }
 
        const sessionKey = crypto.randomBytes(32);
        const iv = crypto.randomBytes(12);
        const timestamp = Math.floor(Date.now() / 1000).toString();
 
        const decodedKey = Buffer.from(publicKey, 'base64');
 
        const rsaEncrypted = crypto.publicEncrypt(
            {
                key: decodedKey,
                padding: crypto.constants.RSA_PKCS1_PADDING,
            },
            sessionKey
        );
 
        const cipher = crypto.createCipheriv('aes-256-gcm', sessionKey, iv);
        cipher.setAAD(Buffer.from(timestamp));
        const aesEncrypted = Buffer.concat([cipher.update(this.password, 'utf8'), cipher.final()]);
        const tag = cipher.getAuthTag();
 
        const publicKeyIdBytes = Buffer.alloc(1);
        publicKeyIdBytes.writeUInt8(publicKeyId, 0);
 
        const rsaEncryptedLenBytes = Buffer.alloc(2);
        rsaEncryptedLenBytes.writeUInt16LE(rsaEncrypted.length, 0);
 
        const payload = Buffer.concat([
            Buffer.from([0x01]),
            publicKeyIdBytes,
            iv,
            rsaEncryptedLenBytes,
            rsaEncrypted,
            tag,
            aesEncrypted,
        ]);
 
        return `#PWD_INSTAGRAM:4:${timestamp}:${payload.toString('base64')}`;
    }
 
    async generate_otp() {
        const url = `https://2fa.live/tok/${this.secret_2fa}`;
        const headers = {
            'accept': '*/*',
            'accept-language': 'vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5',
            'if-none-match': 'W/"12-5YGFZWjJke9EIbF4vPWrjZ9R9Is"',
            'priority': 'u=1, i',
            'referer': 'https://2fa.live/',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
            'x-requested-with': 'XMLHttpRequest'
        };
        const response = await this.session(url, { headers });
        const data = await response.json();
        return data.token;
    }
 
    extract_session_data(response_headers) {
 
        this.authorization_token = (response_headers.get("ig-set-authorization") || "").replace("Bearer ", "");
        this.user_id = response_headers.get("ig-set-ig-u-ds-user-id") || "";
        this.x_mid = response_headers.get("ig-set-x-mid") || "";
        this.ig_u_rur = response_headers.get("ig-set-ig-u-rur") || "";
 
        if (!this.authorization_token || !this.user_id) {
            console.warn("Warning: Missing essential session data from login response");
            console.log(`Available headers: ${Array.from(response_headers.keys())}`);
        }
 
        console.log("Extracted session data:");
        console.log(`Authorization: ${this.authorization_token ? this.authorization_token : "None"}`);
        console.log(`User ID: ${this.user_id}`);
        console.log(`X-MID: ${this.x_mid}`);
        console.log(`IG-U-RUR: ${this.ig_u_rur ? this.ig_u_rur + '...' : "None"}`);
    }
 
    async login(message) {
        try {
            const encrypt_password = await this.encrypt_password();
 
            const headers = {
                'x-ig-app-locale': 'en-US',
                'x-ig-device-locale': 'en-US',
                'x-ig-mapped-locale': 'en-US',
                'x-pigeon-session-id': this.x_pigeon_session_id,
                'x-pigeon-rawclienttime': (Date.now() / 1000).toString(),
                'x-ig-bandwidth-speed-kbps': '10400.000',
                'x-ig-bandwidth-totalbytes-b': '0',
                'x-ig-bandwidth-totaltime-ms': '0',
                'x-bloks-version-id': this.bloks_version,
                'x-ig-www-claim': '0',
                'x-bloks-prism-button-version': 'CONTROL',
                'x-bloks-prism-colors-enabled': 'false',
                'x-bloks-prism-ax-base-colors-enabled': 'false',
                'x-bloks-prism-font-enabled': 'false',
                'x-bloks-is-layout-rtl': 'false',
                'x-ig-device-id': this.device_id,
                'x-ig-family-device-id': this.family_device_id,
                'x-ig-android-id': this.android_id,
                'x-ig-timezone-offset': '25200',
                'x-ig-nav-chain': 'com.bloks.www.caa.login.login_homepage:com.bloks.www.caa.login.login_homepage:1:button:1737175594.533::',
                'x-fb-connection-type': 'WIFI',
                'x-ig-connection-type': 'WIFI',
                'x-ig-capabilities': '3brTv10=',
                'x-ig-app-id': this.app_id,
                'priority': 'u=3',
                'user-agent': this.user_agent,
                'accept-language': 'vi-VN, en-US',
                'ig-intended-user-id': '0',
                'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'x-fb-http-engine': 'Liger',
                'x-fb-client-ip': 'True',
                'x-fb-server-cluster': 'True'
            };
 
            const data = {
                'params': JSON.stringify({
                    'client_input_params': {
                        'sim_phones': [],
                        'secure_family_device_id': '',
                        'has_granted_read_contacts_permissions': 0,
                        'auth_secure_device_id': '',
                        'has_whatsapp_installed': 0,
                        'password': encrypt_password,
                        'sso_token_map_json_string': '',
                        'event_flow': 'login_manual',
                        'password_contains_non_ascii': 'false',
                        'client_known_key_hash': '',
                        'encrypted_msisdn': '',
                        'has_granted_read_phone_permissions': 0,
                        'app_manager_id': '',
                        'should_show_nested_nta_from_aymh': 0,
                        'device_id': this.android_id,
                        'login_attempt_count': 1,
                        'machine_id': null,
                        'flash_call_permission_status': {
                            'READ_PHONE_STATE': 'DENIED',
                            'READ_CALL_LOG': 'DENIED',
                            'ANSWER_PHONE_CALLS': 'DENIED'
                        },
                        'accounts_list': [],
                        'family_device_id': this.family_device_id,
                        'fb_ig_device_id': [],
                        'device_emails': [],
                        'try_num': 2,
                        'lois_settings': {
                            'lois_token': ''
                        },
                        'event_step': 'home_page',
                        'headers_infra_flow_id': '',
                        'openid_tokens': {},
                        'contact_point': this.username
                    },
                    'server_params': {
                        'should_trigger_override_login_2fa_action': 0,
                        'is_from_logged_out': 0,
                        'should_trigger_override_login_success_action': 0,
                        'login_credential_type': 'none',
                        'server_login_source': 'login',
                        'waterfall_id': uuidv4(),
                        'login_source': 'Login',
                        'is_platform_login': 0,
                        'INTERNAL__latency_qpl_marker_id': 36707139,
                        'offline_experiment_group': 'caa_iteration_v3_perf_ig_4',
                        'is_from_landing_page': 0,
                        'password_text_input_id': 'phug4p:100',
                        'is_from_empty_password': 0,
                        'is_from_msplit_fallback': 0,
                        'ar_event_source': 'login_home_page',
                        'qe_device_id': uuidv4(),
                        'username_text_input_id': 'phug4p:99',
                        'layered_homepage_experiment_group': null,
                        'device_id': this.android_id,
                        'INTERNAL__latency_qpl_instance_id': 1.54162845700187E14,
                        'reg_flow_source': 'login_home_native_integration_point',
                        'is_caa_perf_enabled': 1,
                        'credential_type': 'password',
                        'is_from_password_entry_page': 0,
                        'caller': 'gslr',
                        'family_device_id': this.family_device_id,
                        'is_from_assistive_id': 0,
                        'access_flow_version': 'F2_FLOW',
                        'is_from_logged_in_switcher': 0
                    }
                }),
                'bk_client_context': JSON.stringify({
                    "bloks_version": this.bloks_version,
                    "styles_id": "instagram"
                }),
                'bloks_versioning_id': this.bloks_version
            };
 
            const body = new URLSearchParams(data).toString();
            const url = 'https://i.instagram.com/api/v1/bloks/apps/com.bloks.www.bloks.caa.login.async.send_login_request/';
 
            const response = await this.session(url, { method: 'POST', headers, body });
            const responseText = await response.text();
 
            if (responseText.includes("two_step_verification_context") || responseText.includes("two_factor_required")) {

                message("Đang nhập 2FA");

                const handle_2fa = await this.handle_2fa(responseText);

                if (handle_2fa) {
                    return true;
                } else {

                    throw new Error('Nhập 2FA thất bại')

                }
            }
 
            if (responseText.includes('Bearer IGT:2:ey')) {
                console.log("Login successful!");
                this.extract_session_data_from_response(responseText);
                return true;
            } else {
                console.log("Login failed!", responseText);
                return false;
            }
 
        } catch (e) {
            throw new Error(e.message)
        }
    }
 
    async handle_2fa(response_text) {
        if (!this.secret_2fa) {
            console.log("No 2FA secret provided, cannot continue login.");
            return false;
        }
 
        try {


            const two_step_verification_context = this.extract_two_step_verification_context(response_text);
            

            if (!two_step_verification_context) {
                console.log("Could not extract two_step_verification_context");
                return false;
            }
 
            await new Promise(resolve => setTimeout(resolve, 3000));
 
            const otp_code = await this.generate_otp();

            console.log(`Generated OTP: ${otp_code}`);
 
            const headers = {
                "x-ig-app-locale": "en_US",
                "x-ig-device-locale": "en_US",
                "x-ig-mapped-locale": "en_US",
                "x-pigeon-session-id": this.x_pigeon_session_id,
                "x-pigeon-rawclienttime": (Date.now() / 1000).toString(),
                "x-ig-bandwidth-speed-kbps": "-1.000",
                "x-ig-bandwidth-totalbytes-b": "0",
                "x-ig-bandwidth-totaltime-ms": "0",
                "x-bloks-version-id": this.bloks_version,
                "x-ig-www-claim": "0",
                "x-bloks-prism-button-version": "CONTROL",
                "x-bloks-prism-colors-enabled": "false",
                "x-bloks-prism-ax-base-colors-enabled": "false",
                "x-bloks-prism-font-enabled": "false",
                "x-bloks-is-layout-rtl": "false",
                "x-ig-device-id": this.device_id,
                "x-ig-family-device-id": this.family_device_id,
                "x-ig-android-id": this.android_id,
                "x-ig-timezone-offset": "25200",
                "x-ig-nav-chain": `com.bloks.www.caa.login.login_homepage:com.bloks.www.caa.login.login_homepage:1:button:1757326284.139::,IgCdsScreenNavigationLoggerModule:com.bloks.www.two_step_verification.entrypoint:2:button:1757326311.131::`,
                "x-fb-connection-type": "WIFI",
                "x-ig-connection-type": "WIFI",
                "x-ig-capabilities": "3brTv10=",
                "x-ig-app-id": this.app_id,
                "priority": "u=3",
                "user-agent": this.user_agent,
                "accept-language": "en-US",
                "x-mid": this.x_mid || "aL6rywABAAE4A5YshZg3h_--xUd3",
                "ig-intended-user-id": "0",
                "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                "x-fb-http-engine": "Liger",
                "x-fb-client-ip": "True",
                "x-fb-server-cluster": "True"
            };
 
            const params = {
                "client_input_params": {
                    "auth_secure_device_id": "",
                    "block_store_machine_id": "",
                    "code": otp_code,
                    "should_trust_device": 1,
                    "family_device_id": this.device_id,
                    "device_id": this.android_id,
                    "cloud_trust_token": null,
                    "machine_id": this.x_mid || "aL6rywABAAE4A5YshZg3h_--xUd3"
                },
                "server_params": {
                    "INTERNAL__latency_qpl_marker_id": 36707139,
                    "block_store_machine_id": null,
                    "device_id": this.device_id,
                    "cloud_trust_token": null,
                    "challenge": "totp",
                    "machine_id": null,
                    "INTERNAL__latency_qpl_instance_id": 2.09902706200318E14,
                    "two_step_verification_context": two_step_verification_context,
                    "flow_source": "two_factor_login"
                }
            };
 
            const bk_client_context = {
                "bloks_version": this.bloks_version,
                "styles_id": "instagram"
            };
 
            const payload = new URLSearchParams({
                params: JSON.stringify(params),
                bk_client_context: JSON.stringify(bk_client_context),
                bloks_versioning_id: this.bloks_version
            }).toString();
 
            const url = "https://i.instagram.com/api/v1/bloks/apps/com.bloks.www.two_step_verification.verify_code.async/";

            const response = await this.session(url, { method: 'POST', headers, body: payload });
            const responseText = await response.text();
 
            const decodedResponseText = this.decode_multiple_unescapes(responseText);
 
            if (decodedResponseText.includes('Bearer IGT:2:ey')) {
                console.log("2FA authentication successful!");
 
                this.extract_session_data_from_response(decodedResponseText);
                return true;
            } else {
                console.log("2FA authentication failed!");
                return false;
            }
 
        } catch (e) {
            console.error(`❌ 2FA error: ${e}`);
            return false;
        }
    }
 
    extract_two_step_verification_context(responseText) {
        let data;
        try {
            // Tương đương với json.loads trong Python
            data = JSON.parse(responseText);
        } catch (e) {
            console.error(`Lỗi parse JSON: ${e.message}`);
            return null;
        }
 
        // Tương đương data.get('layout', {})... dùng Optional Chaining (?.) trong JS
        // Chú ý: các key có ký tự đặc biệt như '㐟' hay '#' phải dùng dấu ngoặc vuông []
        const action = data?.layout?.bloks_payload?.tree?.['㐟']?.['#'];
        if (!action) {
            console.log("Không tìm thấy trường 'action' trong tree");
            return null;
        }
 
        // Regex 1: Chuyển đổi từ pattern Python
        // Tìm mảng key cố định và lấy giá trị đầu tiên trong mảng value ngay sau đó
        const pattern = new RegExp(
            '\\(bk\\.action\\.array\\.Make\\s*,\\s*\\"two_step_verification_context\\"\\s*,\\s*\\"flow_source\\"\\s*,\\s*\\"device_id\\"\\s*,\\s*\\"family_device_id\\"\\s*,\\s*\\"INTERNAL_INFRA_screen_id\\"\\s*\\)\\s*,\\s*\\(bk\\.action\\.array\\.Make\\s*,\\s*\\"([^\\"]+)\\"\\s*,'
        );
 
        let match = action.match(pattern);
        if (match && match[1]) {
            // match[1] tương đương match.group(1) trong Python
            return match[1];
        }
 
        // Regex 2 (Dự phòng): Tương đương pattern_fallback
        // Chú ý flag 's' (dotAll) để khớp với re.DOTALL trong Python
        const patternFallback = new RegExp(
            '\\(bk\\.action\\.map\\.Make\\s*,\\s*\\(bk\\.action\\.array\\.Make\\s*,\\s*\\"two_step_verification_context\\".*?\\),\\s*\\(bk\\.action\\.array\\.Make\\s*,\\s*\\"([^\\"]+)\\"\\s*,',
            's'
        );
 
        let matchFallback = action.match(patternFallback);
        if (matchFallback && matchFallback[1]) {
            return matchFallback[1];
        }
 
        console.log("Không tìm thấy two_step_verification_context trong trường 'action'");
        return null;
    }
 
    decodeMultipleUnescapes(text) {
        let previousText;
        let currentText = text;
        // Vòng lặp sẽ chạy cho đến khi chuỗi không thay đổi nữa sau một lượt replace
        do {
            previousText = currentText;
            // Gỡ bỏ các dấu backslash bị escape (e.g., \\ -> \)
            // và các dấu ngoặc kép bị escape (e.g., \" -> ")
            currentText = previousText.replace(/\\\\/g, '\\').replace(/\\"/g, '"');
        } while (currentText !== previousText);
        return currentText;
    }
 
    extract_session_data_from_response(responseText) {
        try {
            // 1. Decode chuỗi response để xử lý các escape lồng nhau
            const decodedResponse = this.decodeMultipleUnescapes(responseText);
 
            // 3. Dùng regex để trích xuất từng phần dữ liệu
            // Extract authorization token
            let authMatch = decodedResponse.match(/"IG-Set-Authorization":\s*"([^"]+)"/);
            if (authMatch && authMatch[1]) {
                this.authorization_token = authMatch[1].replace('Bearer ', '');
            }
 
            // Extract user ID
            let userIdMatch = decodedResponse.match(/"ig-set-ig-u-ds-user-id":\s*(\d+)/);
            if (userIdMatch && userIdMatch[1]) {
                this.user_id = userIdMatch[1];
            }
 
            // Extract ig-u-rur
            let rurMatch = decodedResponse.match(/"ig-set-ig-u-rur":\s*"([^"]+)"/);
            if (rurMatch && rurMatch[1]) {
                this.ig_u_rur = rurMatch[1];
            }
 
            // Extract x-ig-set-www-claim
            let claimMatch = decodedResponse.match(/"x-ig-set-www-claim":\s*"([^"]+)"/);
            if (claimMatch && claimMatch[1]) {
                this.x_mid = claimMatch[1];
            }
 
            // Extract csrftoken from cookies
            let csrfMatch = decodedResponse.match(/csrftoken=([^;]+)/);
            if (csrfMatch && csrfMatch[1]) {
                this.csrftoken = csrfMatch[1];
            }
            console.log("✅ Trích xuất dữ liệu session thành công:");
            console.log(`Authorization: ${this.authorization_token ? this.authorization_token.substring(0, 50) + '...' : 'None'}`);
            console.log(`User ID: ${this.user_id}`);
            console.log(`IG-U-RUR: ${this.ig_u_rur}`);
            console.log(`X-MID: ${this.x_mid}`);
            console.log(`CSRF Token: ${this.csrftoken}`);
 
            return true;
 
        } catch (e) {
            console.error(`❌ Lỗi khi trích xuất dữ liệu session: ${e.message}`);
            return null;
        }
    }
 
    decode_multiple_unescapes(s) {
        let prev = '';
        while (s !== prev) {
            prev = s;
            try {
                s = JSON.parse(`"${s.replace(/"/g, '"')}"`);
            } catch (e) {
                // ignore
            }
        }
        return s;
    }
 
    update_rur_from_response(response) {
        if (response.headers && response.headers.get('ig-set-ig-u-rur')) {
            this.ig_u_rur = response.headers.get('ig-set-ig-u-rur');
            console.log(`Updated IG-U-RUR: ${this.ig_u_rur.substring(0, 50)}...`);
        }
    }
 
    extract_captcha_url_from_response(response_data) {
        try {
            const response_str = JSON.stringify(response_data);
            const captcha_patterns = [
                /https:\/\/www\.facebook\.com\/captcha\/tfbimage\/[^"\']+/,
                /https:\/\/[^"\\]*facebook[^"\\]*captcha[^"\\]*/,
                /captcha[^"\\]*https:\/\/[^"\\]*/,
            ];
 
            for (const pattern of captcha_patterns) {
                const matches = response_str.match(pattern);
                if (matches) {
                    this.captcha_url = matches[0];
                    console.log(`📷 Found captcha URL: ${this.captcha_url}`);
                    return this.captcha_url;
                }
            }
 
            console.log("⚠️ No captcha URL found in response");
            return null;
        } catch (e) {
            console.error(`Error extracting captcha URL: ${e}`);
            return null;
        }
    }
 
    async download_captcha_image() {
        if (!this.captcha_url) {
            console.log("❌ No captcha URL available");
            return null;
        }
 
        try {
            console.log("📥 Downloading captcha image...");
            const response = await this.session(this.captcha_url, { agent: this.agent });
 
            if (response.ok) {
                const image_buffer = await response.buffer();
                const image_base64 = image_buffer.toString('base64');
                console.log("✅ Captcha image downloaded and converted to base64");
                return image_base64;
            } else {
                console.log(`❌ Failed to download captcha image: ${response.status}`);
                return null;
            }
        } catch (e) {
            console.error(`❌ Error downloading captcha: ${e}`);
            return null;
        }
    }
 
    async solve_captcha_with_api(captcha_api_service, captcha_api_key, image_base64) {
        
        if (!captcha_api_key || !image_base64) {
            console.log("❌ Missing captcha API key or image data");
            return null;
        }

        if (captcha_api_service === 'omocaptcha') {
 
            try {
                const url = "https://api.omocaptcha.com/v2/createTask";
                const headers = { 'Content-Type': 'application/json' };
                const data = {
                    "clientKey": captcha_api_key,
                    "task": {
                        "type": "ImageToTextTask",
                        "imageBase64": image_base64,
                        "module": "module_1"
                    }
                };
    
                console.log("🤖 Solving captcha with API...");
                let response = await this.session(url, { method: 'POST', headers, body: JSON.stringify(data), agent: this.agent });
                let result = await response.json();
    
                if (response.ok) {
                    const taskID = result.taskId;
                    await new Promise(resolve => setTimeout(resolve, 10000));
                    const urlresult = "https://api.omocaptcha.com/v2/getTaskResult";
                    const payload = JSON.stringify({ clientKey: captcha_api_key, taskId: taskID });
    
                    response = await this.session(urlresult, { method: 'POST', headers, body: payload });
                    result = await response.json();
    
                    if (result.solution && result.solution.text) {
                        const captcha_result = result.solution.text;
                        console.log(`✅ Captcha solved: ${captcha_result}`);
                        return captcha_result;
                    } else {
                        console.log(`❌ Captcha API failed: ${result.message || 'Unknown error'}`);
                        return null;
                    }
                } else {
                    console.log(`❌ Captcha API request failed: ${response.status}`);
                    return null;
                }
            } catch (e) {
                console.error(`❌ Error solving captcha: ${e}`);
                return null;
            }

        } else {

            try {

                await resolveCaptchaImage({
                    captchaServiceKey: {value: captcha_api_key},
                    captchaService: {value: captcha_api_service},
                }, image_base64)

            } catch (e) {
                console.error(`❌ Error solving captcha: ${e}`);
                return null;
            }

        }
    }
 
    async get_captcha_solution(captcha_api_service = null, captcha_api_key = null) {
        if (!captcha_api_key) {
            captcha_api_key = this.captcha_api_key;
        }
 
        if (!captcha_api_key) {
            console.log("⚠️ No captcha API key provided, using default code");
            return "xsq6ul";
        }
 
        const image_base64 = await this.download_captcha_image();
        if (!image_base64) {
            console.log("⚠️ Could not download captcha, using default code");
            return "xsq6ul";
        }
 
        const captcha_solution = await this.solve_captcha_with_api(captcha_api_service, captcha_api_key, image_base64);
        
        if (!captcha_solution) {
            console.log("⚠️ Could not solve captcha, using default code");
            return "xsq6ul";
        }
 
        return captcha_solution;
    }

 
    async api3_submit_captcha_with_retry(captcha_api_service = null, captcha_api_key = null, max_retries = 5) {


        for (let attempt = 0; attempt < max_retries; attempt++) {
            console.log(`🔄 Captcha attempt ${attempt + 1}/${max_retries}`);
            try {
                if (attempt > 0) {
                    console.log("🔄 Retrying with new captcha...");

                    await this.api2_start_appeal_flow();

                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
 
                let captcha_response;
                if (captcha_api_key) {
                    captcha_response = await this.get_captcha_solution(captcha_api_service, captcha_api_key);
                }
 
                if (!captcha_response) {
                    console.log("❌ No captcha response provided");
                    continue;
                }
 
                const api3_response = await this.api3_submit_captcha(captcha_response, captcha_api_key);
 
                if (api3_response.includes('phone number') || api3_response.includes('this email')) {
                    console.log(`✅ Captcha solved successfully on attempt ${attempt + 1}`);
                    return api3_response;
                } else {
                    console.log(`❌ Captcha failed on attempt ${attempt + 1}`);
                    if (attempt < max_retries - 1) {
                        console.log("🔄 Retrying with new captcha...");
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    }
                }

            } catch (e) {
                console.error(`❌ Error on captcha attempt ${attempt + 1}: ${e}`);
                if (attempt < max_retries - 1) {
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
            }
        }
        throw new Error(`Giải captcha thất bại`);
    }
 
    async create_tempmail_email() {
        try {
            const url = "https://api.tempmail.lol/v2/inbox/create";
            const headers = {
                'accept': '*/*',
                'accept-language': 'vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5',
                'content-type': 'application/json',
                'origin': 'https://tempmail.lol',
                'priority': 'u=1, i',
                'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-site',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
            };
            const payload = JSON.stringify({ domain: null, captcha: null });
 
            console.log("📧 Creating temporary email...");
            const response = await this.session(url, { method: 'POST', headers, body: payload, agent: this.agent });
 
            if (response.status === 201) {
                const result = await response.json();
                const { address, token } = result;
                if (address && token) {
                    console.log(`✅ Created email: ${address}`);
                    console.log(`🔑 Token: ${token.substring(0, 20)}...`);
                    this.tempmail_email = address;
                    this.tempmail_token = token;
                    return [address, token];
                } else {
                    console.log("❌ Invalid response data from tempmail API");
                    return [null, null];
                }
            } else {
                console.log(`❌ Tempmail API failed: ${response.status}`);
                console.log(`Response: ${await response.text()}`);
                return [null, null];
            }
        } catch (e) {
            console.error(`❌ Error creating tempmail: ${e}`);
            return [null, null];
        }
    }
 
    async get_tempmail_code(token, max_attempts = 10, delay = 3) {
        if (!token) {
            console.log("❌ No tempmail token provided");
            return null;
        }
 
        try {
            const url = `https://api.tempmail.lol/v2/inbox?token=${token}`;
            const headers = {
                'accept': '*/*',
                'accept-language': 'vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5',
                'origin': 'https://tempmail.lol',
                'priority': 'u=1, i',
                'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-site',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
            };
 
            console.log(`📨 Polling for email code (max ${max_attempts} attempts, ${delay}s delay)...`);
 
            for (let attempt = 0; attempt < max_attempts; attempt++) {
                console.log(`🔄 Email polling attempt ${attempt + 1}/${max_attempts}`);
                try {
                    const response = await this.session(url, { headers, agent: this.agent });
                    if (response.ok) {
                        const result = await response.json();
                        const emails = result.emails || [];
                        if (emails.length > 0) {
                            const latest_email = emails[0];
                            const { body, subject } = latest_email;
                            console.log(`📧 Found email - Subject: ${subject}`);
                            const code_match = body.match(/\d{6}/);
                            if (code_match) {
                                const verification_code = code_match[0];
                                console.log(`✅ Found verification code: ${verification_code}`);
                                console.log(`📄 Email body preview: ${body.substring(0, 100)}...`);
                                return verification_code;
                            } else {
                                console.log(`⏳ No 6-digit code found in email (attempt ${attempt + 1})`);
                            }
                        } else {
                            console.log(`⏳ No emails yet (attempt ${attempt + 1})`);
                        }
                    } else {
                        console.log(`❌ Email API request failed: ${response.status}`);
                    }
                } catch (e) {
                    console.log(`⏳ Email polling error (attempt ${attempt + 1}): ${e}`);
                }
                if (attempt < max_attempts - 1) {
                    await new Promise(resolve => setTimeout(resolve, delay * 1000));
                }
            }
            console.log(`❌ No email code received after ${max_attempts} attempts`);
            return null;
        } catch (e) {
            console.error(`❌ Error getting email code: ${e}`);
            return null;
        }
    }
 
    get_common_headers() {
        return {
            "x-ig-app-locale": "en_US",
            "x-ig-device-locale": "en_US",
            "x-ig-mapped-locale": "en_US",
            "x-pigeon-session-id": `UFS-${uuidv4()}`,
            "x-pigeon-rawclienttime": (Date.now() / 1000).toString(),
            "x-ig-bandwidth-speed-kbps": "1774.000",
            "x-ig-bandwidth-totalbytes-b": "2747425",
            "x-ig-bandwidth-totaltime-ms": "2258",
            "x-bloks-version-id": this.bloks_version,
            "x-ig-www-claim": this.x_mid,
            "x-bloks-prism-button-version": "CONTROL",
            "x-bloks-prism-colors-enabled": "false",
            "x-bloks-prism-ax-base-colors-enabled": "false",
            "x-bloks-prism-font-enabled": "false",
            "x-bloks-is-layout-rtl": "false",
            "x-ig-device-id": this.device_id,
            "x-ig-family-device-id": this.family_device_id,
            "x-ig-android-id": this.android_id,
            "x-ig-timezone-offset": "25200",
            "x-fb-connection-type": "WIFI",
            "x-ig-connection-type": "WIFI",
            "x-ig-capabilities": "3brTv10=",
            "x-ig-app-id": this.app_id,
            "priority": "u=3",
            "user-agent": this.user_agent,
            "accept-language": "en-US",
            "authorization": `Bearer ${this.authorization_token}`,
            "x-mid": this.x_mid,
            "ig-u-ds-user-id": this.user_id,
            "ig-u-rur": this.ig_u_rur,
            "ig-intended-user-id": this.user_id,
            "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
            "x-fb-http-engine": "Liger",
            "x-fb-client-ip": "True",
            "x-fb-server-cluster": "True",
        };
    }
 
    get_graphql_headers() {
        return {
            "x-fb-request-analytics-tags": '{"network_tags":{"product":"567067343352427","purpose":"fetch","request_category":"graphql","retry_attempt":"0"}}',
            "x-ig-device-id": this.device_id,
            "ig-u-rur": this.ig_u_rur,
            "x-tigon-is-retry": "False",
            "content-type": "application/x-www-form-urlencoded",
            "x-graphql-request-purpose": "fetch",
            "ig-intended-user-id": this.user_id,
            "x-fb-friendly-name": "IGBloksAppRootQuery",
            "ig_legacy_dict_validate_null": "true",
            "x-mid": this.x_mid,
            "ig-u-ds-user-id": this.user_id,
            "x-fb-rmd": "state=URL_ELIGIBLE",
            "x-ig-app-id": this.app_id,
            "x-ig-capabilities": "3brTv10=",
            "x-graphql-client-library": "pando",
            "authorization": `Bearer ${this.authorization_token}`,
            "x-root-field-name": "bloks_app",
            "user-agent": this.user_agent,
            "x-fb-http-engine": "Tigon/Liger",
            "x-fb-client-ip": "True",
            "x-fb-server-cluster": "True",
        };
    }

    async delete_old_email() {

        try {

            let success = false

            const url = "https://i.instagram.com/api/v1/bloks/async_action/com.bloks.www.checkpoint.ufac.contact_point.unset/";
            const headers = this.get_common_headers();
    
            const data = new URLSearchParams({
                'params': JSON.stringify({
                    "client_input_params":{},
                    "server_params":{
                        "INTERNAL__latency_qpl_instance_id": this.latency_qpl_instance_id,
                        "challenge_root_id": this.challenge_root_id,
                        "xfac_context": '{"use_xmds":true}',
                        "enrollment_id": this.enrollment_id
                    }
                }),
                '_uuid': '63da47d2-5663-42d8-94a6-b0121732a963',
                'bk_client_context': '{"bloks_version":"16e9197b928710eafdf1e803935ed8c450a1a2e3eb696bff1184df088b900bcf","styles_id":"instagram"}',
                'bloks_versioning_id': '16e9197b928710eafdf1e803935ed8c450a1a2e3eb696bff1184df088b900bcf'
            }).toString();

    
            const response = await this.session(url, { method: 'POST', headers, body: data, agent: this.agent });
            const responseData = await response.text();

            if (responseData.includes('this email')) {

                success = true

            }

            if (!success) {

                throw new Error('Không thể gỡ email cũ')

            } else {

                return responseData

            }

        } catch (error) {
            throw error;
        }

    }

    async delete_old_phone() {

        try {

            let success = false

            const url = "https://i.instagram.com/api/v1/bloks/async_action/com.bloks.www.checkpoint.ufac.contact_point.unset/";
            const headers = this.get_common_headers();
    
            const data = new URLSearchParams({
                'params': JSON.stringify({
                    "client_input_params":{},
                    "server_params":{
                        "INTERNAL__latency_qpl_marker_id": 36707139,
                        "INTERNAL__latency_qpl_instance_id": this.latency_qpl_instance_id,
                        "challenge_root_id": this.challenge_root_id,
                        "xfac_context": '{"use_xmds":true}',
                        "enrollment_id": this.enrollment_id
                    }
                }),
                '_uuid': '63da47d2-5663-42d8-94a6-b0121732a963',
                'bk_client_context': '{"bloks_version":"16e9197b928710eafdf1e803935ed8c450a1a2e3eb696bff1184df088b900bcf","styles_id":"instagram"}',
                'bloks_versioning_id': '16e9197b928710eafdf1e803935ed8c450a1a2e3eb696bff1184df088b900bcf'
            }).toString();

    
            const response = await this.session(url, { method: 'POST', headers, body: data, agent: this.agent });
            const responseData = await response.text();

            if (responseData.includes('phone number')) {

                success = true

            }

            if (!success) {

                throw new Error('Không thể gỡ số điện thoại cũ')

            } else {

                return responseData

            }

        } catch (error) {
            throw error;
        }

    }
 
    async api1_get_restriction_details() {
        try {
            const fbResponse = await this.session("https://www.facebook.com/", { agent: this.agent });
            const fbText = await fbResponse.text();
            const datrParts = fbText.split('["_js_datr","');
            if (datrParts.length < 2) {
                throw new Error("Không thể tìm thấy _js_datr trong response từ Facebook.");
            }
 
            const js_datr = datrParts[1].split('",')[0];
 
            const cookieResponse = await this.session("https://www.instagram.com/api/v1/web/accounts/login/ajax/", {
                headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 10; SM-G960N Build/QQ3A.200805.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/85.0.4183.101 Mobile Safari/537.36 Instagram 361.0.0.46.88 Android (29/10; 560dpi; 1440x2792; samsung; SM-G960N; starlteks; samsungexynos9810; en_US; 674675098)' },
                agent: this.agent
            });
 
            const setCookieHeader = cookieResponse.headers.get('set-cookie') || '';
 
            const csrfMatch = setCookieHeader.match(/csrftoken=([^;]+)/);
            const igDidMatch = setCookieHeader.match(/ig_did=([^;]+)/);
 
            if (!csrfMatch || !igDidMatch) {
                console.error("Header 'set-cookie' nhận được:", setCookieHeader);
                throw new Error("Không lấy được csrftoken hoặc ig_did mới từ Instagram.");
            }
            const freshCsrfToken = csrfMatch[1];
            const freshIgDid = igDidMatch[1];
 
            const warmupHeaders = {
                'x-ig-www-claim': '0',
                'x-web-session-id': 'mswfcu:7429ye:kgkoax',
                'user-agent': this.user_agent,
                'viewport-width': '412',
                'accept': '*/*',
                'x-requested-with': 'XMLHttpRequest',
                'x-asbd-id': '359341',
                'dpr': '3.5',
                'x-csrftoken': freshCsrfToken, // <-- Dùng token mới
                'x-ig-app-id': '1217981644879628',
                'sec-fetch-site': 'same-origin',
                'sec-fetch-mode': 'cors',
                'sec-fetch-dest': 'empty',
                'referer': `https://www.instagram.com/_n/accountquality/?actor_id=${this.actor_id}&source=actor_business_ale_ig_post_enforcement_notif`,
                'accept-language': 'en-US,en;q=0.9',
                // Xây dựng chuỗi cookie với token mới
                'cookie': `x-mid=${this.x_mid}; authorization=Bearer ${this.authorization_token}; ig_did=${freshIgDid}; datr=${js_datr}; ig-u-rur=${this.ig_u_rur}`
            };
            await this.session("https://www.instagram.com/api/v1/web/accounts/login/ajax/", { headers: warmupHeaders, agent: this.agent });
 
            await new Promise(resolve => setTimeout(resolve, 5000));
 
            this.session_id = `${Math.floor(Date.now() / 1000)}:${this.user_id}`;
 
            const url3 = "https://i.instagram.com/graphql_www";
            const headers3 = this.get_graphql_headers();
 
            const data = new URLSearchParams({
                "method": "post",
                "pretty": "false",
                "format": "json",
                "server_timestamps": "true",
                "locale": "en-US",
                "purpose": "fetch",
                "fb_api_req_friendly_name": "IGBloksAppRootQuery",
                "client_doc_id": "253360298310718582719188438574",
                "enable_canonical_naming": "true",
                "enable_canonical_variable_overrides": "true",
                "enable_canonical_naming_ambiguous_type_prefixing": "true",
                "variables": JSON.stringify({
                    "params": {
                        "params": JSON.stringify({
                            "params": JSON.stringify({
                                "server_params": {
                                    "session_id": this.session_id, // <-- Dùng session_id mới tạo
                                    "actor_id": this.actor_id,
                                    "source": "actor_business_ale_ig_post_enforcement_notif"
                                }
                            })
                        }),
                        "infra_params": { "device_id": this.device_id },
                        "bloks_versioning_id": this.bloks_version,
                        "app_id": "com.bloks.www.accountquality.xmds.actor"
                    },
                    "bk_context": {
                        "is_flipper_enabled": false,
                        "theme_params": [],
                        "debug_tooling_metadata_token": null
                    }
                })
            });
 
            const response3 = await this.session(url3, { 
                method: 'POST', 
                headers: headers3, 
                body: data.toString(),
                agent: this.agent 
            });
 
            const responseData = await response3.text();
            return responseData;
 
        } catch (error) {
            console.error("❌ Đã xảy ra lỗi trong quá trình thực thi api1_get_restriction_details:", error);
            throw error;
        }
    }
 
    async api2_start_appeal_flow() {
        const url = "https://i.instagram.com/graphql_www";
        const headers = this.get_graphql_headers();
 
        if (!this.appeal_id) {
            this.appeal_id = 17849551134550958; // Fallback default
            console.log(`Using fallback appeal_id: ${this.appeal_id}`);
        } else {
            console.log(`Using extracted appeal_id: ${this.appeal_id}`);
        }
 
        const data = new URLSearchParams({
            method: "post",
            pretty: "false",
            format: "json",
            server_timestamps: "true",
            locale: "en-US",
            purpose: "fetch",
            fb_api_req_friendly_name: "IGBloksAppRootQuery",
            client_doc_id: "253360298310718582719188438574",
            enable_canonical_naming: "true",
            enable_canonical_variable_overrides: "true",
            enable_canonical_naming_ambiguous_type_prefixing: "true",
            variables: JSON.stringify({
                params: {
                    params: JSON.stringify({
                        params: JSON.stringify({
                            server_params: {
                                appeal_id: this.appeal_id,
                                INTERNAL_INFRA_screen_id: "wpbp46:229"
                            }
                        })
                    }),
                    infra_params: { device_id: this.device_id },
                    bloks_versioning_id: this.bloks_version,
                    app_id: "com.bloks.www.xfac.flow.cds"
                },
                bk_context: { is_flipper_enabled: false, theme_params: [], debug_tooling_metadata_token: null }
            })
        }).toString();
 
        const response = await this.session(url, { method: 'POST', headers, body: data, agent: this.agent });
        const responseData = await response.text();
        return responseData;
    }
 
    async api3_submit_captcha(captcha_response = null, captcha_api_key = null) {
        const url = "https://i.instagram.com/api/v1/bloks/async_action/com.bloks.www.checkpoint.ufac.bot_captcha.submit/";
        const headers = this.get_common_headers();
 
        if (!captcha_response) {
            if (captcha_api_key) {
                this.captcha_api_key = captcha_api_key;
                captcha_response = await this.get_captcha_solution(captcha_api_key);
            } else {
                captcha_response = "xsq6ul"; // Default fallback
            }
        }
 
        console.log(`🔐 Using captcha response: ${captcha_response}`);
 
        if (!this.challenge_root_id) this.challenge_root_id = 197913082500000;
        if (!this.enrollment_id) this.enrollment_id = 17849551134550958;
        if (!this.persisted_data) this.persisted_data = "AZkYmffDqumadotk4OowVTdz_LZ6EP92xxxdFdAadUurpGzeLSG0Y8gr3zJIlqhCbhfBTclBzbWx0ofQu5_556eAywZ4p-IsTUh7hOJNUYEQIi0nGBCnHhiJEeAHQ4K8HyEo3ifI6Si_lm1rqgIuuIJT2NXD50mcar3l5ISAvexTQFW4k5cRk6f36RVVTaCovED_Z16bZ9A001M8agzqcT4Nl2mxj4s1WhpzHk2LwdwfJpQmMBD2brdtKIkOKSssAlF1PRTXnrt0qmdLPDkq2Y43YD_-dni0hB8Fuz4ggcC244vDL6f_ht3GMgdpwnB_cbyEWCEfcr_Bo9UbOdR5wSxn2TulgRuieF6Qy9RHtnej4ss_n0HM0RXwYgYpcDXgu1tc0zSw4FMsTiOohqJkwPWmrB_LNUyXTA8__pLYmGMVbkDwmRmtz-fTOAH6rFs1eu4tJgNDXoiu3zeP9ALJlnzKiUmcqdZxL18ICYy79iQwVw";
        if (!this.latency_qpl_instance_id) this.latency_qpl_instance_id = 1.08604267300007E14;
 
        const data = new URLSearchParams({
            "params": JSON.stringify({
                "client_input_params": { "captcha_response": captcha_response },
                "server_params": {
                    "INTERNAL__latency_qpl_marker_id": 36707139,
                    "INTERNAL__latency_qpl_instance_id": this.latency_qpl_instance_id,
                    "challenge_root_id": this.challenge_root_id,
                    "persisted_data": this.persisted_data,
                    "xfac_context": '{"use_xmds":true}',
                    "enrollment_id": this.enrollment_id
                }
            }),
            "_uuid": this.device_id,
            "bk_client_context": JSON.stringify({
                "bloks_version": this.bloks_version,
                "styles_id": "instagram"
            }),
            "bloks_versioning_id": this.bloks_version
        }).toString();
 
        const response = await this.session(url, { method: 'POST', headers, body: data, agent: this.agent });
        const responseData = await response.text();
 
        return responseData;
    }
 
    async api4_set_contact_point_phone(phone_number = "+84922558164") {
        const url = "https://i.instagram.com/api/v1/bloks/async_action/com.bloks.www.checkpoint.ufac.set_contact_point.submit/";
        const headers = this.get_common_headers();
 
        const data = new URLSearchParams({
            "params": JSON.stringify({
                "client_input_params": {
                    "contact_point": phone_number,
                    "medium": "whatsapp"
                },
                "server_params": {
                    "INTERNAL__latency_qpl_marker_id": 36707139,
                    "INTERNAL__latency_qpl_instance_id": 1.98993350200007E14,
                    "challenge_root_id": this.challenge_root_id,
                    "xfac_context": '{"use_xmds":true}',
                    "enrollment_id": this.enrollment_id
                }
            }),
            "_uuid": this.device_id,
            "bk_client_context": JSON.stringify({
                "bloks_version": this.bloks_version,
                "styles_id": "instagram"
            }),
            "bloks_versioning_id": this.bloks_version
        }).toString();
 
        const response = await this.session(url, { method: 'POST', headers, body: data, agent: this.agent });
        const responseData = await response.text();
        return responseData;
    }
 
    async api5_submit_phone_code(captcha_code = "489378") {
        const url = "https://i.instagram.com/api/v1/bloks/async_action/com.bloks.www.checkpoint.ufac.contact_point.submit_code/";
        const headers = this.get_common_headers();
 
        const data = new URLSearchParams({
            "params": JSON.stringify({
                "client_input_params": { "captcha_code": captcha_code },
                "server_params": {
                    "INTERNAL__latency_qpl_marker_id": 36707139,
                    "INTERNAL__latency_qpl_instance_id": 1.99077095100006E14,
                    "challenge_root_id": this.challenge_root_id,
                    "xfac_context": '{"use_xmds":true}',
                    "enrollment_id": this.enrollment_id
                }
            }),
            "_uuid": this.device_id,
            "bk_client_context": JSON.stringify({
                "bloks_version": this.bloks_version,
                "styles_id": "instagram"
            }),
            "bloks_versioning_id": this.bloks_version
        }).toString();
 
        const response = await this.session(url, { method: 'POST', headers, body: data, agent: this.agent });
        const responseData = await response.text();
        return responseData;
    }
 
    async api6_set_contact_point_email(email = "hieploan17@gmail.com") {
        const url = "https://i.instagram.com/api/v1/bloks/async_action/com.bloks.www.checkpoint.ufac.set_contact_point.submit/";
        const headers = this.get_common_headers();
 
        const data = new URLSearchParams({
            "params": JSON.stringify({
                "client_input_params": { "contact_point": email },
                "server_params": {
                    "INTERNAL__latency_qpl_marker_id": 36707139,
                    "INTERNAL__latency_qpl_instance_id": 1.99333240000006E14,
                    "challenge_root_id": this.challenge_root_id,
                    "xfac_context": '{"use_xmds":true}',
                    "enrollment_id": this.enrollment_id
                }
            }),
            "_uuid": this.device_id,
            "bk_client_context": JSON.stringify({
                "bloks_version": this.bloks_version,
                "styles_id": "instagram"
            }),
            "bloks_versioning_id": this.bloks_version
        }).toString();
 
        const response = await this.session(url, { method: 'POST', headers, body: data, agent: this.agent });
        const responseData = await response.text();
        return responseData;
    }
 
    async api7_submit_email_code(captcha_code = "342818") {
        const url = "https://i.instagram.com/api/v1/bloks/async_action/com.bloks.www.checkpoint.ufac.contact_point.submit_code/";
        const headers = this.get_common_headers();
 
        const data = new URLSearchParams({
            "params": JSON.stringify({
                "client_input_params": { "captcha_code": captcha_code },
                "server_params": {
                    "INTERNAL__latency_qpl_marker_id": 36707139,
                    "INTERNAL__latency_qpl_instance_id": 1.99441372100006E14,
                    "challenge_root_id": this.challenge_root_id,
                    "xfac_context": '{"use_xmds":true}',
                    "enrollment_id": this.enrollment_id
                }
            }),
            "_uuid": this.device_id,
            "bk_client_context": JSON.stringify({
                "bloks_version": this.bloks_version,
                "styles_id": "instagram"
            }),
            "bloks_versioning_id": this.bloks_version
        }).toString();
 
        const response = await this.session(url, { method: 'POST', headers, body: data, agent: this.agent });
        const responseText = await response.text();
        
        return responseText;
    }

    _splitBloksValues(blockString) {
        const tokens = [];
        if (!blockString) return tokens;
        let currentToken = '';
        let parenCount = 0;
        for (let i = 0; i < blockString.length; i++) {
            const char = blockString[i];
            if (char === '(') parenCount++;
            else if (char === ')') parenCount--;

            if (char === ',' && parenCount === 0) {
                tokens.push(currentToken.trim());
                currentToken = '';
            } else {
                currentToken += char;
            }
        }
        if (currentToken) tokens.push(currentToken.trim());
        return tokens;
    }
 
    extract_trigger_and_screen_id(response_data) {
        try {
            let searchableString = '';

            // Bước 1: Chuẩn bị chuỗi dữ liệu để quét
            const parsedData = typeof response_data === 'string' ? JSON.parse(response_data) : response_data;

            // Ưu tiên tìm "bloks_bundle_tree" (dạng response cũ)
            const dataKey = Object.keys(parsedData.data || {}).find(k => k.includes('bloks_app'));
            if (dataKey && parsedData.data[dataKey]?.screen_content?.component?.bundle?.bloks_bundle_tree) {
                searchableString = parsedData.data[dataKey].screen_content.component.bundle.bloks_bundle_tree;
            } else {
                // Nếu không thấy, chuyển sang chế độ quét toàn bộ (dạng response mới)
                searchableString = JSON.stringify(parsedData);
            }

            if (!searchableString) {
                throw new Error("Không tìm thấy dữ liệu Bloks để phân tích.");
            }

            // Bước 2: Xây dựng mapping bằng parser
            const mapping = {};
            let searchIndex = 0;
            
            while ((searchIndex = searchableString.indexOf('(bk.action.map.Make,', searchIndex)) !== -1) {
                let parenCount = 1;
                let endIndex = searchIndex + '(bk.action.map.Make,'.length;
                while (endIndex < searchableString.length && parenCount > 0) {
                    if (searchableString[endIndex] === '(') parenCount++;
                    if (searchableString[endIndex] === ')') parenCount--;
                    endIndex++;
                }
                const mapMakeBlock = searchableString.substring(searchIndex, endIndex);

                const mapMakeContent = mapMakeBlock.slice('(bk.action.map.Make,'.length, -1).trim();
                const argBlocks = this._splitBloksValues(mapMakeContent);

                if (argBlocks.length === 2 && argBlocks[0].startsWith('(bk.action.array.Make,') && argBlocks[1].startsWith('(bk.action.array.Make,')) {
                    const keysBlockContent = argBlocks[0].slice('(bk.action.array.Make,'.length, -1).trim();
                    const valsBlockContent = argBlocks[1].slice('(bk.action.array.Make,'.length, -1).trim();

                    const keys = this._splitBloksValues(keysBlockContent).map(k => k.replace(/\\?"/g, ''));
                    const vals = this._splitBloksValues(valsBlockContent);

                    if (keys.length !== vals.length) {
                         searchIndex = endIndex;
                         continue;
                    }

                    for (let i = 0; i < keys.length; i++) {
                        const key = keys[i];
                        const value = vals[i];
                        
                        // Chỉ gán nếu biến chưa có giá trị
                        if (mapping[key] === undefined) {
                            if (value === 'null') {
                                mapping[key] = null;
                            } else if (value.startsWith('(bk.action.i64.Const')) {
                                const match = value.match(/\(\s*bk\.action\.i64\.Const,\s*([0-9]+)\s*\)/);
                                if (match) mapping[key] = match[1];
                            } else {
                                mapping[key] = value.replace(/\\"/g, '');
                            }
                        }
                    }
                }
                searchIndex = endIndex;
            }

            // Bước 3: Gán giá trị
            this.authenticity_product = mapping["authenticity_product"] || null;
            this.external_flow_id = mapping["external_flow_id"] || null;
            this.ixt_initial_screen_id = mapping["ixt_initial_screen_id"] || null;
            this.trigger_session_id = mapping["trigger_session_id"] || null;
            this.internal_infra_screen_id_9 = mapping["INTERNAL_INFRA_screen_id"] || null;
            this.challenge_root_id_8 = mapping["challenge_root_id"] || null;
            this.enrollment_id_8 = mapping["enrollment_id"] || null;

            console.log('--- KẾT QUẢ TRÍCH XUẤT ---');
            console.log('authenticity_product: ' + this.authenticity_product);
            console.log('external_flow_id: ' + this.external_flow_id);
            console.log('ixt_initial_screen_id: ' + this.ixt_initial_screen_id);
            console.log('trigger_session_id: ' + this.trigger_session_id);
            console.log('internal_infra_screen_id_9: ' + this.internal_infra_screen_id_9);
            console.log('challenge_root_id_8: ' + this.challenge_root_id_8);
            console.log('enrollment_id_8: ' + this.enrollment_id_8);

        } catch (error) {
            console.error("Lỗi khi trích xuất thông tin:", error);
        }
    }
 
    async api8_poll_ufac_api() {
        const url = "https://i.instagram.com/api/v1/bloks/apps/com.bloks.www.checkpoint.ufac.poll_ufac_api/";
        const headers = this.get_common_headers();
 
        const data = new URLSearchParams({
            "params": JSON.stringify({
                "client_input_params": {},
                "server_params": {
                    "INTERNAL__latency_qpl_marker_id": '36707139',
                    "xfac_context": '{"use_xmds":true}',
                    "hashed_ui_state": "image_upload_challenge_ui_state",
                    "INTERNAL__latency_qpl_instance_id": this.latency_qpl_instance_id,
                    "challenge_root_id": this.challenge_root_id_8,
                    "enrollment_id": this.enrollment_id_8,
                    "v2_polling": 1
                }
            }),
            "_uuid": this.device_id,
            "bk_client_context": JSON.stringify({
                "bloks_version": this.bloks_version,
                "styles_id": "instagram"
            }),
            "bloks_versioning_id": this.bloks_version
        }).toString();
 
        const response = await this.session(url, { method: 'POST', headers, body: data, agent: this.agent });
        const responseData = await response.json();
        return responseData;
    }
 
    async api9_authenticity_wizard() {
        const url = "https://i.instagram.com/api/v1/bloks/apps/com.bloks.www.ixt.cds.triggers.screen.authenticity_wizard/";
        const headers = this.get_common_headers();
 
        const params_dict = {
            "server_params": {
                "INTERNAL_INFRA_screen_id": this.internal_infra_screen_id_9,
                "trigger_event_type": "authenticity_wizard_trigger",
                "ig_container_module": "playground",
                "location": "ufac_selfie",
                "trigger_session_id": this.trigger_session_id,
                "external_flow_id": this.external_flow_id,
                "authenticity_product": this.authenticity_product,
                "ixt_initial_screen_id": this.ixt_initial_screen_id,
                "should_show_back_button": 1
            }
        };
 
        const payload = {
            "params": JSON.stringify(params_dict),
            "_uuid": this.device_id,
            "bk_client_context": JSON.stringify({
                "bloks_version": "16e9197b928710eafdf1e803935ed8c450a1a2e3eb696bff1184df088b900bcf",
                "styles_id": "instagram"
            }),
            "bloks_versioning_id": "16e9197b928710eafdf1e803935ed8c450a1a2e3eb696bff1184df088b900bcf"
        };
 
        const payload_encoded = new URLSearchParams(payload).toString();
 
        const response = await this.session(url, { method: 'POST', headers, body: payload_encoded, agent: this.agent });
        const responseText = await response.text();
        return responseText;
    }
 
    async api10_selfie_capture_onboarding() {
        const api9_response = await this.api9_authenticity_wizard();
        const extracted_data = this.extract_serialized_state_from_api9(api9_response);

        this.serialized_state = extracted_data[0];
        this.internal_infra_screen_id = extracted_data[1];
        this.submission_id = extracted_data[2];
 
        const url = "https://i.instagram.com/api/v1/bloks/apps/com.bloks.www.cds_bloks_screen.ixt.screen.selfie_capture_flow_onboarding/";
        const headers = this.get_common_headers();
 
        const params_dict = {
            "server_params": {
                "serialized_state": this.serialized_state,
                "INTERNAL_INFRA_screen_id": this.internal_infra_screen_id
            }
        };
 
        const payload = {
            "params": JSON.stringify(params_dict),
            "_uuid": this.device_id,
            "bk_client_context": JSON.stringify({
                "bloks_version": "16e9197b928710eafdf1e803935ed8c450a1a2e3eb696bff1184df088b900bcf",
                "styles_id": "instagram"
            }),
            "bloks_versioning_id": "16e9197b928710eafdf1e803935ed8c450a1a2e3eb696bff1184df088b900bcf"
        };
 
        const payload_encoded = Object.keys(payload).map(k => `${encodeURIComponent(k)}=${encodeURIComponent(payload[k])}`).join('&');

        const response = await this.session(url, { method: 'POST', headers, body: payload_encoded, agent: this.agent });
        const responseText = await response.text();

        if (responseText.includes('AUTHENTICITY_WIZARD_CAPTURE:is_uploading')) {
            return true
        } else {
            return false
        }
    }
 
    async upload_file(file_path = "video.mp4", file_path_image = "imagetest.jpeg") {

        if (this.submission_id) {

            if (!fs.existsSync(file_path) || !fs.existsSync(file_path_image)) {
                throw new Error('Không tìm thấy file ảnh hoặc video');
            }            

            console.log("Submission Id", this.submission_id);

            const url = "https://graph.facebook.com/authenticity_uploads/";
            const headers = {
                "user-agent": this.user_agent,
                "x-fb-http-engine": "Liger",
                "x-fb-client-ip": "True",
                "x-fb-server-cluster": "true",
                "accept-language": "en-US"
            };
    
            const machine_id = uuidv4();
            const session_upload_id = uuidv4();
    
            const data = {
                "product": "IG_UFAC_SELFIE_FRICTION_ONLY",
                "return_file_handles": "true",
                "submission_id": this.submission_id,
                "access_token": "124024574287414|84a456d620314b6e92a16d8ff1c792dc",
                "machine_id": '78c59cb9-a663-4484-ae5b-55bb1fbbbe13',
                "id_or_cuid": this.cuid,
                "session_id": session_upload_id,
                "device_id": this.device_id,
                "submit_to_authenticity_platform": "false"
            };
    
            let form = new FormData();
            Object.keys(data).forEach(key => form.append(key, data[key]));
            form.append("upload1", fs.createReadStream(file_path_image), { filename: 'image.jpeg', contentType: 'image/jpeg' });
    
            let response = await this.session(url, { method: 'POST', headers: { ...headers, ...form.getHeaders() }, body: form, agent: this.agent });
            let responseData = await response.json();
            console.log("Upload Response 1:", JSON.stringify(responseData));
            const idphoto = responseData.file_handle1;
    
            form = new FormData();
            Object.keys(data).forEach(key => form.append(key, data[key]));
            form.append("upload1", fs.createReadStream(file_path), { filename: 'video.mp4', contentType: 'video/mp4' });
    
            const responseupload = await this.session(url, { method: 'POST', headers: { ...headers, ...form.getHeaders() }, body: form, agent: this.agent });
            const responseuploadData = await responseupload.json();
            console.log("Upload Response 2:", JSON.stringify(responseuploadData));
            const idvideo = responseuploadData.file_handle1;
    
            const url2 = "https://i.instagram.com/graphql_www";
            const headers2 = this.get_graphql_headers();
    
            const payload = {
                "method": "post",
                "pretty": "false",
                "format": "json",
                "server_timestamps": "true",
                "locale": "user",
                "purpose": "fetch",
                "fb_api_req_friendly_name": "BloksAsyncActionQuery",
                "client_doc_id": "356548512611661350451296799798",
                "enable_canonical_naming": "true",
                "enable_canonical_variable_overrides": "true",
                "enable_canonical_naming_ambiguous_type_prefixing": "true",
                "variables": JSON.stringify({
                    "params": {
                        "params": JSON.stringify({
                            "params": JSON.stringify({
                                "client_input_params": {
                                    "uploaded_files_payload_type": ["selfie_photo", "selfie_video"],
                                    "uploaded_files_ent_ids": [
                                        idphoto,
                                        idvideo
                                    ]
                                },
                                "server_params": {
                                    "INTERNAL__latency_qpl_marker_id": '36707139',
                                    "INTERNAL__latency_qpl_instance_id": this.internal_latency_qpl_instance_id_8,
                                    "serialized_state": this.serialized_state
                                }
                            })
                        }),
                        "infra_params": {
                            "device_id": this.device_id
                        },
                        "bloks_versioning_id": this.bloks_version,
                        "app_id": "com.bloks.www.cds_bloks_async_controller.ixt.screen.selfie_capture_flow_capture"
                    },
                    "bk_context": {
                        "is_flipper_enabled": false,
                        "theme_params": [],
                        "debug_tooling_metadata_token": null
                    }
                })
            };
    
            response = await this.session(url2, { method: 'POST', headers: headers2, body: new URLSearchParams(payload), agent: this.agent });
    
            const url3 = "https://i.instagram.com/graphql_www";
            const headers3 = this.get_graphql_headers();
    
            const inner_params = {
                "server_params": {
                    "serialized_state": this.serialized_state
                }
            };
    
            const middle_params = {
                "params": JSON.stringify(inner_params)
            };
    
            const outer_params = {
                "params": JSON.stringify(middle_params),
                "infra_params": { "device_id": this.device_id },
                "bloks_versioning_id": this.bloks_version,
                "app_id": "com.bloks.www.ixt.sample"
            };
    
            const variables = JSON.stringify({
                "params": outer_params,
                "bk_context": {
                    "is_flipper_enabled": false,
                    "theme_params": [],
                    "debug_tooling_metadata_token": null
                }
            });
    
            const payload_dict = {
                "method": "post",
                "pretty": "false",
                "format": "json",
                "server_timestamps": "true",
                "locale": "user",
                "purpose": "fetch",
                "fb_api_req_friendly_name": "IGBloksAppRootQuery",
                "client_doc_id": "25336029839814386604447461985",
                "enable_canonical_naming": "true",
                "enable_canonical_variable_overrides": "true",
                "enable_canonical_naming_ambiguous_type_prefixing": "true",
                "variables": variables
            };
    
            const payload_encoded = new URLSearchParams(payload_dict).toString();
    
            response = await this.session(url3, { method: 'POST', headers: headers3, body: payload_encoded, agent: this.agent });
            return await response.json();

        } else {

            throw new Error('Upload video selfie thất bại')

        }
    }
 
    create_sample_video_if_missing(file_path) {
        if (!fs.existsSync(file_path)) {
            console.log(`Video file ${file_path} not found.`);
            console.log("Please make sure you have a video file for upload.");
            console.log("The video should be a selfie video for authenticity verification.");
            return false;
        }
        return true;
    }
 
    extract_challenge_data_from_response(response_data) {
        try {
            const response_str = JSON.stringify(response_data);
            console.log(response_str);
 
            let found_challenge_root_id = null;
            let found_enrollment_id = null;
            let found_appeal_id = null;
 
            const challenge_patterns = [
                /challenge_root_id.*?\(bk\.action\.i64\.Const,\s*(\d+)\)/,
                /challenge_root_id.*?i64\.Const,\s*(\d+)/,
                /"challenge_root_id"[:\s]*(\d+)/,
                /"challenge_root_id"[:\s]*"(\d+)"/ 
            ];
            for (const pattern of challenge_patterns) {
                const challenge_match = response_str.match(pattern);
                if (challenge_match) {
                    found_challenge_root_id = parseInt(challenge_match[1], 10);
                    console.log(`✅ Found challenge_root_id using pattern: ${challenge_match[0]}`);
                    break;
                }
            }
 
            const enrollment_patterns = [
                /enrollment_id.*?\(bk\.action\.i64\.Const,\s*(\d+)\)/,
                /enrollment_id.*?i64\.Const,\s*(\d+)/,
                /"enrollment_id"[:\s]*(\d+)/,
                /"enrollment_id"[:\s]*"(\d+)"/ 
            ];
            for (const pattern of enrollment_patterns) {
                const enrollment_match = response_str.match(pattern);
                if (enrollment_match) {
                    found_enrollment_id = parseInt(enrollment_match[1], 10);
                    console.log(`✅ Found enrollment_id using pattern: ${enrollment_match[0]}`);
                    break;
                }
            }
 
            const appeal_patterns = [
                /"appeal_id"[:\s]*(\d+)/,
                /"appeal_id"[:\s]*"(\d+)"/,
                /appeal_id.*?(\d{15,})/ 
            ];
            for (const pattern of appeal_patterns) {
                const appeal_match = response_str.match(pattern);
                if (appeal_match) {
                    found_appeal_id = parseInt(appeal_match[1], 10);
                    break;
                }
            }
 
            const missing_ids = [];
            if (!found_challenge_root_id) missing_ids.push("Challenge Root ID");
            if (!found_enrollment_id) missing_ids.push("Enrollment ID");
            if (!found_appeal_id) missing_ids.push("Appeal ID");
 
            if (missing_ids.length > 0) {
                const error_msg = `❌ Required IDs not found in API 3 response: ${missing_ids.join(', ')}`;
                console.error(error_msg);
                throw new Error(error_msg);
            }
 
            this.challenge_root_id = found_challenge_root_id;
            this.enrollment_id = found_enrollment_id;
            this.appeal_id = found_appeal_id;
 
            console.log("✅ Successfully extracted IDs:");
            console.log(`Challenge Root ID: ${this.challenge_root_id}`);
            console.log(`Enrollment ID: ${this.enrollment_id}`);
            console.log(`Appeal ID: ${this.appeal_id}`);
            return true;
        } catch (e) {
            console.error(`❌ Error extracting challenge data: ${e}`);
            throw e;
        }
    }
 
    get_user_input_code(code_type = "phone") {
        const readline = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout
        });
        return new Promise(resolve => {
            readline.question(`Please enter the ${code_type} verification code: `, code => {
                readline.close();
                resolve(code.trim());
            });
        });
    }
 
    async wait_between_requests(seconds = 2) {
        console.log(`Waiting ${seconds} seconds before next request...`);
        return new Promise(resolve => setTimeout(resolve, seconds * 1000));
    }
 
    save_response_to_file(response_data, filename) {
        try {
            const data_to_save = typeof response_data === 'object' ? JSON.stringify(response_data, null, 2) : String(response_data);
            fs.writeFileSync(filename, data_to_save, 'utf-8');
            console.log(`Response saved to ${filename}`);
        } catch (e) {
            console.error(`Error saving response to file: ${e}`);
        }
    }
 
    validate_session() {
        const required_fields = ['authorization_token', 'user_id', 'x_mid'];
        const missing_fields = required_fields.filter(field => !this[field]);
 
        if (missing_fields.length > 0) {
            console.error(`Missing required session data: ${missing_fields.join(', ')}`);
            return false;
        }
        return true;
    }
 
    extract_appeal_id_from_api1(response_str) {

        console.log(response_str)

        try {
 
            let found_appeal_id = null;
            const appeal_patterns = [
                /"appeal_id"[:\s]*(\d+)/,
                /"appeal_id"[:\s]*"(\d+)"/,
                /appeal_id.*?(\d{15,})/ 
            ];
            for (const pattern of appeal_patterns) {
                const appeal_match = response_str.match(pattern);
                if (appeal_match) {
                    found_appeal_id = appeal_match[1];
                    break;
                }
            }
 
            if (!found_appeal_id) {
                const error_msg = "❌ Appeal ID not found in API 1 response";
                console.error(error_msg);
                throw new Error(error_msg);
            }
 
            this.appeal_id = found_appeal_id;
 
            console.log(`✅ Successfully extracted Appeal ID: ${this.appeal_id}`);
            return true;
        } catch (e) {
            console.error(`❌ Error extracting appeal ID from API 1: ${e}`);
            throw e;
        }
    }

    extract_persisted_data(response_data) {

        try {

            let found_persisted_data = null;

            const persisted_patterns = [
                /persisted_data.*?\\\\"([A-Za-z0-9_\/=-]{150,})\\\\"/,
                /persisted_data.*?"([A-Za-z0-9_\/=-]{150,})"/,
                /\\\"persisted_data\\.*?\\\"([A-Za-z0-9_\/=-]{150,})\\\"/,
                /persisted_data.*?([A-Za-z0-9_\/=-]{150,})/,
                /([A-Za-z0-9_\/=-]{200,})/ 
            ];

            for (let i = 0; i < persisted_patterns.length; i++) {
                const persisted_match = response_data.match(persisted_patterns[i]);
                if (persisted_match) {
                    const candidate = persisted_match[1];
                    if (candidate.length >= 150 && candidate.includes('_') && candidate.includes('-') && !candidate.startsWith('unique_root_id') && !candidate.startsWith('wqbn49') && (candidate.match(/_/g) || []).length >= 2 && (candidate.match(/-/g) || []).length >= 2) {
                        found_persisted_data = candidate;
                        console.log(`✅ Found persisted_data using pattern ${i + 1}: ${candidate}...`);
                        break;
                    }
                }
            }

            this.extract_captcha_url_from_response(response_data);

            if (!found_persisted_data) {
                const error_msg = `❌ Không tìm thấy persisted_data`;
                throw new Error(error_msg);
            }

            this.persisted_data = found_persisted_data;

            console.log(`Persisted Data: ${this.persisted_data}`);

            if (this.captcha_url) {
                console.log(`Captcha URL: ${this.captcha_url}`);
            }

        } catch (e) {
            console.error(`❌ Error extracting persisted_data: ${e}`);
            throw e;
        }

    }
 
    extract_challenge_ids_from_api2(response_data) {
  
        try {
 
            let found_challenge_root_id = null;
            let found_enrollment_id = null;
            let found_latency_qpl_instance_id = null;
 
            const combined_pattern = /\(bk\.action\.i64\.Const,\s*(\d+)\),\s*\(bk\.action\.i64\.Const,\s*(\d+)\)/;
            const combined_match = response_data.match(combined_pattern);
 
 
            if (combined_match) {
                found_challenge_root_id = parseInt(combined_match[1], 10);
                found_enrollment_id = parseInt(combined_match[2], 10);
                console.log("✅ Found both IDs from combined pattern:");
                console.log(`  Challenge Root ID: ${found_challenge_root_id}`);
                console.log(`  Enrollment ID: ${found_enrollment_id}`);
            } else {
 
                const challenge_patterns = [
                    /challenge_root_id.*?\(bk\.action\.i64\.Const,\s*(\d+)\)/,
                    /challenge_root_id.*?i64\.Const,\s*(\d+)/,
                    /"challenge_root_id"[:\s]*(\d+)/
                ];
                for (const pattern of challenge_patterns) {
                    const challenge_match = response_data.match(pattern);
                    if (challenge_match) {
                        found_challenge_root_id = parseInt(challenge_match[1], 10);
                        break;
                    }
                }
 
                const enrollment_patterns = [
                    /enrollment_id.*?\(bk\.action\.i64\.Const,\s*(\d+)\)/,
                    /enrollment_id.*?i64\.Const,\s*(\d+)/,
                    /"enrollment_id"[:\s]*(\d+)/
                ];
                for (const pattern of enrollment_patterns) {
                    const enrollment_match = response_data.match(pattern);
                    if (enrollment_match) {
                        found_enrollment_id = parseInt(enrollment_match[1], 10);
                        break;
                    }
                }
            }
 
            const latency_patterns = [
                /36707139,\s*(\d+),/,
                /latency_qpl_instance_id.*?(\d+)/,
                /"INTERNAL__latency_qpl_instance_id"[:\s]*(\d+\.?\d*)/,
                /"INTERNAL__latency_qpl_instance_id"[:\s]*"(\d+\.?\d*)"/ 
            ];
            for (const pattern of latency_patterns) {
                const latency_match = response_data.match(pattern);
                if (latency_match) {
                    found_latency_qpl_instance_id = latency_match[1];
                    console.log(`✅ Found latency_qpl_instance_id: ${found_latency_qpl_instance_id}`);
                    break;
                }
            }
 
            
 
            const missing_ids = [];
            if (!found_challenge_root_id) missing_ids.push("Challenge Root ID");
            if (!found_enrollment_id) missing_ids.push("Enrollment ID");
            if (!found_latency_qpl_instance_id) missing_ids.push("Latency QPL Instance ID");
 
            if (missing_ids.length > 0) {
                const error_msg = `❌ Required IDs not found in API 2 response: ${missing_ids.join(', ')}`;
                throw new Error(error_msg);
            }
 
            this.challenge_root_id = found_challenge_root_id;
            this.enrollment_id = found_enrollment_id;
            this.latency_qpl_instance_id = found_latency_qpl_instance_id;
 
            console.log("✅ Successfully extracted IDs from API 2:");
            console.log(`Challenge Root ID: ${this.challenge_root_id}`);
            console.log(`Enrollment ID: ${this.enrollment_id}`);
            console.log(`Latency QPL Instance ID: ${this.latency_qpl_instance_id}`);

            return true;
        } catch (e) {
            console.error(`❌ Error extracting challenge IDs from API 2: ${e}`);
            throw e;
        }
    }
 
    extract_serialized_state_from_api9(data) {
        const raw_string = typeof data === 'string' ? data : JSON.stringify(data);

        let serialized_state = null;
        let screen_id = null;
        let submission_id = null;

        let searchIndex = 0;
        // Lặp và tìm tất cả các khối `map.Make` trong chuỗi
        while ((searchIndex = raw_string.indexOf('(bk.action.map.Make,', searchIndex)) !== -1) {
            
            // 1. Tìm chính xác ranh giới của khối `map.Make(...)` bằng cách đếm dấu ngoặc
            let parenCount = 1;
            let endIndex = searchIndex + '(bk.action.map.Make,'.length;
            while (endIndex < raw_string.length && parenCount > 0) {
                if (raw_string[endIndex] === '(') parenCount++;
                if (raw_string[endIndex] === ')') parenCount--;
                endIndex++;
            }
            const mapMakeBlock = raw_string.substring(searchIndex, endIndex);

            // 2. Tách 2 đối số chính của `map.Make` (chính là 2 khối array.Make)
            const mapMakeContent = mapMakeBlock.slice('(bk.action.map.Make,'.length, -1).trim();
            const argBlocks = this._splitBloksValues(mapMakeContent);

            if (argBlocks.length === 2 && argBlocks[0].startsWith('(bk.action.array.Make,') && argBlocks[1].startsWith('(bk.action.array.Make,')) {
                
                // 3. Tách nội dung bên trong mỗi khối array.Make
                const keysBlockContent = argBlocks[0].slice('(bk.action.array.Make,'.length, -1).trim();
                const valsBlockContent = argBlocks[1].slice('(bk.action.array.Make,'.length, -1).trim();

                const keys = this._splitBloksValues(keysBlockContent).map(k => k.replace(/\\"/g, ''));
                const vals = this._splitBloksValues(valsBlockContent);

                if (keys.length !== vals.length) {
                    searchIndex = endIndex;
                    continue;
                };

                // 4. Gán giá trị
                for (let i = 0; i < keys.length; i++) {
                    const key = keys[i];
                    const value = vals[i];

                    if (key === 'serialized_state' && serialized_state === null) {
                        serialized_state = value.replace(/\\"/g, '');
                    }
                    if (key === 'INTERNAL_INFRA_screen_id' && screen_id === null) {
                        screen_id = value.replace(/\\"/g, '');
                    }
                    if (key === 'submission_id' && submission_id === null) {
                        const const_match = value.match(/\(bk\.action\.i64\.Const,\s*([0-9]+)\)/);
                        if (const_match && const_match[1]) {
                            submission_id = const_match[1];
                        }
                    }
                }
            }
            // Di chuyển con trỏ tìm kiếm đến cuối khối vừa xử lý
            searchIndex = endIndex;
        }

        return [serialized_state, screen_id, submission_id];
    }
 
}

module.exports = InstagramAPIFlow