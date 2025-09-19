// utils/ProcessRunner.js
const EventEmitter = require('events');

class ProcessRunner extends EventEmitter {
    constructor(options = {}) {
        super();
        this.options = {
            concurrency: 5,      // Số luồng chạy đồng thời
            delay: 0,            // Thời gian chờ (ms) giữa các task
            // === START: THAY ĐỔI MẶC ĐỊNH ===
            retries: 0,          // Số lần thử lại nếu thất bại (0: không thử lại)
            timeout: 0,          // Timeout cho mỗi task (ms) (0: không có timeout)
            maxErrors: 0,       // Dừng lại nếu có quá nhiều lỗi (0: không giới hạn)
            // === END: THAY ĐỔI MẶC ĐỊNH ===
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

    addTasks(tasks) {
        this.tasks.push(...tasks);
        this.totalTasks = this.tasks.length;
    }

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

    pause() {
        if (this.status !== 'running') return;
        this.status = 'paused';
        this.emit('pause');
    }

    resume() {
        if (this.status !== 'paused') return;
        this.status = 'running';
        this.emit('resume');
        this._run();
    }

    stop() {
        this.status = 'stopped';
        this.queue = [];
        this.activeTasks = 0;
        this.emit('stop');
    }

    _run() {
        if (this.status !== 'running') return;

        // === START: THAY ĐỔI LOGIC - Chỉ kiểm tra maxErrors khi > 0 ===
        if (this.options.maxErrors > 0 && this.errors >= this.options.maxErrors) {
        // === END: THAY ĐỔI LOGIC ===
            this.status = 'stopped';
            this.emit('error', new Error(`Dừng tiến trình do vượt quá số lỗi tối đa (${this.options.maxErrors}).`));
            this.emit('end', { message: 'Đã dừng do quá nhiều lỗi.' });
            return;
        }

        while (this.activeTasks < this.options.concurrency && this.queue.length > 0) {
            this.activeTasks++;
            const taskWrapper = this.queue.shift();
            this._executeTask(taskWrapper);
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
            this.emit('task:complete', { result, taskWrapper });
        } catch (error) {
            // === START: THAY ĐỔI LOGIC - Chỉ thử lại khi retries > 0 ===
            if (this.options.retries > 0 && attempt <= this.options.retries) {
            // === END: THAY ĐỔI LOGIC ===
                this.emit('task:retry', { error: error, taskWrapper, attempt: attempt + 1 });
                await this._delay(1000);
                this._executeTask(taskWrapper, attempt + 1);
                return;
            } else {
                this.errors++;
                this.failedTasks++;
                this.emit('task:error', { error: error, taskWrapper });
            }
        }
        
        this.activeTasks--;
        
        if (this.status === 'running' && this.activeTasks === 0 && this.queue.length === 0) {
            this.status = 'finished';
            this.emit('end', { 
                message: 'Tất cả các task đã hoàn thành.',
                completed: this.completedTasks,
                failed: this.failedTasks
            });
        } else {
            await this._delay(this.options.delay);
            this._run();
        }
    }

    _runWithTimeout(taskFunc) {
        // === START: THAY ĐỔI LOGIC - Chỉ bật timeout khi > 0 ===
        if (this.options.timeout <= 0) {
            return Promise.resolve(taskFunc());
        }
        // === END: THAY ĐỔI LOGIC ===
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                const timeoutError = new Error(`Task timed out sau ${this.options.timeout}ms`);
                timeoutError.code = 'ETIMEOUT'; 
                reject(timeoutError);
            }, this.options.timeout);

            Promise.resolve(taskFunc())
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