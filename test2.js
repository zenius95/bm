// test_process_runner.js
const ProcessRunner = require('./utils/processRunner');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- HÀM HELPER ĐỂ TẠO TASK MẪU ---
// Task thành công sau một khoảng thời gian
const createTaskSuccess = (id, duration = 100) => ({
    id: `TASK_OK_${id}`,
    task: async () => {
        console.log(`\t[TASK ${id}] Bắt đầu... (sẽ thành công sau ${duration}ms)`);
        await delay(duration);
        return `Kết quả của task ${id}`;
    }
});

// Task thất bại 1 lần rồi thành công
const createTaskRetrySuccess = (id, duration = 100) => {
    let hasFailed = false;
    return {
        id: `TASK_RETRY_${id}`,
        task: async () => {
            console.log(`\t[TASK ${id}] Bắt đầu...`);
            await delay(duration);
            if (!hasFailed) {
                hasFailed = true;
                throw new Error(`Lỗi cố ý lần đầu của task ${id}`);
            }
            return `Kết quả của task ${id} sau khi retry`;
        }
    };
};

// Task luôn thất bại
const createTaskAlwaysFail = (id, duration = 100) => ({
    id: `TASK_FAIL_${id}`,
    task: async () => {
        console.log(`\t[TASK ${id}] Bắt đầu... (sẽ luôn thất bại)`);
        await delay(duration);
        throw new Error(`Lỗi của task ${id}`);
    }
});

// Task bị timeout
const createTaskTimeout = (id, duration = 2000) => ({
    id: `TASK_TIMEOUT_${id}`,
    task: async () => {
        console.log(`\t[TASK ${id}] Bắt đầu... (sẽ bị timeout vì chạy quá lâu)`);
        await delay(duration);
        return `Task ${id} này sẽ không bao giờ trả về kết quả`;
    }
});


// --- KỊCH BẢN TEST ---

/**
 * TEST 1: Kịch bản cơ bản nhất, tất cả task đều thành công
 */
async function testBasicSuccess() {
    console.log('\n--- [TEST 1] Kịch bản cơ bản: Tất cả các task đều thành công ---');
    const runner = new ProcessRunner({ concurrency: 2, delay: 100 });
    const tasks = [
        createTaskSuccess(1, 500),
        createTaskSuccess(2, 400),
        createTaskSuccess(3, 600),
        createTaskSuccess(4, 300),
    ];
    runner.addTasks(tasks);

    runner.on('start', ({ totalTasks }) => console.log(`[EVENT] Runner bắt đầu với ${totalTasks} tasks.`));
    runner.on('task:complete', ({ result, taskWrapper }) => console.log(`[EVENT] Task ${taskWrapper.id} hoàn thành với kết quả: "${result}"`));
    runner.on('end', (summary) => console.log(`[EVENT] Runner kết thúc. Hoàn thành: ${summary.completed}, Thất bại: ${summary.failed}`));

    runner.start();
    // Chờ cho runner kết thúc
    await new Promise(resolve => runner.on('end', resolve));
}

/**
 * TEST 2: Kịch bản có task thất bại và retry thành công
 */
async function testRetryMechanism() {
    console.log('\n--- [TEST 2] Kịch bản Retry: Có task thất bại và thử lại ---');
    const runner = new ProcessRunner({ concurrency: 3, retries: 3 });

    const tasks = [
        createTaskSuccess(1),
        createTaskRetrySuccess(2), // Thất bại 1 lần rồi thành công
        createTaskAlwaysFail(3),   // Luôn thất bại
        createTaskSuccess(4),
    ];
    runner.addTasks(tasks);

    runner.on('task:retry', ({ error, taskWrapper, attempt }) => console.warn(`[EVENT] Task ${taskWrapper.id} thất bại, đang thử lại lần ${attempt}. Lỗi: ${error}`));
    runner.on('task:error', ({ error, taskWrapper }) => console.error(`[EVENT] Task ${taskWrapper.id} thất bại vĩnh viễn. Lỗi: ${error}`));
    runner.on('end', (summary) => console.log(`[EVENT] Runner kết thúc. Hoàn thành: ${summary.completed}, Thất bại: ${summary.failed}`));

    runner.start();
    await new Promise(resolve => runner.on('end', resolve));
}

/**
 * TEST 3: Kịch bản test timeout
 */
async function testTimeout() {
    console.log('\n--- [TEST 3] Kịch bản Timeout: Task chạy quá thời gian cho phép ---');
    const runner = new ProcessRunner({ timeout: 500, retries: 1 }); // Timeout 500ms
    runner.addTasks([createTaskTimeout(1, 1000)]); // Task chạy mất 1000ms

    runner.on('task:error', ({ error, taskWrapper }) => console.error(`[EVENT] Task ${taskWrapper.id} lỗi. Nguyên nhân: ${error}`));
    runner.on('end', (summary) => console.log(`[EVENT] Runner kết thúc. Hoàn thành: ${summary.completed}, Thất bại: ${summary.failed}`));

    runner.start();
    await new Promise(resolve => runner.on('end', resolve));
}

/**
 * TEST 4: Kịch bản test Pause và Resume
 */
async function testPauseAndResume() {
    console.log('\n--- [TEST 4] Kịch bản Pause & Resume ---');
    const runner = new ProcessRunner({ concurrency: 2 });
    const tasks = Array.from({ length: 6 }, (_, i) => createTaskSuccess(i + 1, 500));
    runner.addTasks(tasks);

    runner.on('start', () => {
        console.log('[ACTION] Runner đã start. Sẽ pause sau 700ms.');
        setTimeout(() => {
            runner.pause();
        }, 700);
    });
    runner.on('pause', () => {
        console.log('[EVENT] Runner đã tạm dừng. Sẽ resume sau 2 giây.');
        setTimeout(() => {
            runner.resume();
        }, 2000);
    });
    runner.on('resume', () => console.log('[EVENT] Runner đã tiếp tục chạy.'));
    runner.on('end', (summary) => console.log(`[EVENT] Runner kết thúc. Hoàn thành: ${summary.completed}, Thất bại: ${summary.failed}`));

    runner.start();
    await new Promise(resolve => runner.on('end', resolve));
}


/**
 * TEST 5: Kịch bản test Stop
 */
async function testStop() {
    console.log('\n--- [TEST 5] Kịch bản Stop: Dừng runner giữa chừng ---');
    const runner = new ProcessRunner({ concurrency: 2 });
    const tasks = Array.from({ length: 8 }, (_, i) => createTaskSuccess(i + 1, 400));
    runner.addTasks(tasks);
    let hasStopped = false;

    runner.on('start', () => {
        console.log('[ACTION] Runner đã start. Sẽ stop sau 600ms.');
        setTimeout(() => {
            if (runner.status === 'running') {
                runner.stop();
            }
        }, 600);
    });

    runner.on('task:complete', ({ taskWrapper }) => {
        console.log(`[EVENT] Task ${taskWrapper.id} đã hoàn thành.`);
    });

    runner.on('stop', () => {
        console.log('[EVENT] Runner đã bị dừng!');
        hasStopped = true;
    });

    runner.on('end', () => {
        // Event 'end' sẽ không được gọi khi stop, nhưng ta vẫn để đây để kiểm tra
        console.log('[EVENT] Runner kết thúc (không nên thấy log này khi stop).');
    });

    runner.start();

    // Chờ một lúc để đảm bảo các task đang chạy có thể hoàn thành hoặc bị bỏ qua
    await delay(1500);
    if (hasStopped) {
         console.log('✅ Test Stop thành công. Runner đã dừng đúng cách.');
    } else {
         console.error('❌ Test Stop thất bại.');
    }
}


/**
 * TEST 6: Kịch bản test maxErrors
 */
async function testMaxErrors() {
    console.log('\n--- [TEST 6] Kịch bản maxErrors: Dừng khi có quá nhiều lỗi ---');
    const runner = new ProcessRunner({ maxErrors: 2, retries: 1 }); // Dừng lại nếu có 2 task lỗi
    const tasks = [
        createTaskAlwaysFail(1),
        createTaskSuccess(2),
        createTaskAlwaysFail(3),
        createTaskAlwaysFail(4), // Task này sẽ không được chạy
        createTaskSuccess(5),    // Task này cũng vậy
    ];
    runner.addTasks(tasks);

    runner.on('task:error', ({ taskWrapper }) => console.error(`[EVENT] Task ${taskWrapper.id} lỗi.`));
    runner.on('error', (err) => console.error(`[EVENT] Runner gặp lỗi nghiêm trọng: ${err.message}`));
    runner.on('end', (summary) => console.log(`[EVENT] Runner kết thúc. Hoàn thành: ${summary.completed}, Thất bại: ${summary.failed}`));

    runner.start();
    await new Promise(resolve => runner.on('end', resolve));
}


// --- HÀM CHẠY TẤT CẢ TEST ---
async function runAllTests() {
    await testBasicSuccess();
    await delay(1000);
    await testRetryMechanism();
    await delay(1000);
    await testTimeout();
    await delay(1000);
    await testPauseAndResume();
    await delay(1000);
    await testStop();
    await delay(1000);
    await testMaxErrors();
    console.log('\n🏁🏁🏁 Đã hoàn thành tất cả các kịch bản test cho ProcessRunner! 🏁🏁🏁');
}

runAllTests();