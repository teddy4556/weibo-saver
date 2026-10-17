// v0.1.30 回归：修「停下载了」—— blob URL 提前释放 + GM onload 不校验字节
const fs = require('fs');
const P = require('./_target.js').TARGET;
const src = fs.readFileSync(P, 'utf8');
const codeOnly = src.split('\n').filter(l => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}${e ? ' → ' + e : ''}`); } };

console.log('\n═══ 根因①：revokeObjectURL 写死 60s → 下载中途被腰斩 ═══');
console.log('  用户实测：浏览器下载条走到一半停住');
{
    check('不再有裸的 60000 立即释放',
        !/setTimeout\(\(\) => URL\.revokeObjectURL\(url\), 60000\);/.test(codeOnly),
        '写死的释放还在');
    check('改用确认式释放（fetch 探流）', /fetch\(url, \{ method: 'GET' \}\)/.test(codeOnly));
    check('拿到响应头才算已认领', /res\.status/.test(codeOnly) && /blob 已关联/.test(codeOnly));
    check('探流成功后再延迟释放', /clearTimeout\(probe\);[\s\S]{0,300}?releaseLater\(60000\)/.test(codeOnly));
    check('探流失败有兜底时长', /releaseLater\(300000\)/.test(codeOnly));
    check('probe 超时有兜底', /const probe = setTimeout\(\(\) => releaseLater\(300000\), 2000\)/.test(codeOnly));
    check('释放包了 try/catch', /try \{ URL\.revokeObjectURL\(url\); \} catch/.test(codeOnly));
    check('主动 cancel 探流读', /res\.body\.cancel\(\)/.test(codeOnly));
    check('落盘触发有日志', /落盘已触发/.test(codeOnly));
    check('日志带 blob 大小', /blob \$\{\(blob\.size \/ 1048576\)\.toFixed\(2\)\}MB/.test(codeOnly));
}

console.log('\n═══ 根因②：GM_download onload ≠ 下载成功 ═══');
console.log('  onload 语义是「任务结束」，字节不全时照样触发 → 报 ✅ 但文件残缺');
{
    const i = codeOnly.indexOf('function saveVideoViaGM');
    const f = codeOnly.slice(i, codeOnly.indexOf('function saveVideoViaBlob'));
    check('有 lastLoaded/lastTotal 计数', /let lastLoaded = 0, lastTotal = 0;/.test(f));
    check('onprogress 记录字节数', /lastLoaded = e\.loaded;/.test(f) && /lastTotal = e\.total \|\| 0;/.test(f));
    check('onload 里比对字节', /const short = want > 0 && got > 0 && got < want;/.test(f));
    check('字节不全时转 blob 重下',
        /if \(short\) \{[\s\S]{0,700}?fallbackBlob\(url, name, finish\);/.test(f));
    check('不全时不算成功', /字节不全/.test(f) && /转 blob \+ saveAs 路径重下/.test(f));
    check('完整时打 MB 数', /完整）/.test(f) && /\(got \/ 1048576\)\.toFixed\(2\)/.test(f));
    check('fallbackTried 防重复降级', /let fallbackTried = false;/.test(f));
    check('onerror 仍能降级', /onerror[\s\S]{0,900}?fallbackBlob\(url, name, finish\)/.test(f));
    check('ontimeout 仍能降级', /ontimeout[\s\S]{0,800}?fallbackBlob\(url, name, finish\)/.test(f));
}

console.log('\n═══ 根因③：blob 兜底也不校验完整性 ═══');
{
    const i = codeOnly.indexOf('function saveVideoViaBlob');
    const f = codeOnly.slice(i, codeOnly.indexOf('function saveBlob'));
    check('读 Content-Length', /content-length/i.test(f));
    check('比对 blob.size < want', /blob\.size < want/.test(f));
    check('不全时判定失败', /字节不全/.test(f) && /finish && finish\(false\);/.test(f));
    check('完整时打日志', /blob 兜底完整/.test(f));
}

console.log('\n═══ 完整性判定真跑 ═══');
{
    const judge = (got, want) => {
        if (!(want > 0 && got > 0 && got < want)) return 'COMPLETE_OR_UNKNOWN';
        return 'SHORT';
    };
    const cases = [
        ['完整 4.2MB/4.2MB', 4253400, 4253400, 'COMPLETE_OR_UNKNOWN'],
        ['截断 2MB/4.2MB', 2100000, 4253400, 'SHORT'],
        ['截断 1MB/4.2MB', 1048576, 4253400, 'SHORT'],
        ['未知长度 3MB/0', 3145728, 0, 'COMPLETE_OR_UNKNOWN'],
        ['零字节 0/4.2MB', 0, 4253400, 'COMPLETE_OR_UNKNOWN'],
        ['下载中 0/4.2MB', 0, 4253400, 'COMPLETE_OR_UNKNOWN'],
    ];
    cases.forEach(([label, got, want, w]) => {
        const g = judge(got, want);
        check(`${label} → ${w}`, g === w, `得到 ${g}`);
    });
}

console.log('\n═══ 释放时机真跑（模拟）═══');
{
    // 真实场景复现：视频几十 MB + 慢速网络，超过 60s 还没下完
    // expectCut = 这个场景按预期会不会被旧的 60s 逻辑腰斩
    const scenarios = [
        { mb: 8.5, speed: 0.35, expectCut: false, label: '8.5MB @ 0.35MB/s' },
        { mb: 25,  speed: 0.30, expectCut: true,  label: '25MB  @ 0.30MB/s' },
        { mb: 60,  speed: 0.50, expectCut: true,  label: '60MB  @ 0.50MB/s' },
        { mb: 120, speed: 1.00, expectCut: true,  label: '120MB @ 1.00MB/s' },
        { mb: 4.2, speed: 2.00, expectCut: false, label: '4.2MB @ 2.00MB/s（快网小文件）' },
    ];
    const OLD = 60000, FALLBACK = 300000;
    scenarios.forEach(({ mb, speed, expectCut, label }) => {
        const ms = (mb / speed) * 1000;
        const cutByOld = OLD < ms;
        const safeByFallback = FALLBACK >= ms;
        console.log(`  ${label} → ${Math.round(ms/1000)}s | 旧逻辑${cutByOld ? '❌腰斩' : '✅不切'} | 新兜底${safeByFallback ? '✅安全' : '⚠仍会断'}`);
        check(`${label}：旧逻辑${expectCut ? '会' : '不会'}腰斩`, cutByOld === expectCut);
        check(`${label}：新兜底 300s 安全`, safeByFallback, `${Math.round(ms)}ms`);
    });

    check('存在会被旧逻辑腰斩的真实场景',
        scenarios.filter(s => s.expectCut).length >= 3);
    check('新兜底覆盖所有场景', scenarios.every(s => FALLBACK >= (s.mb / s.speed) * 1000));
}

console.log('\n═══ v0.1.29 三条根因未回退 ═══');
{
    const L = src.split('\n');
    const callLines = L.map((l, i) => (/const handed = saveVideoViaGM\(/.test(l) ? i + 1 : 0)).filter(Boolean);
    const qa = L.map((l, i) => (l.includes('queue.add(async') ? i + 1 : 0)).filter(Boolean);
    const fb = L.findIndex(l => l.includes('let res = await fetchBlob(url')) + 1;
    const so = L.findIndex(l => l.includes('const saveOne =')) + 1;
    check('直落真调用唯一', callLines.length === 1, `${callLines.length} 处`);
    check('直落早于 fetchBlob', callLines[0] < fb, `${callLines[0]} vs ${fb}`);
    check('直落在 saveOne 之前', callLines[0] < so, `${callLines[0]} vs ${so}`);
    check('落盘命名不再二次推导 extOf', !/const ext = extOf\(url,/.test(codeOnly));
    check('ext 用 item.ext', /const ext = item\.ext \|\| \(item\.isTop \? 'mp4' : 'jpg'\);/.test(codeOnly));
    check('双条件判定仍在', /files\.length === 0 && videoHanded === 0/.test(codeOnly));
    check('队列 started 标记仍在', /let started = false;/.test(codeOnly));
    check('假 resolve 仍已删除', !/settle = \(res\) => res;/.test(codeOnly));
}

console.log('\n═══ 老功能未坏 ═══');
check('saveBlob 原生分支仍在', /isBigBlob\(blob, forceNative\)/.test(codeOnly));
check('a.remove 仍延迟 2000ms', /\}, 2000\);/.test(codeOnly));
check('图片链路仍走 GM_download', /if \(typeof GM_download === 'function'\)/.test(codeOnly));
check('HARD_TIMEOUT 仍在', /HARD_TIMEOUT/.test(codeOnly));
check('两趟去重未坏', /const deduped = \[\]/.test(src));
check('右下角常驻未坏', /\.wb-card-dl\{[\s\S]{0,400}?opacity:\.(?!0\b)[\d.]+/.test(src));
check('GM_download grant 在', /@grant\s+GM_download/.test(src));
check('零 @require', !/^\/\/ @require/m.test(src));

console.log('\n═══ 版本 ═══');
const vMeta = (src.match(/@version\s+([\d.]+)/) || [])[1];
const vConst = (src.match(/const VERSION = '([\d.]+)'/) || [])[1];
check('版本号两处一致（动态比对，不写死版本）',
    vMeta === vConst && /^\d+\.\d+\.\d+$/.test(vMeta || ''), `${vMeta}/${vConst}`);
check('头部有 v0.1.30 记录', /v0\.1\.30/.test(src));

console.log(`\n${'═'.repeat(46)}`);
console.log(`结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
