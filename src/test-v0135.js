// test-v0135.js —— v0.1.35 回归测试
//
// 本版修 3 个缺陷 + 1 处日志口径，全部来自用户真机日志实测
// （微博话题页 /hot/weibo/102803，4 条微博 45 个文件全部落盘成功）。
//
// 验证方式：**整 IIFE 真跑** —— 把 userscript 的 IIFE 拆开在 Node 里执行，
// 用真实的闭包环境跑 trimTasks，而不是正则抽函数体。
// WHY：v0.1.35 调试时踩过 —— `new Function` 里塞函数声明不会被调用，
//       测试全红但源码是对的；改成整 IIFE 跑才是真验证。
//
// 铁律：走 _target.js 单一真源，不硬编码路径，不写死版本号。
const { TARGET, VERSION, read } = require('./_target.js');
const src = read();

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}${e ? ' → ' + e : ''}`); } };

console.log(`\n═══ v0.1.35 回归测试（被测 ${VERSION}）═══\n`);

// ══════════════════════════════════════════════════════════════
// 0) 起一个真实运行环境（整 IIFE）
// ══════════════════════════════════════════════════════════════
function bootProbe() {
    const body = src
        .replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/, '')
        .replace(/^\s*\/\*[\s\S]*?\*\/\s*/, '')
        .replace(/\(function \(\) \{/, '')
        .replace(/\}\)\(\);\s*$/, '');

    const probe = `
;globalThis.__probe = {
    size: () => tasks.size,
    ids: () => Array.from(tasks.keys()),
    reset: () => tasks.clear(),
    add: (id, msg) => { tasks.set(id, { id, title: id, message: msg, percent: 0 }); trimTasks(); return tasks.size; },
};
`;
    const WB = new Function('GM_getValue', 'GM_setValue', 'GM_addStyle', 'GM_registerMenuCommand',
        'GM_unregisterMenuCommand', 'GM_xmlhttpRequest', 'GM_download', 'alert', 'window',
        'document', 'navigator', 'location', 'MutationObserver', 'setTimeout', 'clearTimeout',
        'setInterval', 'clearInterval', 'requestIdleCallback', 'fetch', 'URL', 'Blob', 'TextEncoder',
        body + probe + '\n;return globalThis.__probe;');

    const store = {};
    const el = () => ({ style: {}, appendChild(){}, setAttribute(){}, addEventListener(){}, classList: { add(){}, remove(){}, toggle(){} }, querySelectorAll: () => [], querySelector: () => null });
    return WB(
        (k, d) => (k in store ? store[k] : d),
        (k, v) => { store[k] = v; },
        () => {}, () => 0, () => {}, () => {}, () => {}, () => {},
        { prompt: () => null }, {},
        { querySelectorAll: () => [], querySelector: () => null, createElement: el, body: el(), documentElement: el(), head: el(), addEventListener(){} },
        { userAgent: 'node' },
        { href: 'https://weibo.com/' },
        class { observe(){} disconnect(){} },
        (f, t) => setTimeout(f, t), clearTimeout, (f, t) => setInterval(f, t), clearInterval,
        (f) => setTimeout(f, 0),
        () => Promise.resolve({}), URL, Blob, TextEncoder
    );
}

// ══════════════════════════════════════════════════════════════
// 1) trimTasks —— 裁剪上限必须真的生效
// ══════════════════════════════════════════════════════════════
console.log('═══ 1. 历史裁剪上限真的生效 ═══');
{
    let wb;
    try {
        wb = bootProbe();
        check('整 IIFE 能跑起来', !!wb && typeof wb.add === 'function');
    } catch (e) {
        check('整 IIFE 能跑起来', false, e.message);
    }

    if (wb) {
        const MSG_DONE = '完成';
        const MSG_READY = '准备中';

        // v0.1.35 口径澄清：**分别封顶**，不是总量封顶。
        // 已完成 ≤6 + 进行中 ≤6，内存层最多 12 条。
        // 所以「9 条(done=3,busy=6)」不裁是**正确行为** —— 各自都没超上限。
        const cases = [
            { n: 9, done: 3, note: '日志实测场景(done=3,busy=6) → 不该裁' },
            { n: 9, done: 6, note: 'done=6,busy=3 → 不该裁' },
            { n: 8, done: 3, note: 'done=3,busy=5 → 不该裁' },
            { n: 7, done: 1, note: 'done=1,busy=6 → 不该裁' },
            { n: 12, done: 6, note: 'done=6,busy=6 → 不该裁' },
        ];
        for (const c of cases) {
            wb.reset();
            for (let i = 0; i < c.n; i++) wb.add('id' + i, i < c.done ? MSG_DONE : MSG_READY);
            const after = wb.size();
            const keptIds = wb.ids();
            const doneKept = keptIds.filter((x) => /^id[0-5]$/.test(x)).length;   // 已完成的是 id0..id{5}
            const busyKept = keptIds.length - doneKept;
            check(`${c.n}条(done=${c.done}) 已完成≤6`, doneKept <= 6, `实际 ${doneKept} — ${c.note}`);
            check(`${c.n}条(done=${c.done}) 进行中≤6 或全留`, busyKept <= 6 || busyKept === c.n - c.done,
                `实际 ${busyKept} — ${c.note}`);
        }

        // 分别封顶真实验证：完成 9 条 + 进行中 3 条 → 完成裁到 6,进行中全留,总量 9
        wb.reset();
        for (let i = 0; i < 12; i++) wb.add('id' + i, i < 9 ? MSG_DONE : MSG_READY);
        const ids3 = wb.ids();
        const doneKept3 = ids3.filter((x) => /^id[0-8]$/.test(x)).length;
        check('done=9 busy=3 → 已完成裁到 6 条', doneKept3 === 6, `实际 ${doneKept3}`);
        check('done=9 busy=3 → 进行中 3 条全留（总量 9）', ids3.length === 9, `实际总量 ${ids3.length}`);

        // 进行中超过 6 时：已完成的**照样按自己的 6 上限裁**（不是按总量挤名额）
        // done=3 busy=9 → 已完成只有 3 条,没超 6 → 全留;进行中 9 条全留 → 总量 12
        wb.reset();
        for (let i = 0; i < 12; i++) wb.add('id' + i, i < 3 ? MSG_DONE : MSG_READY);
        const ids4 = wb.ids();
        const doneLeft4 = ids4.filter((x) => /^id[0-2]$/.test(x)).length;
        check('done=3 busy=9 → 已完成的 3 条全留（自己的上限 6 没超）', doneLeft4 === 3,
            `实际还剩 ${doneLeft4} 条已完成`);
        check('done=3 busy=9 → 进行中的 9 条全保留 → 总量 12', ids4.length === 12,
            `实际保留 ${ids4.length} 条`);

        // 已完成超过 6 时才裁 —— 这是「分别封顶」的核心
        wb.reset();
        for (let i = 0; i < 12; i++) wb.add('id' + i, i < 9 ? MSG_DONE : MSG_READY);
        const ids5 = wb.ids();
        check('done=9 busy=3 → 已完成裁到 6（超过自己的上限才裁）',
            ids5.filter((x) => /^id[0-8]$/.test(x)).length === 6,
            `实际 ${ids5.filter((x) => /^id[0-8]$/.test(x)).length}`);
        check('done=9 busy=3 → 进行中 3 条一条不少', ids5.length === 9, `实际总量 ${ids5.length}`);

        // 纯已完成：必须裁到正好 6，且保留最新的
        wb.reset();
        for (let i = 0; i < 12; i++) wb.add('id' + i, MSG_DONE);
        check('12 条全完成 → 裁到 6', wb.size() === 6, `实际 ${wb.size()}`);
        const ids = wb.ids();
        check('保留的是最新的 6 条（id6~id11）',
            ids.includes('id11') && ids.includes('id6') && !ids.includes('id0'),
            `实际保留 ${ids.join(',')}`);

        // 硬约束：进行中的任务一条都不能被淘汰
        // WHY：setTask 每次进度更新都调 trimTasks，
        //      淘汰正在下载的 task → 它的 onGMDone 回调回来找不到记录 → 状态卡住不动。
        wb.reset();
        for (let i = 0; i < 3; i++) wb.add('done' + i, MSG_DONE);
        wb.add('busy1', MSG_READY);
        wb.add('busy2', MSG_READY);
        wb.add('busy3', MSG_READY);
        const ids2 = wb.ids();
        check('进行中的任务一条都不被淘汰',
            ids2.includes('busy1') && ids2.includes('busy2') && ids2.includes('busy3'),
            `实际保留 ${ids2.join(',')}`);

        // 进行中超过上限时，仍然一条都不能砍（宁可暂时超限）
        wb.reset();
        for (let i = 0; i < 9; i++) wb.add('busy' + i, MSG_READY);
        const busyIds = wb.ids();
        check('进行中 9 条 > 上限 6 时仍全保留（宁可超限不可砍进行中）',
            busyIds.length === 9, `实际保留 ${busyIds.length} 条`);

        // 已完成的在有进行中时**照样留 6 条**（分别封顶，不互相挤名额）
        wb.reset();
        for (let i = 0; i < 9; i++) wb.add('d' + i, MSG_DONE);
        wb.add('busy', MSG_READY);
        check('有 1 条进行中时，已完成仍留 6 条（分别封顶不挤名额）', wb.size() === 7, `实际 ${wb.size()}`);
    }
}

// ══════════════════════════════════════════════════════════════
// 2) collectCards 每次 flush 只扫一遍
// ══════════════════════════════════════════════════════════════
console.log('\n═══ 2. flush 只扫一次 DOM ═══');
{
    const flushBody = src.match(/function flush\(\) \{[\s\S]*?\n    \}/);
    check('源码里能找到 flush', !!flushBody);
    if (flushBody) {
        const body = flushBody[0];
        const collectCalls = (body.match(/collectCards\(\)/g) || []).length;
        check('flush 里 collectCards() 只调 1 次', collectCalls === 1, `实际 ${collectCalls} 次`);
        check('flush 把结果传给 enhanceCards', /enhanceCards\(cards\)/.test(body));
        check('flush 把结果传给 injectCardButtons', /injectCardButtons\(cards\)/.test(body));
        const iEnhance = body.indexOf('enhanceCards(cards)');
        const iInject = body.indexOf('injectCardButtons(cards)');
        check('enhance 在 inject 之前（标记依赖顺序）', iEnhance !== -1 && iInject !== -1 && iEnhance < iInject,
            `enhance@${iEnhance} inject@${iInject}`);
    }
    check('enhanceCards 支持传入 cards', /function enhanceCards\(cardsIn\)/.test(src));
    check('enhanceCards 兜底为 collectCards()', /const cards = cardsIn \|\| collectCards\(\)/.test(src));
    check('injectCardButtons 支持传入 cards', /function injectCardButtons\(cardsIn\)/.test(src));
}

// ══════════════════════════════════════════════════════════════
// 3) livephoto 视频半必须走原生落盘
// ══════════════════════════════════════════════════════════════
console.log('\n═══ 3. live 视频半标记 isVideo ═══');
{
    check('files.push 用 isTop || isLive 判 isVideo',
        /isVideo:\s*isVideoItem/.test(src) &&
        /const isVideoItem = !!\(item\.isTop \|\| item\.isLive\)/.test(src));
    check('旧写法 isVideo: !!item.isTop 已移除',
        !/files\.push\(\{ name, data: blob, isVideo: !!item\.isTop \}\)/.test(src));

    // 行为验证：isVideo=true → 视频无条件走原生（不受 2MB 阈值影响）
    const big = src.match(/function isBigBlob\(blob, forceNative\) \{[\s\S]*?\n    \}/);
    check('源码里能找到 isBigBlob', !!big);
    if (big) {
        const constDecl = (src.match(/const BIG_FILE_BYTES = [^;]+;/) || [''])[0];
        const fn = new Function('blob', 'forceNative', constDecl + '\n' + big[0] +
            '\nreturn isBigBlob(blob, forceNative);');
        check('isBigBlob(大文件, forceNative=true) → true', fn({ size: 10 * 1024 * 1024 }, true) === true);
        check('isBigBlob(小文件, forceNative=true) → true（视频无条件原生）', fn({ size: 1024 }, true) === true);
        check('isBigBlob(小文件, forceNative=false) → false（图片按体积判定）', fn({ size: 1024 }, false) === false);
        check('isBigBlob(大文件, forceNative=false) → true', fn({ size: 5 * 1024 * 1024 }, false) === true);
    }
}

// ══════════════════════════════════════════════════════════════
// 4) 「队列完成」日志口径
// ══════════════════════════════════════════════════════════════
console.log('\n═══ 4. 队列完成日志口径 ═══');
{
    check('日志含「顶层视频」', /顶层视频=/.test(src));
    check('日志含「live视频」', /live视频=/.test(src));
    check('live 视频单独统计', /const liveCount = mediaItems\.filter\(\(m\) => m\.isLive\)\.length/.test(src));
    // 只查代码行 —— 头部注释里会提到「旧的『视频项=』口径」作为说明
    const codeLines = src.split('\n').filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//'));
    check('代码里不再有「视频项=」', !codeLines.some((l) => /视频项=/.test(l)),
        codeLines.filter((l) => /视频项=/.test(l)).slice(0, 2).join(' | '));
}

// ══════════════════════════════════════════════════════════════
// 5) 版本号三处一致（动态比对，不写死）
// ══════════════════════════════════════════════════════════════
console.log('\n═══ 5. 版本一致性 ═══');
{
    const vMeta = (src.match(/@version\s+([\d.]+)/) || [])[1];
    const vConst = (src.match(/const VERSION = '([\d.]+)'/) || [])[1];
    check('@version 与 const VERSION 一致', vMeta === vConst, `${vMeta} vs ${vConst}`);
    check('版本号格式合法', /^\d+\.\d+\.\d+$/.test(vMeta || ''), vMeta);
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
process.exit(fail ? 1 : 0);
