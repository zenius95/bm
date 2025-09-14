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
            sortOrder = 'desc',
        } = queryOptions;
        
        const query = this._buildQuery(queryOptions);

        const sortOptions = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };
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
        return this.Model.findByIdAndUpdate(id, { isDeleted: false, deletedAt: null });
    }

    async hardDelete(id) {
        return this.Model.findByIdAndDelete(id);
    }
    
    /**
     * [SỬA LỖI] Xây dựng query từ queryOptions, loại bỏ các key không cần thiết
     */
    _buildQuery(queryOptions = {}) {
        const query = {};
        const { search, inTrash, ...filters } = queryOptions;

        // Lọc theo thùng rác
        if (inTrash === 'true' || inTrash === true) {
            query.isDeleted = true;
        } else {
            query.isDeleted = { $ne: true };
        }

        // Lọc theo các trường cụ thể (ví dụ: status)
        for (const key in filters) {
            // Chỉ thêm vào query nếu nó không phải là key dành riêng cho việc sắp xếp/phân trang
            if (Object.prototype.hasOwnProperty.call(filters, key) && filters[key]) {
                const reservedKeys = ['page', 'limit', 'sortBy', 'sortOrder'];
                if (!reservedKeys.includes(key)) {
                    query[key] = filters[key];
                }
            }
        }
        
        // Tìm kiếm
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
        return this.Model.updateMany(query, { isDeleted: true, deletedAt: new Date() });
    }

    async restoreMany(queryOptions) {
        const query = this._buildQuery(queryOptions);
        return this.Model.updateMany(query, { isDeleted: false, deletedAt: null });
    }

    async hardDeleteMany(queryOptions) {
        const query = this._buildQuery(queryOptions);
        return this.Model.deleteMany(query);
    }

    async findAllIds(queryOptions) {
        const query = this._buildQuery(queryOptions);
        const documents = await this.Model.find(query).select('_id').lean();
        return documents.map(doc => doc._id.toString());
    }
}

module.exports = CrudService;