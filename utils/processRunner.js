// utils/ProcessRunner.js
const EventEmitter = require('events');

class ProcessRunner extends EventEmitter {
    constructor(options = {}) {
        super();
        this.options = {
            concurrency: 5,      // Số luồng chạy đồng thời
            delay: 0,            // Thời gian chờ (ms) giữa các task
            retries: 3,          // Số lần thử lại nếu thất bại
            timeout: 30000,      // Timeout cho mỗi task (ms)
            maxErrors: 10,       // Dừng lại nếu có quá nhiều lỗi
            ...options,
        };

        this.tasks = [];
        this.queue = [];
        this.activeTasks = 0;
        this.completedTasks = 0;
        this.failedTasks = 0;
        this.totalTasks = 0;
        this.errors = 0;

        this.status = 'idle'; // idle, running, paused, stopped, finished
    }

    /**
     * Thêm các task cần xử lý.
     * @param {Array<Object>} tasks - Mảng các object, mỗi object có dạng { id: any, task: Function }
     */
    addTasks(tasks) {
        // Task được thêm vào phải có cấu trúc { id, task }
        this.tasks.push(...tasks);
        this.totalTasks = this.tasks.length;
    }

    /**
     * Bắt đầu chạy tiến trình.
     */
    start() {
        if (this.status !== 'idle' && this.status !== 'stopped') {
            console.warn(`[ProcessRunner] Chỉ có thể start khi đang ở trạng thái 'idle' hoặc 'stopped'.`);
            return;
        }
        
        if (this.tasks.length === 0) {
            console.warn(`[ProcessRunner] Không có task nào để chạy.`);
            this.emit('end', { message: 'Không có task nào.' });
            return;
        }
        
        this.queue = [...this.tasks];
        this.status = 'running';
        this.emit('start', { totalTasks: this.totalTasks });
        this._run();
    }

    /**
     * Tạm dừng tiến trình.
     */
    pause() {
        if (this.status !== 'running') return;
        this.status = 'paused';
        this.emit('pause');
    }

    /**
     * Tiếp tục tiến trình đã tạm dừng.
     */
    resume() {
        if (this.status !== 'paused') return;
        this.status = 'running';
        this.emit('resume');
        this._run();
    }

    /**
     * Dừng hẳn và reset tiến trình.
     */
    stop() {
        this.status = 'stopped';
        this.queue = [];
        this.activeTasks = 0;
        this.emit('stop');
    }

    _run() {
        if (this.status !== 'running') return;

        // Kiểm tra điều kiện dừng
        if (this.errors >= this.options.maxErrors) {
            this.status = 'stopped';
            this.emit('error', new Error(`Dừng tiến trình do vượt quá số lỗi tối đa (${this.options.maxErrors}).`));
            this.emit('end', { message: 'Đã dừng do quá nhiều lỗi.' });
            return;
        }

        // Lấy task từ hàng đợi để chạy
        while (this.activeTasks < this.options.concurrency && this.queue.length > 0) {
            this.activeTasks++;
            const taskWrapper = this.queue.shift(); // Lấy cả wrapper
            this._executeTask(taskWrapper);
        }

        // Kiểm tra hoàn thành
        if (this.activeTasks === 0 && this.queue.length === 0) {
            this.status = 'finished';
            this.emit('end', { 
                message: 'Tất cả các task đã hoàn thành.',
                completed: this.completedTasks,
                failed: this.failedTasks
            });
        }
    }

    async _executeTask(taskWrapper, attempt = 1) {
        if (this.status === 'stopped') {
            this.activeTasks--;
            return;
        }
        
        this.emit('task:start', { taskWrapper, attempt });

        try {
            const result = await this._runWithTimeout(taskWrapper.task);
            this.completedTasks++;
            this.emit('task:complete', { result, taskWrapper }); // Trả về cả wrapper
        } catch (error) {
            if (attempt < this.options.retries) {
                this.emit('task:retry', { error: error.message, taskWrapper, attempt: attempt + 1 });
                await this._delay(1000); // Chờ 1s trước khi thử lại
                this._executeTask(taskWrapper, attempt + 1);
                return; // Tránh thực thi code phía dưới
            } else {
                this.errors++;
                this.failedTasks++;
                this.emit('task:error', { error: error.message, taskWrapper }); // Trả về cả wrapper
            }
        }
        
        this.activeTasks--;
        
        // Chạy task tiếp theo sau khi delay
        await this._delay(this.options.delay);
        this._run();
    }

    _runWithTimeout(taskFunc) { // Nhận vào một hàm
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Task timed out sau ${this.options.timeout}ms`));
            }, this.options.timeout);

            Promise.resolve(taskFunc()) // Thực thi hàm
                .then(result => {
                    clearTimeout(timer);
                    resolve(result);
                })
                .catch(err => {
                    clearTimeout(timer);
                    reject(err);
                });
        });
    }

    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = ProcessRunner;