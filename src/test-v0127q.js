// v0.1.27 · 队列行为真跑（异步独立跑，避免和同步断言互相污染）
// 复刻旧/新两套 createQueue，对比「单慢任务」的表现 —— 视频下载就是单慢任务。
const PASS = [];
const FAIL = [];
const A = (label, cond, extra) => (cond ? PASS : FAIL).push(label + (cond ? '' : ` → ${extra || ''}`));

// ── 复刻旧实现（v0.1.26 及之前）──
function createQueueOld(concurrency) {
    const tasks = []; let active = 0; let settle = null; const results = [];
    const next = () => {
        if (active >= concurrency || tasks.length === 0) {
            if (active === 0 && tasks.length === 0 && settle) {
                const s = settle; settle = null; s(results);
            }
            return;
        }
        const { fn, index } = tasks.shift();
        active++;
        Promise.resolve().then(fn).then(
            (r) => { results[index] = r; },
            (e) => { results[index] = { __error: true }; }
        ).finally(() => { active--; next(); });
    };
    return {
        add(fn) { tasks.push({ fn, index: results.length }); results.length += 1; if (!settle) settle = (res) => res; next(); },
        start() {
            if (tasks.length === 0) return Promise.resolve([]);
            if (!settle) settle = (res) => res;
            next();
            return new Promise((resolve) => { settle = resolve; });
        },
    };
}

// ── 复刻新实现（v0.1.27）──
function createQueueNew(concurrency) {
    const tasks = []; let active = 0; let settle = null; let started = false; const results = [];
    const next = () => {
        if (active >= concurrency || tasks.length === 0) {
            if (started && active === 0 && tasks.length === 0 && settle) {
                const s = settle; settle = null; s(results);
            }
            return;
        }
        const { fn, index } = tasks.shift();
        active++;
        Promise.resolve().then(fn).then(
            (r) => { results[index] = r; },
            (e) => { results[index] = { __error: true }; }
        ).finally(() => { active--; next(); });
    };
    return {
        add(fn) { tasks.push({ fn, index: results.length }); results.length += 1; if (started) next(); },
        start() {
            const p = new Promise((resolve) => { settle = resolve; });
            if (tasks.length === 0) { settle(null); settle = null; return Promise.resolve([]); }
            started = true; next(); return p;
        },
    };
}

const slow = (ms, val) => () => new Promise(r => setTimeout(() => r(val), ms));
const race = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r('TIMEOUT'), ms))]);

(async () => {
    console.log('\n═══ 核心对照：单慢任务（= 视频，几 MB 下载）═══');
    console.log('  用户实测日志：fetchBlob 请求 → 队列完成 → fetchBlob 返回');
    {
        const q1 = createQueueOld(5);
        q1.add(slow(50, 'blob'));
        const r1 = await race(q1.start(), 200);
        // 旧实现的实际表现：立刻 resolve 一个空 results（不是 TIMEOUT，
        // 因为 settle 是 (res)=>res 假函数，resolve 空数组后 Promise 已定型）
        A('旧实现：单慢任务拿到空结果（印证「收集=0」）',
            r1 !== 'TIMEOUT' && Array.isArray(r1) && r1.filter(Boolean).length === 0,
            `得到 ${JSON.stringify(r1)}`);

        const q2 = createQueueNew(5);
        q2.add(slow(50, 'blob'));
        const r2 = await race(q2.start(), 200);
        A('新实现：单慢任务等到 blob', r2 !== 'TIMEOUT', `得到 ${JSON.stringify(r2)}`);
        A('新实现：结果确实含 blob', Array.isArray(r2) && r2[0] === 'blob', JSON.stringify(r2));
    }

    console.log('\n═══ 多任务（图集）═══');
    {
        const q3 = createQueueOld(3);
        ['a', 'b', 'c'].forEach(v => q3.add(slow(20, v)));
        const r3 = await race(q3.start(), 300);
        A('旧实现：三任务拿不全', !(Array.isArray(r3) && r3.filter(Boolean).length === 3), JSON.stringify(r3));

        const q4 = createQueueNew(3);
        ['a', 'b', 'c'].forEach(v => q4.add(slow(20, v)));
        const r4 = await race(q4.start(), 300);
        A('新实现：三任务全收集', Array.isArray(r4) && r4.filter(Boolean).length === 3, JSON.stringify(r4));
    }

    console.log('\n═══ 顺序性（concurrency=1）═══');
    {
        const order = [];
        const q = createQueueNew(1);
        q.add(async () => { order.push(1); await new Promise(r => setTimeout(r, 10)); order.push(11); });
        q.add(async () => { order.push(2); await new Promise(r => setTimeout(r, 10)); order.push(22); });
        await race(q.start(), 400);
        A('串行不交错', order.join(',') === '1,11,2,22', order.join(','));
    }

    console.log('\n═══ start 后追加任务（批量续跑）═══');
    {
        const got = [];
        const q = createQueueNew(2);
        q.add(async () => { await new Promise(r => setTimeout(r, 10)); got.push('a'); });
        const p = q.start();
        q.add(async () => { got.push('b'); });
        await race(p, 400);
        A('追加的任务也跑到', got.includes('a') && got.includes('b'), got.join(','));
    }

    console.log('\n═══ 边界 ═══');
    {
        const q1 = createQueueNew(3);
        const r1 = await race(q1.start(), 120);
        A('空队列立即返回数组', Array.isArray(r1), JSON.stringify(r1));

        const q2 = createQueueNew(3);
        q2.add(async () => { throw new Error('boom'); });
        q2.add(async () => 'ok');
        const r2 = await race(q2.start(), 250);
        A('任务抛异常不卡死', r2 !== 'TIMEOUT', JSON.stringify(r2));

        const q3 = createQueueNew(2);
        q3.add(async () => 'x');
        q3.add(async () => 'y');
        q3.add(async () => 'z');
        const r3 = await race(q3.start(), 250);
        A('超并发也能全收', Array.isArray(r3) && r3.filter(Boolean).length === 3, JSON.stringify(r3));
    }

    PASS.forEach(l => console.log(`  ✅ ${l}`));
    FAIL.forEach(l => console.log(`  ❌ ${l}`));
    console.log(`\n${'═'.repeat(46)}`);
    console.log(`结果：${PASS.length} 通过 / ${FAIL.length} 失败`);
    process.exit(FAIL.length ? 1 : 0);
})();
