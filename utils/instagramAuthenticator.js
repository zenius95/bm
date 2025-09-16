// Bro, import mấy thứ cần thiết vào nhé
const fetch = require('node-fetch');
const twofactor = require('node-2fa');
const { HttpsProxyAgent } = require('https-proxy-agent'); // Dùng https-proxy-agent để hỗ trợ proxy tốt hơn

// --- Định nghĩa các URL và Header tĩnh ---
// Để ở đây cho dễ quản lý, sau này IG có đổi thì sửa 1 chỗ thôi
const INSTAGRAM_URLS = {
    BASE: 'https://www.instagram.com/',
    LOGIN_AJAX: 'https://www.instagram.com/api/v1/web/accounts/login/ajax/',
    TWO_FACTOR_AJAX: 'https://www.instagram.com/api/v1/web/accounts/login/ajax/two_factor/',
    SHARED_DATA: 'https://www.instagram.com/data/shared_data/',
};

const BASE_HEADERS = {
    'accept': '*/*',
    'accept-language': 'en-US,en;q=0.9',
    'dpr': '1',
    'sec-ch-prefers-color-scheme': 'dark',
    'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'x-asbd-id': '129477',
    'x-ig-app-id': '936619743392459',
    'x-ig-www-claim': '0',
    'x-requested-with': 'XMLHttpRequest',
};

// --- Các lớp Error tùy chỉnh để bắt lỗi cho chuẩn ---
class InstagramError extends Error {
    constructor(message) {
        super(message);
        this.name = this.constructor.name;
    }
}
class ScrapingError extends InstagramError { constructor() { super("Không thể lấy được dữ liệu cần thiết (CSRF token, machine ID) từ trang chủ Instagram."); } }
class InvalidCredentialsError extends InstagramError { constructor(message) { super(message || "Sai tên người dùng hoặc mật khẩu."); } }
class CheckpointError extends InstagramError { constructor(url) { super("Tài khoản yêu cầu xác thực (checkpoint)."); this.checkpointUrl = url; } }
class TwoFactorError extends InstagramError { constructor(message) { super(message || "Xác thực hai yếu tố thất bại."); } }
class LoginRequiredError extends InstagramError { constructor() { super("Yêu cầu đăng nhập, cookie có thể đã hết hạn."); } }

/**
 * Class chuyên xử lý việc đăng nhập vào Instagram.
 * Tối ưu, dễ đọc và xử lý lỗi rõ ràng.
 */
class InstagramAuthenticator {
    #auth;
    #proxyAgent;
    #session = {
        userAgent: '',
        csrfToken: '',
        machineId: '',
        cookies: '',
    };

    /**
     * @param {object} auth - Thông tin xác thực
     * @param {string} auth.username - Tên người dùng
     * @param {string} auth.password - Mật khẩu
     * @param {string} [auth.twofa] - Mã bí mật 2FA (nếu có)
     * @param {string} [auth.proxy] - Chuỗi proxy (ví dụ: http://user:pass@host:port)
     * @param {string} [auth.userAgent] - User-Agent tùy chỉnh
     */
    constructor(auth) {
        this.#auth = auth;
        this.#session.userAgent = auth.userAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
        this.#proxyAgent = auth.proxy ? new HttpsProxyAgent(auth.proxy) : undefined;
    }

    /**
     * Trích xuất và định dạng cookie từ response của fetch.
     * @private
     */
    #getCookies(res) {
        const rawCookies = res.headers.raw()['set-cookie'];
        if (!rawCookies) return '';
        return rawCookies.map(entry => entry.split(';')[0]).join('; ');
    }

    /**
     * Cập nhật cookie cho session hiện tại.
     * @private
     */
    #updateCookies(res) {
        const newCookies = this.#getCookies(res);
        if (newCookies) {
            // Logic để hợp nhất cookie cũ và mới, tránh trùng lặp key
            const cookieMap = new Map();
            [this.#session.cookies, newCookies].forEach(cookieString => {
                cookieString.split(';').forEach(cookiePair => {
                    const [key, value] = cookiePair.trim().split(/=(.*)/s);
                    if (key) cookieMap.set(key, value);
                });
            });
            this.#session.cookies = Array.from(cookieMap, ([key, value]) => `${key}=${value}`).join('; ');
        }
    }

    /**
     * Gửi request đến trang chủ để lấy các thông tin ban đầu.
     * @private
     */
    async #fetchInitialData() {
        console.log("➡️  Đang lấy dữ liệu khởi tạo (CSRF, Machine ID)...");
        try {
            const res = await fetch(INSTAGRAM_URLS.BASE, {
                headers: { ...BASE_HEADERS, 'user-agent': this.#session.userAgent },
                agent: this.#proxyAgent,
            });

            this.#updateCookies(res);
            const html = await res.text();
            
            this.#session.csrfToken = html.match(/"csrf_token":"([^"]+)"/)?.[1];
            this.#session.machineId = html.match(/"device_id":"([^"]+)"/)?.[1];
            
            if (!this.#session.csrfToken || !this.#session.machineId) {
                throw new Error(); // Ném lỗi để catch bên dưới xử lý
            }
            console.log("✅  Lấy dữ liệu khởi tạo thành công!");
        } catch (error) {
            throw new ScrapingError();
        }
    }

    /**
     * Xử lý bước xác thực 2 yếu tố (2FA).
     * @private
     */
    async #handleTwoFactor(twoFactorInfo) {
        console.log("🔐  Yêu cầu xác thực hai yếu tố (2FA)...");
        if (!this.#auth.twofa) {
            throw new TwoFactorError("Thiếu mã bí mật 2FA để tiếp tục.");
        }

        const { token } = twofactor.generateToken(this.#auth.twofa);
        if (!token) {
            throw new TwoFactorError("Tạo mã 2FA thất bại từ mã bí mật được cung cấp.");
        }
        console.log(`🔑  Đã tạo mã 2FA: ${token}`);

        const body = new URLSearchParams({
            username: this.#auth.username,
            identifier: twoFactorInfo.two_factor_identifier,
            verificationCode: token,
            queryParams: '{"next":"/"}',
        }).toString();

        const res = await fetch(INSTAGRAM_URLS.TWO_FACTOR_AJAX, {
            method: 'POST',
            headers: {
                ...BASE_HEADERS,
                'user-agent': this.#session.userAgent,
                'content-type': 'application/x-www-form-urlencoded',
                'x-csrftoken': this.#session.csrfToken,
                'x-web-device-id': this.#session.machineId,
                'cookie': this.#session.cookies,
            },
            agent: this.#proxyAgent,
            body,
        });

        this.#updateCookies(res);
        const data = await res.json();

        if (!data.authenticated) {
            throw new TwoFactorError(data.message || "Xác thực 2FA thất bại.");
        }

        console.log("✅  Xác thực 2FA thành công!");
    }

    /**
     * Xác thực session bằng cách kiểm tra dữ liệu người dùng.
     * @private
     */
    async #verifySession() {
        console.log("🧐  Đang xác thực session...");
        const res = await fetch(INSTAGRAM_URLS.SHARED_DATA, {
            headers: {
                ...BASE_HEADERS,
                'user-agent': this.#session.userAgent,
                'cookie': this.#session.cookies,
            },
            agent: this.#proxyAgent,
        });

        const data = await res.json();
        
        if (data.config?.viewer) {
            console.log(`✅  Xác thực thành công cho user: ${data.config.viewer.username}`);
            return data.config.viewer;
        }

        // Các trường hợp lỗi khác sau khi đã login
        if (res.url.includes('/challenge/')) {
            throw new CheckpointError(res.url);
        }
        if (data.checkpoint_url?.includes('accounts/disabled')) {
            throw new InstagramError('Tài khoản đã bị vô hiệu hóa.');
        }

        throw new LoginRequiredError();
    }
    
    /**
     * Hàm chính để thực hiện đăng nhập bằng username và password.
     */
    async login() {
        try {
            await this.#fetchInitialData();

            console.log(`🚀  Bắt đầu đăng nhập cho user: ${this.#auth.username}...`);
            
            const encryptedPassword = `#PWD_INSTAGRAM_BROWSER:0:${Math.floor(Date.now() / 1000)}:${this.#auth.password}`;
            const body = new URLSearchParams({
                enc_password: encryptedPassword,
                username: this.#auth.username,
                optIntoOneTap: 'false',
                queryParams: '{}',
            }).toString();

            const res = await fetch(INSTAGRAM_URLS.LOGIN_AJAX, {
                method: 'POST',
                headers: {
                    ...BASE_HEADERS,
                    'user-agent': this.#session.userAgent,
                    'content-type': 'application/x-www-form-urlencoded',
                    'x-csrftoken': this.#session.csrfToken,
                    'x-web-device-id': this.#session.machineId,
                    'cookie': this.#session.cookies,
                },
                agent: this.#proxyAgent,
                body,
            });

            this.#updateCookies(res);
            const data = await res.json();

            if (data.authenticated) {
                console.log("🎉  Đăng nhập thành công (chưa qua 2FA)!");
            } else if (data.two_factor_required) {
                await this.#handleTwoFactor(data.two_factor_info);
            } else if (data.checkpoint_url) {
                throw new CheckpointError(data.checkpoint_url);
            } else if (data.error_type === 'UserInvalidCredentials') {
                 throw new InvalidCredentialsError("Thông tin đăng nhập không đúng.");
            } else {
                // Các lỗi chung chung khác
                throw new InstagramError(data.message || 'Lỗi đăng nhập không xác định.');
            }

            // Sau khi đăng nhập hoặc 2FA thành công, xác thực lại session
            const userData = await this.#verifySession();

            return {
                success: true,
                userData,
                cookies: this.#session.cookies,
            };

        } catch (error) {
            console.error(`💥  LỖI: ${error.message}`);
            // Ném lại lỗi để code bên ngoài có thể bắt và xử lý
            throw error;
        }
    }
}

module.exports = InstagramAuthenticator