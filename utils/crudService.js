// utils/crudService.js

class CrudService {
    constructor(Model, options = {}) {
        this.Model = Model;
        this.searchableFields = options.searchableFields || [];
        this.populateFields = options.populateFields || [];
        this.additionalSoftDeleteFields = options.additionalSoftDeleteFields || {};
        this.defaultSort = options.defaultSort || { createdAt: -1 };
    }

    // <<< SỬA LỖI: THÊM HÀM getById BỊ THIẾU >>>
    async getById(id) {
        let query = this.Model.findById(id);
        if (this.populateFields.length > 0) {
            this.populateFields.forEach(field => query.populate(field));
        }
        return query.lean();
    }

    async find(queryParams) {
        const page = parseInt(queryParams.page, 10) || 1;
        const limit = parseInt(queryParams.limit, 10) || 20;
        const inTrash = queryParams.inTrash === 'true';
        let dbQuery = { isDeleted: inTrash };

        if (queryParams.search && this.searchableFields.length > 0) {
            const searchQuery = { 
                $or: this.searchableFields.map(field => ({
                    [field]: { $regex: queryParams.search, $options: 'i' }
                }))
            };
            dbQuery = { ...dbQuery, ...searchQuery };
        }
        
        if (queryParams.status && queryParams.status !== '') {
            dbQuery.status = queryParams.status;
        }

        if (queryParams.user && queryParams.user !== '') {
            dbQuery.user = queryParams.user;
        }

        const totalItems = await this.Model.countDocuments(dbQuery);
        
        let sort = {};
        if (queryParams.sort_by && queryParams.sort_order) {
            sort[queryParams.sort_by] = queryParams.sort_order === 'asc' ? 1 : -1;
        } else {
            sort = this.defaultSort;
        }

        const query = this.Model.find(dbQuery)
            .sort(sort)
            .skip((page - 1) * limit)
            .limit(limit);

        if (this.populateFields.length > 0) {
            this.populateFields.forEach(field => query.populate(field));
        }

        const data = await query.lean();

        return {
            data,
            pagination: {
                totalItems,
                currentPage: page,
                totalPages: Math.ceil(totalItems / limit),
            }
        };
    }

    async findAllIds(filters) {
        const inTrash = filters.inTrash === 'true';
        let dbQuery = { isDeleted: inTrash };

        if (filters.search && this.searchableFields.length > 0) {
            dbQuery.$or = this.searchableFields.map(field => ({
                [field]: { $regex: filters.search, $options: 'i' }
            }));
        }
        if (filters.status) {
            dbQuery.status = filters.status;
        }

        const items = await this.Model.find(dbQuery).select('_id').lean();
        return items.map(item => item._id);
    }
    
    async create(data) {
        return this.Model.create(data);
    }

    async update(id, data) {
        return this.Model.findByIdAndUpdate(id, data, { new: true, runValidators: true });
    }

    async softDelete(ids) {
        const updateData = { isDeleted: true, deletedAt: new Date(), ...this.additionalSoftDeleteFields };
        return this.Model.updateMany({ _id: { $in: ids } }, { $set: updateData });
    }

    async restore(ids) {
        const updateData = { isDeleted: false, deletedAt: null };
        return this.Model.updateMany({ _id: { $in: ids } }, { $set: updateData });
    }

    async hardDelete(ids) {
        return this.Model.deleteMany({ _id: { $in: ids } });
    }
}

module.exports = CrudService;