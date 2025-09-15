// services/CrudService.js
class CrudService {
    /**
     * @param {mongoose.Model} Model - Mongoose model
     * @param {Object} options - Các tùy chọn
     * @param {string[]} options.searchableFields - Các trường có thể tìm kiếm
     */
    constructor(Model, options = {}) {
        this.Model = Model;
        this.options = {
            searchableFields: [],
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
            sortOrder = 'asc',
        } = queryOptions;
        
        const query = this._buildQuery(queryOptions);

        const sortOptions = { 
            [sortBy]: sortOrder === 'asc' ? 1 : -1,
            _id: 1 
        };

        const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

        const totalItems = await this.Model.countDocuments(query);
        const data = await this.Model.find(query)
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
        return this.Model.findById(id).lean();
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
        return this.Model.findByIdAndUpdate(id, { isDeleted: true, deletedAt: new Date() });
    }

    async restore(id) {
        return this.Model.findByIdAndUpdate(id, { isDeleted: false, deletedAt: null, dieStreak: 0 });
    }

    async hardDelete(id) {
        return this.Model.findByIdAndDelete(id);
    }
    
    // === START: THAY ĐỔI QUAN TRỌNG ===
    _buildQuery(queryOptions = {}) {
        const { search, inTrash, ...filters } = queryOptions;
        
        // Nếu đang xem thùng rác, chỉ lọc theo isDeleted và bỏ qua các filter khác
        if (inTrash === 'true' || inTrash === true) {
            const trashQuery = { isDeleted: true };
            // Vẫn cho phép tìm kiếm trong thùng rác
            if (search && this.options.searchableFields.length > 0) {
                trashQuery.$or = this.options.searchableFields.map(field => ({
                    [field]: { $regex: search, $options: 'i' }
                }));
            }
            return trashQuery;
        }

        // Logic cho chế độ xem thông thường
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
    // === END: THAY ĐỔI QUAN TRỌNG ===

    // --- CÁC HÀM HÀNG LOẠT ---
    async softDeleteMany(queryOptions) {
        const query = this._buildQuery(queryOptions);
        return this.Model.updateMany(query, { isDeleted: true, deletedAt: new Date() });
    }

    async restoreMany(queryOptions) {
        const query = this._buildQuery(queryOptions);
        return this.Model.updateMany(query, { isDeleted: false, deletedAt: null, dieStreak: 0 });
    }

    async hardDeleteMany(queryOptions) {
        const query = this._buildQuery(queryOptions);
        return this.Model.deleteMany(query);
    }

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