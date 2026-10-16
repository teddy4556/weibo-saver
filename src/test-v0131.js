// v0.1.31 回归：姐姐自查发现的四个隐藏 bug（用户实测触发不到，靠静态分析）
const fs = require('fs');
const P = '/opt/data/cache/scratch/wb-build/weibo-saver-v0.1.0.user.js';
const src = fs.readFileSync(P, 'utf8');
const L = src.split('\n');
const codeOnly = src.split('\n').filter(l => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}${e ? ' → ' + e : ''}`); } };

console.log('\n═══ bug①：done 是对象却当函数调（TypeError 静默半死）═══');
console.log('  症状：进度条停在中间态、onerror 降级被吞、状态机永远不对');
console.log('  为何没被发现：GM_download 扩展后台照下，文件确实落盘 → 肉眼看着正常');
{
    const i = codeOnly.indexOf('function saveVideoViaGM');
    const j = codeOnly.indexOf('function saveVideoViaBlob');
    const f1 = codeOnly.slice(i, j);
    const k = codeOnly.indexOf('function saveBlob');
    const f2 = codeOnly.slice(j, k);

    check('saveVideoViaGM 第三参数改名 doneCb', /function saveVideoViaGM\(url, info, item, doneCb, fallbackBlob\)/.test(codeOnly));
    check('saveVideoViaBlob 第三参数改名 doneCb', /function saveVideoViaBlob\(url, name, doneCb\)/.test(codeOnly));
    check('saveVideoViaGM 有 finish 归一化', /const finish = typeof doneCb === 'function'/.test(f1));
    check('saveVideoViaBlob 有 finish 归一化', /const finish = typeof doneCb === 'function'/.test(f2));
    check('GM 分支无裸 done && done(', !f1.includes('done && done('), '还有残留');
    check('Blob 分支无裸 done && done(', !f2.includes('done && done('), '还有残留');
    check('GM 用 finish && finish(true)', /finish && finish\(true\)/.test(f1));
    check('GM 用 finish && finish(false)', /finish && finish\(false\)/.test(f1));
    check('Blob 用 finish && finish(false)', /finish && finish\(false\)/.test(f2));
    check('Blob 兜底透传 finish', /fallbackSave\(blob, name, finish\)/.test(f2));
    check('GM 降级透传 finish', /fallbackBlob\(url, name, finish\)/.test(f1));
    check('类型异常有警告', /doneCb 不是函数/.test(f1) && /doneCb 不是函数/.test(f2));
    {
        // 全库扫：任何地方都不许把 done 对象当回调透传
        const leaks = L
            .map((l, i) => [i + 1, l])
            .filter(([, l]) => (
                /fallbackBlob\(url, name, done\)/.test(l)
                || /fallbackSave\([^)]*, done\)/.test(l)
                || /done && done\(/.test(l)
            ))
            .filter(([, l]) => !/^\s*(\/\/|\*)/.test(l));
        check('全库无 done 对象当回调透传', leaks.length === 0,
            leaks.map(([n, l]) => `${n}:${l.trim().slice(0, 40)}`).join(' | '));
    }
}

console.log('\n═══ bug① 真跑：对象当函数调会抛什么 ═══');
{
    // 复刻调用方传的第三参数
    const counter = { q: 0, total: 3 };
    let threw = null;
    try { counter && counter(true); } catch (e) { threw = e.constructor.name; }
    check('对象当函数调确实抛 TypeError', threw === 'TypeError', `得到 ${threw}`);

    // 修法：finish 归一化后，非函数输入不再抛错
    const mkFinish = (cb) => typeof cb === 'function' ? cb : (ok) => 'ignored';
    let threw2 = null;
    try { mkFinish(counter)(true); } catch (e) { threw2 = e.constructor.name; }
    check('finish 归一化后不再抛错', threw2 === null, `仍抛 ${threw2}`);

    // 正常函数输入仍要能透传
    let got = null;
    mkFinish((ok) => { got = ok; })(true);
    check('正常回调仍透传成功', got === true, `得到 ${got}`);
}

console.log('\n═══ bug②：混批计数初始值就等于阈值，第一个回调就定终态 ═══');
console.log('  旧逻辑：handedCount = videoHanded → 首个 onGMDone 就 >= videoHanded → 覆盖图集进度');
{
    check('不再用 handedCount', !codeOnly.includes('handedCount'), '旧计数还在');
    check('改用 gmReported（已回报数）', /let gmReported = 0;/.test(codeOnly));
    check('改用 gmOk（成功数）', /let gmOk = 0;/.test(codeOnly));
    check('只在全部回报后才定终态', /if \(gmReported < videoHanded\) return;/.test(codeOnly));
    check('终态看整体而非最后一个', /const allOk = gmOk === videoHanded;/.test(codeOnly));
    check('有合并日志', /视频直落收尾/.test(codeOnly));
}

console.log('\n═══ bug② 真跑：计数时序 ═══');
{
    const sim = (videoCount, results) => {
        let gmReported = 0, gmOk = 0, fired = null;
        results.forEach(ok => {
            gmReported += 1;
            if (ok) gmOk += 1;
            if (gmReported < videoCount) return;
            fired = gmOk === videoCount ? 'DONE' : 'FAILED';
        });
        return fired;
    };
    check('1 视频成功 → 第一次回调就定 DONE', sim(1, [true]) === 'DONE');
    check('1 视频失败 → FAILED', sim(1, [false]) === 'FAILED');

    // ⚠ 旧逻辑真正的 bug 是：**首个回调就定终态**（不是失败被吞）。
    // 因为 handedCount 初始就等于 videoCount，`>= videoCount` 在第一次就成立，
    // 于是第二个视频还在下，状态已经被第一个的结果盖掉了。
    const simOld = (videoCount, results) => {
        let handedCount = videoCount, fired = null;
        results.forEach(ok => {
            if (ok) handedCount += 1;
            if (handedCount >= videoCount) fired = ok ? 'DONE' : 'FAILED';
        });
        return fired;
    };
    // 只跑一个回调，看是否已经定终态
    check('旧逻辑：2 视频首个回调就定终态（第二个还在下）',
        simOld(2, [true]) === 'DONE', '旧逻辑居然没提前报');
    check('旧逻辑：2 视频首个失败也立刻定终态',
        simOld(2, [false]) === 'FAILED', '旧逻辑居然没提前报');
    check('新逻辑：2 视频首个回调不定终态', sim(2, [true]) === null, '新逻辑提前报了');
    check('新逻辑：2 视频首个失败也不定终态', sim(2, [false]) === null, '新逻辑提前报了');
    check('新逻辑：2 视频都成功 → DONE', sim(2, [true, true]) === 'DONE');
    check('新逻辑：2 视频一成一败 → FAILED', sim(2, [true, false]) === 'FAILED');
    check('新逻辑：3 视频全部成功 → DONE', sim(3, [true, true, true]) === 'DONE');
    check('新逻辑：3 视频部分失败 → FAILED', sim(3, [true, false, true]) === 'FAILED');
}

console.log('\n═══ bug③：percent: undefined 会污染任务状态 ═══');
console.log('  setTask 用 Object.assign(cur, patch) → undefined 会覆盖已有 percent');
{
    check('不再传 percent: undefined', !/percent:\s*allOk \? 100 : undefined/.test(codeOnly), '还在传 undefined');
    check('改用条件构造 patch', /const finalPatch = \{ message: allOk \? MSG\.done : MSG\.failed \};\s*\n\s*if \(allOk\) finalPatch\.percent = 100;/.test(codeOnly));
    check('注释说明为何不能传 undefined', /Object\.assign/.test(src) && /undefined/.test(src));
    // 真跑验证
    const cur = { percent: 42, message: 'x' };
    const patchBad = { message: 'done', percent: undefined };
    Object.assign(cur, patchBad);
    check('真跑：传 undefined 会把 percent 冲掉', cur.percent === undefined, `得到 ${cur.percent}`);
    const cur2 = { percent: 42, message: 'x' };
    const patchOk = { message: 'done' };
    Object.assign(cur2, patchOk);
    check('真跑：条件构造保留原 percent', cur2.percent === 42, `得到 ${cur2.percent}`);
}

console.log('\n═══ bug④：GM_info 用了没声明 grant ═══');
{
    const grants = L.filter(l => l.trim().startsWith('// @grant'));
    check('已加 @grant GM_info', grants.some(l => /GM_info/.test(l)), '缺失');
    check('GM_download grant 仍在', grants.some(l => /GM_download/.test(l)));
    check('GM_xmlhttpRequest grant 仍在', grants.some(l => /GM_xmlhttpRequest/.test(l)));
    check('@connect * 仍在', grants.length >= 0 && L.some(l => l.includes('@connect')));
}

console.log('\n═══ savedOk 时序（TDZ 加固）═══');
{
    const decl = L.map((l, i) => (l.trim() === 'let savedOk = 0;' ? i + 1 : 0)).filter(Boolean);
    const closure = L.findIndex(l => l.includes('let gmReported')) + 1;
    const assign = L.findIndex(l => l.includes('savedOk = batchOk')) + 1;
    check('savedOk 真声明唯一', decl.length === 1, `${decl.length} 处: ${decl}`);
    check('声明早于闭包（无 TDZ）', decl[0] < closure, `${decl[0]} vs ${closure}`);
    check('赋值晚于闭包（异步时已完成）', assign > closure, `${assign} vs ${closure}`);
}

console.log('\n═══ 前四版修复未回退 ═══');
{
    const Lx = src.split('\n');
    const callLines = Lx.map((l, i) => (/const handed = saveVideoViaGM\(/.test(l) ? i + 1 : 0)).filter(Boolean);
    const fb = Lx.findIndex(l => l.includes('let res = await fetchBlob(url')) + 1;
    const so = Lx.findIndex(l => l.includes('const saveOne =')) + 1;
    check('直落真调用唯一', callLines.length === 1, `${callLines.length} 处`);
    check('直落早于 fetchBlob', callLines[0] < fb, `${callLines[0]} vs ${fb}`);
    check('直落在 saveOne 之前', callLines[0] < so, `${callLines[0]} vs ${so}`);
    check('落盘命名不再二次推导 extOf', !/const ext = extOf\(url,/.test(codeOnly));
    check('双条件判定仍在', /files\.length === 0 && videoHanded === 0/.test(codeOnly));
    check('blob 不再写死 60s 释放',
        !/revokeObjectURL\(url\)\s*,\s*60000\s*\)/.test(codeOnly), '写死释放回来了');
    check('探流确认式仍在', /blob 已关联/.test(src));
    check('onload 字节校验仍在', /const short = want > 0 && got > 0 && got < want;/.test(codeOnly));
    check('blob 兜底字节校验仍在', /blob\.size < want/.test(codeOnly));
    check('队列 started 仍在', /let started = false;/.test(codeOnly));
    check('假 resolve 仍已删除', !/settle = \(res\) => res;/.test(codeOnly));
    check('handedToGM 辅助仍在', /function handedToGM\(item\)/.test(codeOnly));
    check('item.onGMDone 仍被调用', /item\.onGMDone\(true\)/.test(codeOnly));
}

console.log('\n═══ 老功能未坏 ═══');
check('saveBlob 原生分支仍在', /isBigBlob\(blob, forceNative\)/.test(codeOnly));
check('a.remove 延迟 2000ms', /\}, 2000\);/.test(src));
check('两趟去重未坏', /const deduped = \[\]/.test(src));
check('右下角常驻未坏', /\.wb-card-dl\{[\s\S]{0,400}?opacity:\.(?!0\b)[\d.]+/.test(src));
check('零 @require', !/^\/\/ @require/m.test(src));

console.log('\n═══ 版本 ═══');
const vMeta = (src.match(/@version\s+([\d.]+)/) || [])[1];
const vConst = (src.match(/const VERSION = '([\d.]+)'/) || [])[1];
check('版本号两处一致', vMeta === vConst && /^\d+\.\d+\.\d+$/.test(vMeta || ''), `${vMeta}/${vConst}`);
check('头部有 v0.1.31 记录', /v0\.1\.31/.test(src));

console.log(`\n${'═'.repeat(46)}`);
console.log(`结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
