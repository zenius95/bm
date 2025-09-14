// controllers/accountController.js
const Account = require('../models/Account');

// Hiển thị trang quản lý account
exports.getAccountPage = async (req, res) => {
    try {
        const accounts = await Account.find({}).sort({ createdAt: -1 });
        res.render('accounts', { accounts });
    } catch (error) {
        console.error("Error loading accounts page:", error);
        res.status(500).send("Could not load accounts page.");
    }
};

// Thêm nhiều account từ textarea
exports.addAccounts = async (req, res) => {
    const { accountsData } = req.body;
    if (!accountsData) {
        return res.redirect('/admin/accounts');
    }
    const lines = accountsData.trim().split('\n');
    const newAccounts = [];
    lines.forEach(line => {
        const parts = line.trim().split('|');
        if (parts.length >= 3) {
            newAccounts.push({
                username: parts[0],
                password: parts[1],
                twoFA: parts[2],
                proxy: parts[3] || ''
            });
        }
    });
    if (newAccounts.length > 0) {
        try {
            await Account.insertMany(newAccounts, { ordered: false });
        } catch (error) {
            console.log("Partial insert completed. Some accounts might be duplicates.");
        }
    }
    res.redirect('/admin/accounts');
};

// Xóa một hoặc nhiều account
exports.deleteAccounts = async (req, res) => {
    try {
        let { ids } = req.body;
        if (!ids) {
            return res.status(400).json({ success: false, message: 'No account IDs provided.' });
        }
        if (!Array.isArray(ids)) {
            ids = [ids];
        }
        await Account.deleteMany({ _id: { $in: ids } });
        res.json({ success: true, message: 'Accounts deleted successfully.' });
    } catch (error) {
        console.error("Error deleting accounts:", error);
        res.status(500).json({ success: false, message: 'Failed to delete accounts.' });
    }
};

// Check live nhiều account
exports.checkSelectedAccounts = async (req, res) => {
    let { ids } = req.body;
    const io = req.io; // Lấy io từ request

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ success: false, message: 'No account IDs provided.' });
    }

    // Phản hồi ngay lập tức
    res.json({ success: true, message: `Started checking ${ids.length} accounts.` });

    // --- BẮT ĐẦU QUÁ TRÌNH CHẠY NGẦM VÀ BÁO CÁO REAL-TIME ---
    ids.forEach(async (accountId) => {
        try {
            await Account.findByIdAndUpdate(accountId, { status: 'CHECKING' });
            // Gửi cập nhật tức thì cho client
            io.emit('account:update', { 
                id: accountId, 
                status: 'CHECKING'
            });

            // MÔ PHỎNG QUÁ TRÌNH CHECK
            await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 3000));
            const isLive = Math.random() > 0.4;
            const newStatus = isLive ? 'LIVE' : 'DIE';
            const lastCheckedAt = new Date();

            await Account.findByIdAndUpdate(accountId, {
                status: newStatus,
                lastCheckedAt: lastCheckedAt
            });

            // Gửi kết quả cuối cùng cho client
            io.emit('account:update', {
                id: accountId,
                status: newStatus,
                lastCheckedAt: lastCheckedAt.toLocaleString('vi-VN')
            });

        } catch (error) {
            console.error(`Error checking account ${accountId}:`, error);
            await Account.findByIdAndUpdate(accountId, { status: 'UNCHECKED' });
            // Gửi thông báo lỗi cho client
            io.emit('account:update', {
                id: accountId,
                status: 'UNCHECKED'
            });
        }
    });
};