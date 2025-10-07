// controllers/siteController.js
const Site = require('../models/Site');
const User = require('../models/User');
const CrudService = require('../utils/crudService');
const createCrudController = require('./crudController');
const { logActivity } = require('../utils/activityLogService');

const siteService = new CrudService(Site, {
    searchableFields: ['name', 'domain'],
    populateFields: ['owner']
});

const siteController = createCrudController(siteService, 'sites', {
    single: 'site',
    plural: 'sites'
});

// Ghi đè lại hàm handleGetAll để render view và lấy thêm dữ liệu cần thiết
siteController.handleGetAll = async (req, res) => {
    try {
        // Chỉ Super Admin mới được truy cập trang này
        if (req.session.user.role !== 'superadmin') {
            return res.status(403).send('Forbidden');
        }

        const { data, pagination } = await siteService.find(req.query);
        
        res.render('admin/sites', {
            sites: data,
            pagination,
            title: 'Site Management',
            page: 'sites', // Để active sidebar
            currentQuery: res.locals.currentQuery
        });
    } catch (error) {
        console.error(`Error getting all sites:`, error);
        res.status(500).send(`Could not load sites.`);
    }
};

// Hàm tạo Site mới (kèm theo tạo admin cho site đó)
siteController.handleCreate = async (req, res) => {
    const session = await Site.startSession();
    session.startTransaction();
    try {
        const { name, domain, ownerUsername, ownerEmail, ownerPassword } = req.body;

        // 1. Kiểm tra xem admin cho site con đã tồn tại chưa
        const existingUser = await User.findOne({ 
            $or: [{ username: ownerUsername.toLowerCase() }, { email: ownerEmail.toLowerCase() }] 
        }).session(session);

        if (existingUser) {
            throw new Error('Username hoặc Email cho chủ site đã tồn tại.');
        }

        // 2. Tạo user admin mới cho site con
        const newSiteOwner = new User({
            username: ownerUsername,
            email: ownerEmail,
            password: ownerPassword,
            role: 'admin', // Vai trò là 'admin', không phải 'superadmin'
            balance: 0
        });
        await newSiteOwner.save({ session });

        // 3. Tạo site mới và gán owner
        const newSite = new Site({
            name,
            domain,
            owner: newSiteOwner._id
        });
        await newSite.save({ session });
        
        // 4. Cập nhật lại siteId cho user admin vừa tạo
        newSiteOwner.siteId = newSite._id;
        await newSiteOwner.save({ session });
        
        await session.commitTransaction();

        await logActivity(req.session.user.id, 'SUPERADMIN_CREATE_SITE', {
            details: `Super Admin '${req.session.user.username}' đã tạo site mới '${name}' (${domain}) với chủ sở hữu là '${ownerUsername}'.`,
            ipAddress: req.ip || req.connection.remoteAddress,
            context: 'Admin'
        });

        res.json({ success: true, message: 'Tạo site và tài khoản admin thành công!' });

    } catch (error) {
        await session.abortTransaction();
        console.error("Error creating site:", error);
        res.status(500).json({ success: false, message: error.message || 'Lỗi server khi tạo site.' });
    } finally {
        session.endSession();
    }
};

// Hàm cập nhật thông tin Site và cấu hình ngân hàng
siteController.handleUpdate = async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            name, domain, isActive, 
            bankName, accountName, accountNumber, 
            autoDepositApiKey, autoDepositPrefix, autoDepositIsEnabled 
        } = req.body;

        const updateData = {
            name,
            domain,
            isActive: isActive === 'true',
            depositInfo: {
                bankName,
                accountName,
                accountNumber
            },
            autoDeposit: {
                apiKey: autoDepositApiKey,
                prefix: autoDepositPrefix,
                isEnabled: autoDepositIsEnabled === 'true'
            }
        };

        const updatedSite = await siteService.update(id, updateData);
        if (!updatedSite) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy site.' });
        }
        
        await logActivity(req.session.user.id, 'SUPERADMIN_UPDATE_SITE', {
            details: `Super Admin '${req.session.user.username}' đã cập nhật thông tin cho site '${name}'.`,
            ipAddress: req.ip || req.connection.remoteAddress,
            context: 'Admin'
        });

        res.json({ success: true, message: 'Cập nhật thông tin site thành công.' });
    } catch (error) {
        console.error("Error updating site:", error);
        res.status(500).json({ success: false, message: error.message || 'Lỗi server khi cập nhật site.' });
    }
};


module.exports = siteController;