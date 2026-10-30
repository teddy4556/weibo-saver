// v0.1.33 回归：历史限 6 条（三层收口）+ 收起抓手改双色
const fs = require('fs');
const P = require('./_target.js').TARGET;
const src = fs.readFileSync(P, 'utf8');
const L = src.split('\n');
const codeOnly = L.filter(l => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
const CSS = (() => { const i = src.indexOf('const CSS = `'); return src.slice(i, src.indexOf('\n    `;', i)); })();

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}${e ? ' → ' + e : ''}`); } };

console.log('\n═══ ① 三层收口到同一个常量 ═══');
{
    check('HISTORY_MAX = 6', /const HISTORY_MAX = 6;/.test(codeOnly));
    check('显示层用 HISTORY_MAX', /const n = HISTORY_MAX;/.test(codeOnly));
    check('显示层不再 clamp 3..40', !/Math\.max\(3, Math\.min\(40, Number\(cfg\.messagesNumber\)/.test(codeOnly));
    check('持久层用 HISTORY_MAX', /slice\(-HISTORY_MAX\)/.test(codeOnly));
    check('持久层不再写死 20', !/slice\(-20\)/.test(codeOnly));
    check('加载层裁剪', /list\.slice\(-HISTORY_MAX\)\.forEach/.test(codeOnly));
    check('全库无残留 messagesNumber 读取',
        !/cfg\.messagesNumber/.test(codeOnly), '仍有旧读取');
}

console.log('\n═══ ② 内存层淘汰（tasks 只增不减的老问题）═══');
{
    const i = codeOnly.indexOf('function trimTasks()');
    check('trimTasks 存在', i >= 0);
    const blk = codeOnly.slice(i, codeOnly.indexOf('function setTask('));
    check('超过上限才动手', /if \(tasks\.size <= HISTORY_MAX\) return;/.test(blk));
    check('进行中的永不淘汰', /busy = all\.filter\(\(t\) => t\.message !== MSG\.done\)/.test(blk));
    // v0.1.35：口径**不变**（分别封顶），改的是日志措辞 + 一个真隐患。
    //
    // 重要澄清：「历史裁剪 9 → 9 条（上限 6）」**不是 bug**。
    // 分别封顶 = 已完成≤6 + 进行中≤6,内存层最多 12 条。
    // 9 条 = 3 完成 + 6 进行中,各自都没超上限 → 本来就不该裁,数字不变是正确行为。
    // v0.1.35 改的是:① 日志措辞说清是分别封顶 ② 进行中的永不淘汰(原版会砍)。
    check('已完成只留最新 N 条', /finished\.slice\(-HISTORY_MAX\)/.test(blk));
    check('进行中的全留(不砍进行中)', /const keep = new Set\(busy\.map\(\(t\) => t\.id\)\)/.test(blk));
    check('已完成按 HISTORY_MAX 封顶', /finished\.slice\(-HISTORY_MAX\)/.test(blk));
    check('真的 delete', /tasks\.delete\(t\.id\)/.test(blk));
    check('setTask 里调用', /trimTasks\(\);\s*\n\s*renderPanel\(\);/.test(codeOnly));
    check('裁剪有日志', /历史裁剪/.test(blk));
}

console.log('\n═══ ② 真跑：淘汰行为 ═══');
{
    // v0.1.35：改成**真跑源码里的 trimTasks**（整 IIFE 拆开执行），
    // 不再在测试里重写一份实现 —— 测试重写实现 = 测的是测试自己。
    const { runTrim } = require('./_trim-harness.js');
    const trim = (tasksObj) => {
        const r = runTrim(tasksObj);
        return { kept: r.kept, removed: r.removed };
    };
    const { MSG } = require('./_trim-harness.js').runTrim({});
    const mk = (n, msg) => Object.fromEntries(
        Array.from({ length: n }, (_, i) => [String(i), { id: String(i), message: msg }]));

    let r = trim(mk(20, MSG.done));
    check('20 条全完成 → 剩 6', r.kept.length === 6, `${r.kept.length}`);
    check('保留的是最新 6 条',
        r.kept.map(t => Number(t.id)).sort((a, b) => a - b).join(',') === '14,15,16,17,18,19',
        r.kept.map(t => t.id).join(','));

    const mixed = { ...mk(10, MSG.done), '10': { id: '10', message: '保存中' },
                    '11': { id: '11', message: '下载中' } };
    r = trim(mixed);
    const busyKept = r.kept.filter(t => t.message !== MSG.done);
    const finKept = r.kept.filter(t => t.message === MSG.done);
    check('10完成+2进行中 → 进行中全留', busyKept.length === 2, `${busyKept.length}`);
    // v0.1.35:分别封顶 —— 已完成留 6(不因进行中占位而减少),进行中留 2
    // 内存层上限 12 = 完成 6 + 进行中 6
    check('已完成留 6 条（分别封顶,不因进行中占位而减少）', finKept.length === 6, `${finKept.length}`);
    check('内存层总量 = 完成6 + 进行中2 = 8（上限 12）', r.kept.length === 8, `${r.kept.length}`);

    r = trim(mk(4, MSG.done));
    check('未超限不误删', r.removed === 0 && r.kept.length === 4, `删了 ${r.removed}`);

    r = trim(mk(10, '下载中'));
    // v0.1.35:进行中的**永不淘汰**。原版 busy.slice(-HISTORY_MAX) 会砍掉 4 条 →
    // 被砍的 task 它的 onGMDone 回调回来找不到记录 → 面板进度条永远卡在「下载中」。
    check('全进行中 10 条全保留（不砍进行中,宁可暂时超限）', r.kept.length === 10, `${r.kept.length}`);
}

console.log('\n═══ ③ 收起抓手：双色（用户反馈红黑分不清）═══');
{
    const grab = CSS.slice(CSS.indexOf('#wb-panel.wb-collapsed::after'));
    check('微博黄渐变底', /linear-gradient\(135deg,#ffc300,#ff8200\)/.test(grab));
    check('红色描边', /border:2px solid var\(--wb-brand,#e6162d\)/.test(grab));
    check('不透明（不再 opacity:.5）', !/opacity:\.5/.test(grab.split('}')[0]), '还是半透明');
    check('尺寸 16→22px', /width:22px;height:22px/.test(grab));
    check('有圆角', /border-radius:0 9px 0 9px/.test(grab));
    check('有橙色投影', /box-shadow:[\s\S]*?rgba\(255,130,0,\.5\)/.test(grab));
    check('hover 放大', /::after:hover\{[\s\S]*?scale\(1\.08\)/.test(grab));
    check('collapsed 仍隐藏面板', /#wb-panel\.wb-collapsed\{[\s\S]{0,160}?opacity:0[\s\S]{0,80}?pointer-events:none/.test(CSS));
    check('注释写明为何改色', /红和黑差别不明显|深底 \+ 半透明红/.test(src));
}

console.log('\n═══ ④ 前六版修复未回退 ═══');
{
    const callLines = L.map((l, i) => (/const handed = saveVideoViaGM\(/.test(l) ? i + 1 : 0)).filter(Boolean);
    const fb = L.findIndex(l => l.includes('let res = await fetchBlob(url')) + 1;
    const so = L.findIndex(l => l.includes('const saveOne =')) + 1;
    check('直落真调用唯一', callLines.length === 1, `${callLines.length} 处`);
    check('直落早于 fetchBlob', callLines[0] < fb);
    check('doneCb 改名未回退', /function saveVideoViaGM\(url, info, item, doneCb, fallbackBlob\)/.test(codeOnly));
    check('finish 归一化仍在', /const finish = typeof doneCb === 'function'/.test(codeOnly));
    check('混批双计数仍在', /let gmReported = 0;/.test(codeOnly));
    check('@grant GM_info 仍在', /@grant\s+GM_info/.test(src));
    check('双条件判定仍在', /files\.length === 0 && videoHanded === 0/.test(codeOnly));
    check('blob 确认式释放仍在', /blob 已关联/.test(src));
    check('字节校验仍在', /const short = want > 0 && got > 0 && got < want;/.test(codeOnly));
    check('队列 started 仍在', /let started = false;/.test(codeOnly));
    check('extOf 白名单仍在', /const MEDIA_EXTS = \[/.test(src));
    check('开关全量点亮仍在', /el\.classList\.toggle\('on', !!cfg\[def\.key\]\)/.test(codeOnly));
    check('卡片按钮仍常驻右下',
        /\.wb-card-dl\{[\s\S]{0,80}?bottom:10px;[\s\S]{0,40}?right:10px/.test(CSS) &&
        /\.wb-card-dl\{[\s\S]{0,700}?pointer-events:auto/.test(CSS));
    check('批量勾选互斥仍在', /body\.wb-batch \.wb-card-pick\{display:flex\}/.test(CSS));
    check('零 @require', !/^\/\/ @require/m.test(src));
}

console.log('\n═══ ⑤ 版本 ═══');
const vMeta = (src.match(/@version\s+([\d.]+)/) || [])[1];
const vConst = (src.match(/const VERSION = '([\d.]+)'/) || [])[1];
check('版本号两处一致（动态比对，不写死版本）',
    vMeta === vConst && /^\d+\.\d+\.\d+$/.test(vMeta || ''), `${vMeta}/${vConst}`);
check('头部有 v0.1.33 记录', /v0\.1\.33/.test(src));

console.log(`\n${'═'.repeat(46)}`);
console.log(`结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
