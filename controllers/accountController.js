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
    const errors = [];

    lines.forEach(line => {
        const parts = line.trim().split('|');
        if (parts.length >= 3) {
            newAccounts.push({
                uid: parts[0],
                password: parts[1],
                twofa: parts[2],
                proxy: parts[3] || '' // Proxy là tùy chọn
            });
        }
    });

    if (newAccounts.length > 0) {
        try {
            // Dùng insertMany với ordered: false để bỏ qua các bản ghi lỗi (ví dụ: trùng username) và tiếp tục insert
            await Account.insertMany(newAccounts, { ordered: false });
        } catch (error) {
            // Lỗi sẽ xảy ra nếu có username trùng, nhưng các username không trùng vẫn sẽ được thêm vào
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

        // Đảm bảo ids luôn là một mảng
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