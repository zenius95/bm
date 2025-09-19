// controllers/proxyController.js
const Proxy = require('../models/Proxy');
const CrudService = require('../utils/crudService');
const createCrudController = require('./crudController');
const { runCheckProxy } = require('../utils/checkProxyService');
const settingsService = require('../utils/settingsService');

const proxyService = new CrudService(Proxy, {
    searchableFields: ['proxyString', 'status', 'notes']
});

const proxyController = createCrudController(proxyService, 'proxies', {
    single: 'proxy',
    plural: 'proxies'
});

// Ghi đè phương thức handleGetAll để đếm số lượng trong thùng rác
proxyController.handleGetAll = async (req, res) => {
    try {
        const { data, pagination } = await proxyService.find(req.query);
        const trashCount = await proxyService.Model.countDocuments({ isDeleted: true });

        const title = 'Proxy Management';

        res.render('admin/proxies', { 
            proxies: data, 
            pagination, 
            trashCount,
            title,
            page: 'proxies',
            currentQuery: res.locals.currentQuery
        });
    } catch (error) {
        console.error(`Error getting all proxies:`, error);
        res.status(500).send(`Could not load proxies.`);
    }
};

// Ghi đè phương thức handleCreate để xử lý việc thêm hàng loạt và trả về JSON
proxyController.handleCreate = async (req, res) => {
    try {
        const { proxyData } = req.body;
        if (!proxyData || proxyData.trim() === '') {
            return res.status(400).json({ success: false, message: 'Vui lòng nhập danh sách proxy.' });
        }
        
        const lines = proxyData.trim().split('\n').filter(line => line.trim() !== '');
        const proxiesToInsert = [];
        const protocol = 'http'; // Mặc định protocol là http

        lines.forEach(line => {
            const parts = line.trim().split(':');
            if (parts.length >= 2) { // Yêu cầu tối thiểu phải có ip:port
                const [host, port, user, pass] = parts;
                let proxyString = '';
                if (user && pass) {
                    proxyString = `${protocol}://${user}:${pass}@${host}:${port}`;
                } else {
                    proxyString = `${protocol}://${host}:${port}`;
                }
                proxiesToInsert.push({ proxyString });
            }
        });
        
        if (proxiesToInsert.length === 0) {
            return res.status(400).json({ success: false, message: 'Không có proxy nào hợp lệ để thêm. Vui lòng kiểm tra định dạng ip:port:user:password.' });
        }
        
        let addedCount = 0;
        try {
            const result = await Proxy.insertMany(proxiesToInsert, { ordered: false });
            addedCount = result.length;
        } catch (error) {
             // Xử lý lỗi trùng lặp, chỉ đếm những mục đã được thêm thành công
            if (error.code === 11000) {
                addedCount = error.result.nInserted;
            } else {
                throw error; // Ném các lỗi khác
            }
        }

        if (addedCount > 0) {
            return res.json({ success: true, message: `Đã thêm thành công ${addedCount} proxy mới. Các proxy bị trùng lặp đã được bỏ qua.` });
        } else {
            return res.status(400).json({ success: false, message: 'Tất cả proxy được gửi đã tồn tại hoặc không hợp lệ.' });
        }

    } catch (error) {
        let errorMessage = 'Lỗi server khi thêm proxy.';
        if (error.name === 'ValidationError') {
            errorMessage = Object.values(error.errors).map(e => e.message).join(', ');
        }
        return res.status(500).json({ success: false, message: errorMessage });
    }
};

// Ghi đè phương thức handleUpdate để trả về JSON cho modal
proxyController.handleUpdate = async (req, res) => {
    try {
        const { id } = req.params;
        const { proxyString, status, notes } = req.body;

        if (!proxyString) {
             return res.status(400).json({ success: false, message: 'Proxy string không được để trống.' });
        }

        const updatedProxy = await proxyService.update(id, { proxyString, status, notes });
        if (!updatedProxy) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy proxy.' });
        }
        
        return res.json({ success: true, message: 'Cập nhật proxy thành công.' });
    } catch (error) {
        let errorMessage = 'Lỗi server khi cập nhật proxy.';
        if (error.name === 'ValidationError') {
            errorMessage = Object.values(error.errors).map(e => e.message).join(', ');
        } else if (error.code === 11000) {
            errorMessage = 'Proxy string này đã tồn tại.';
        }
        return res.status(500).json({ success: false, message: errorMessage });
    }
};

// Thêm hàm checkSelected
proxyController.checkSelected = async (req, res) => {
    const { ids, selectAll, filters } = req.body;
    const io = req.io;
    
    try {
        let proxyIdsToCheck = [];
        if (selectAll) {
            proxyIdsToCheck = await proxyService.findAllIds(filters);
        } else {
            proxyIdsToCheck = ids;
        }

        if (!proxyIdsToCheck || proxyIdsToCheck.length === 0) {
            return res.status(400).json({ success: false, message: 'Không có proxy nào được chọn.' });
        }
    
        res.json({ success: true, message: `Đã bắt đầu tiến trình kiểm tra cho ${proxyIdsToCheck.length} proxy.` });

        const checkProxyConfig = settingsService.get('autoProxyCheck');
        runCheckProxy(proxyIdsToCheck, io, {
            concurrency: checkProxyConfig.concurrency,
            delay: checkProxyConfig.delay,
            timeout: checkProxyConfig.timeout
        });

    } catch (error) {
        console.error("Lỗi khi chuẩn bị tiến trình kiểm tra proxy:", error);
         if (!res.headersSent) {
            res.status(500).json({ success: false, message: 'Lỗi server khi chuẩn bị tiến trình.' });
        }
    }
};

// Thêm hàm getAllProxies để xử lý copy tất cả
proxyController.getAllProxies = async (req, res) => {
    const { filters } = req.body;
    try {
        const proxies = await Proxy.find({ ...filters, isDeleted: filters.inTrash === 'true' }).lean();
        const proxyStrings = proxies.map(p => p.proxyString);
        res.json({ success: true, proxies: proxyStrings });
    } catch (error) {
        console.error("Lỗi khi lấy tất cả proxy:", error);
        res.status(500).json({ success: false, message: 'Lỗi server.' });
    }
};

module.exports = proxyController;