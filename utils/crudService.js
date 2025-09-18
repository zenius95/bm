// utils/crudService.js
const mongoose = require('mongoose');
// === START: THÊM IMPORT CÁC MODEL LIÊN QUAN ===
const Item = require('../models/Item');
const Log = require('../models/Log');
// === END: THÊM IMPORT CÁC MODEL LIÊN QUAN ===

class CrudService {
    /**
     * @param {mongoose.Model} Model - Mongoose model
     * @param {Object} options - Các tùy chọn
     * @param {string[]} options.searchableFields - Các trường có thể tìm kiếm
     * @param {Object | string} options.populateFields - Tùy chọn populate cho Mongoose
     * @param {Object} options.additionalSoftDeleteFields - Các trường bổ sung để cập nhật khi xóa mềm
     */
    constructor(Model, options = {}) {
        this.Model = Model;
        this.options = {
            searchableFields: [],
            populateFields: null, 
            additionalSoftDeleteFields: {}, // Thêm tùy chọn mới
            ...options
        };
    }

    /**
     * Lấy danh sách các mục với đầy đủ tùy chọn
     */
    async find(queryOptions = {}) {
        const {
            page = 1,
            limit = 20,
            sortBy = 'createdAt',
            sortOrder = 'desc', // Thay đổi mặc định thành 'desc' cho hợp lý hơn
        } = queryOptions;
        
        const query = this._buildQuery(queryOptions);

        const sortOptions = { 
            [sortBy]: sortOrder === 'asc' ? 1 : -1,
            _id: 1 
        };

        const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

        const totalItems = await this.Model.countDocuments(query);
        
        let queryBuilder = this.Model.find(query);

        if (this.options.populateFields) {
            queryBuilder = queryBuilder.populate(this.options.populateFields);
        }
        
        const data = await queryBuilder
            .sort(sortOptions)
            .skip(skip)
            .limit(parseInt(limit, 10))
            .lean();

        return {
            data,
            pagination: {
                totalItems,
                currentPage: parseInt(page, 10),
                totalPages: Math.ceil(totalItems / limit),
                limit: parseInt(limit, 10),
            },
        };
    }
    
    async getById(id) {
        let queryBuilder = this.Model.findById(id);
        if (this.options.populateFields) {
            queryBuilder = queryBuilder.populate(this.options.populateFields);
        }
        return queryBuilder.lean();
    }

    async create(data) {
        const newItem = new this.Model(data);
        return newItem.save();
    }

    async update(id, data) {
        return this.Model.findByIdAndUpdate(id, data, { new: true });
    }

    // --- CÁC HÀM ĐƠN LẺ ---
    async softDelete(id) {
        const updateQuery = { 
            isDeleted: true, 
            deletedAt: new Date(), 
            ...this.options.additionalSoftDeleteFields 
        };
        return this.Model.findByIdAndUpdate(id, updateQuery);
    }

    async restore(id) {
        return this.Model.findByIdAndUpdate(id, { isDeleted: false, deletedAt: null, dieStreak: 0 });
    }

    async hardDelete(id) {
        // Áp dụng logic xóa theo tầng cho cả hàm xóa đơn lẻ
        if (this.Model.modelName === 'Order') {
            const orderIds = [id];
            await Promise.all([
                Item.deleteMany({ orderId: { $in: orderIds } }),
                Log.deleteMany({ orderId: { $in: orderIds } }),
            ]);
        }
        return this.Model.findByIdAndDelete(id);
    }
    
    _buildQuery(queryOptions = {}) {
        const { search, inTrash, ...filters } = queryOptions;
        
        if (inTrash === 'true' || inTrash === true) {
            const trashQuery = { isDeleted: true };
            if (search && this.options.searchableFields.length > 0) {
                trashQuery.$or = this.options.searchableFields.map(field => ({
                    [field]: { $regex: search, $options: 'i' }
                }));
            }
            return trashQuery;
        }

        const query = { isDeleted: { $ne: true } };

        for (const key in filters) {
            if (Object.prototype.hasOwnProperty.call(filters, key) && filters[key]) {
                const reservedKeys = ['page', 'limit', 'sortBy', 'sortOrder'];
                if (!reservedKeys.includes(key)) {
                    query[key] = filters[key];
                }
            }
        }
        
        if (search && this.options.searchableFields.length > 0) {
            query.$or = this.options.searchableFields.map(field => ({
                [field]: { $regex: search, $options: 'i' }
            }));
        }
        return query;
    }

    // --- CÁC HÀM HÀNG LOẠT ---
    async softDeleteMany(queryOptions) {
        const query = this._buildQuery(queryOptions);
        const updateQuery = { 
            isDeleted: true, 
            deletedAt: new Date(), 
            ...this.options.additionalSoftDeleteFields 
        };
        return this.Model.updateMany(query, updateQuery);
    }

    async restoreMany(queryOptions) {
        const query = this._buildQuery(queryOptions);
        return this.Model.updateMany(query, { isDeleted: false, deletedAt: null, dieStreak: 0 });
    }
    
    // === START: NÂNG CẤP LOGIC XÓA HÀNG LOẠT ===
    async hardDeleteMany(queryOptions) {
        const query = this._buildQuery(queryOptions);

        // Nếu model không phải là Order, thực hiện xóa như bình thường
        if (this.Model.modelName !== 'Order') {
            return this.Model.deleteMany(query);
        }

        // Logic xóa theo tầng dành riêng cho Order
        const ordersToDelete = await this.Model.find(query).select('_id').lean();
        if (ordersToDelete.length === 0) {
            return { deletedCount: 0 };
        }

        const orderIds = ordersToDelete.map(o => o._id);

        // Xóa đồng thời Items và Logs liên quan
        const [itemDeletionResult, logDeletionResult, orderDeletionResult] = await Promise.all([
            Item.deleteMany({ orderId: { $in: orderIds } }),
            Log.deleteMany({ orderId: { $in: orderIds } }),
            this.Model.deleteMany({ _id: { $in: orderIds } }) // Sử dụng ID để xóa chính xác
        ]);

        console.log(`- Đã xóa ${itemDeletionResult.deletedCount} items.`);
        console.log(`- Đã xóa ${logDeletionResult.deletedCount} logs.`);
        console.log(`- Đã xóa ${orderDeletionResult.deletedCount} orders.`);

        return orderDeletionResult;
    }
    // === END: NÂNG CẤP LOGIC XÓA HÀNG LOẠT ===

    async findAllIds(queryOptions) {
        const {
            sortBy = 'createdAt',
            sortOrder = 'asc',
        } = queryOptions;

        const query = this._buildQuery(queryOptions);
        
        const sortOptions = { 
            [sortBy]: sortOrder === 'asc' ? 1 : -1,
            _id: 1
        };

        const documents = await this.Model.find(query)
            .sort(sortOptions)
            .select('_id')
            .lean();
            
        return documents.map(doc => doc._id.toString());
    }
}

module.exports = CrudService;