// utils/ProcessRunner.js
const EventEmitter = require('events');

class ProcessRunner extends EventEmitter {
    constructor(options = {}) {
        super();
        this.options = {
            concurrency: 5,
            delay: 0,
            retries: 0,
            timeout: 0,
            maxErrors: 0,
            ...options,
        };

        this.tasks = [];
        this.queue = [];
        this.activeTasks = 0;
        this.completedTasks = 0;
        this.failedTasks = 0;
        this.totalTasks = 0;
        this.errors = 0;
        this.status = 'idle';
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

        if (this.options.maxErrors > 0 && this.errors >= this.options.maxErrors) {
            this.status = 'stopped';
            this.emit('error', new Error(`Dừng tiến trình do vượt quá số lỗi tối đa (${this.options.maxErrors}).`));
            this.emit('end', { message: 'Đã dừng do quá nhiều lỗi.' });
            return;
        }

        while (this.activeTasks < this.options.concurrency && this.queue.length > 0) {
            this.activeTasks++;
            const taskWrapper = this.queue.shift();
            // Bọc việc thực thi trong một hàm tự gọi để đảm bảo nó không ném lỗi ra ngoài
            (async () => {
                await this._executeTask(taskWrapper);
            })();
        }
    }

    async _executeTask(taskWrapper, attempt = 1) {
        try {
            if (this.status === 'stopped') {
                return;
            }
            
            // An toàn hơn khi emit sự kiện
            try { this.emit('task:start', { taskWrapper, attempt }); } catch (e) { console.error('[ProcessRunner] Lỗi trong listener task:start:', e); }

            const result = await this._runWithTimeout(taskWrapper.task);
            this.completedTasks++;
            
            // An toàn hơn khi emit sự kiện
            try { this.emit('task:complete', { result, taskWrapper }); } catch (e) { console.error('[ProcessRunner] Lỗi trong listener task:complete:', e); }

        } catch (error) {
            if (this.options.retries > 0 && attempt <= this.options.retries) {
                try { this.emit('task:retry', { error: error, taskWrapper, attempt: attempt + 1 }); } catch (e) { console.error('[ProcessRunner] Lỗi trong listener task:retry:', e); }
                await this._delay(1000);
                // Giảm activeTasks trước khi gọi đệ quy và không chờ nó
                this.activeTasks--; 
                this._executeTask(taskWrapper, attempt + 1);
                return; // Quan trọng: thoát khỏi hàm để không chạy finally
            } else {
                this.errors++;
                this.failedTasks++;
                // An toàn hơn khi emit sự kiện
                try { this.emit('task:error', { error: error, taskWrapper }); } catch (e) { console.error('[ProcessRunner] Lỗi trong listener task:error:', e); }
            }
        } finally {
             // Đảm bảo khối này chỉ chạy một lần cho mỗi task (trừ trường hợp retry)
            if (!(this.options.retries > 0 && attempt <= this.options.retries)) {
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
        }
    }

    _runWithTimeout(taskFunc) {
        if (this.options.timeout <= 0) {
            // Bọc hàm taskFunc trong một Promise để bắt cả lỗi đồng bộ và bất đồng bộ
            return new Promise((resolve, reject) => {
                try {
                    resolve(taskFunc());
                } catch (error) {
                    reject(error);
                }
            });
        }
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                const timeoutError = new Error(`Task timed out sau ${this.options.timeout}ms`);
                timeoutError.code = 'ETIMEOUT'; 
                reject(timeoutError);
            }, this.options.timeout);

            // Promise.resolve().then(...) sẽ bắt cả lỗi đồng bộ và bất đồng bộ từ taskFunc
            Promise.resolve().then(() => taskFunc())
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