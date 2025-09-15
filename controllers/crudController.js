// controllers/crudControllerFactory.js
const createCrudController = (crudService, viewName, options = {}) => {
    const { single, plural } = options;

    // Helper function để render view trong thư mục admin
    const renderData = (res, path, data) => {
        res.render(`admin/${path}`, { ...data, currentQuery: res.locals.currentQuery });
    };
    
    const parseQueryMiddleware = (req, res, next) => {
        res.locals.currentQuery = req.query;
        next();
    };

    const handleGetAll = async (req, res) => {
        try {
            const { data, pagination } = await crudService.find(req.query);
            const trashCount = await crudService.Model.countDocuments({ isDeleted: true });

            // Sửa ở đây: Truyền viewName (ví dụ: 'accounts') vào helper
            renderData(res, viewName, { [plural]: data, pagination, trashCount });
        } catch (error) {
            console.error(`Error getting all ${plural}:`, error);
            res.status(500).send(`Could not load ${plural}.`);
        }
    };

    const handleGetById = async (req, res) => {
        try {
            const item = await crudService.getById(req.params.id);
            if (!item) {
                return res.status(404).send(`${single} not found.`);
            }
            // Sửa ở đây: Render view chi tiết từ thư mục admin
            res.render(`admin/${viewName.replace(/s$/, '')}-detail`, { [single]: item }); 
        } catch (error) {
            console.error(`Error getting ${single} by id:`, error);
            res.status(500).send(`Could not load ${single}.`);
        }
    };

    const handleCreate = async (req, res) => {
        try {
            await crudService.create(req.body);
            // Sửa ở đây: Chuyển hướng đến đúng URL admin
            res.redirect(`/admin/${plural}`);
        } catch (error) {
            console.error(`Error creating ${single}:`, error);
            res.status(500).send(`Could not create ${single}.`);
        }
    };
    
    const handleUpdate = async (req, res) => {
        try {
            await crudService.update(req.params.id, req.body);
            // Sửa ở đây: Chuyển hướng đến đúng URL admin
            res.redirect(`/admin/${plural}`);
        } catch (error) {
            console.error(`Error updating ${single}:`, error);
            res.status(500).send(`Could not update ${single}.`);
        }
    };

    const handleSoftDelete = async (req, res) => {
        try {
            let modifiedCount = 0;
            if (req.body.selectAll) {
                const result = await crudService.softDeleteMany(req.body.filters);
                modifiedCount = result.modifiedCount;
            } else {
                const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
                if (ids.length > 0) {
                    await Promise.all(ids.map(id => crudService.softDelete(id)));
                    modifiedCount = ids.length;
                }
            }
            const newTrashCount = await crudService.Model.countDocuments({ isDeleted: true });
            req.io.emit(`${viewName}:trash:update`, { newTrashCount });
            res.json({ success: true, message: `Đã chuyển ${modifiedCount} mục vào thùng rác.` });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    };

    const handleRestore = async (req, res) => {
        try {
            let modifiedCount = 0;
            if (req.body.selectAll) {
                const result = await crudService.restoreMany(req.body.filters);
                modifiedCount = result.modifiedCount;
            } else {
                const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
                if (ids.length > 0) {
                    await Promise.all(ids.map(id => crudService.restore(id)));
                    modifiedCount = ids.length;
                }
            }
            const newTrashCount = await crudService.Model.countDocuments({ isDeleted: true });
            req.io.emit(`${viewName}:trash:update`, { newTrashCount });
            res.json({ success: true, message: `Đã khôi phục ${modifiedCount} mục.` });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    };

    const handleHardDelete = async (req, res) => {
        try {
            let deletedCount = 0;
            if (req.body.selectAll) {
                const result = await crudService.hardDeleteMany(req.body.filters);
                deletedCount = result.deletedCount;
            } else {
                const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
                if (ids.length > 0) {
                    await Promise.all(ids.map(id => crudService.hardDelete(id)));
                    deletedCount = ids.length;
                }
            }
            const newTrashCount = await crudService.Model.countDocuments({ isDeleted: true });
            req.io.emit(`${viewName}:trash:update`, { newTrashCount });
            res.json({ success: true, message: `Đã xóa vĩnh viễn ${deletedCount} mục.` });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    };
    
    return {
        parseQueryMiddleware,
        handleGetAll,
        handleGetById,
        handleCreate,
        handleUpdate,
        handleSoftDelete,
        handleRestore,
        handleHardDelete,
    };
};

module.exports = createCrudController;