// v0.1.29 回归：修「卡在保存中 / 图片也下不了 / 文件名又变 #00」
// 三条根因：
//  ① 视频直落块被误置到落盘阶段（item 已出作用域）→ 整段永不生效
//  ② 直落判定排在 fetchBlob 之后 → 先白下几 MB 才交给 GM_download
//  ③ extOf 二次推导覆盖 item.ext → 文件名退回「#00」
const fs = require('fs');
const P = require('./_target.js').TARGET;
const src = fs.readFileSync(P, 'utf8');
const codeOnly = src.split('\n').filter(l => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
const L = src.split('\n');

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}${e ? ' → ' + e : ''}`); } };

// 定位辅助：只看真调用（排除 function 定义行）
const callLines = [];
L.forEach((l, i) => {
    if (/const handed = saveVideoViaGM\(/.test(l)) callLines.push(i + 1);
});
const defLine = L.findIndex(l => l.includes('function saveVideoViaGM(')) + 1;
const qa = L.map((l, i) => l.includes('queue.add(async') ? i + 1 : 0).filter(Boolean);
const fbIdx = L.findIndex(l => l.includes('let res = await fetchBlob(url'));   // 0-indexed
const fbLine = fbIdx + 1;                                              // 展示用 1-indexed
const pushLine = L.map((l, i) => l.includes('files.push({ name') ? i + 1 : 0).filter(Boolean);
const startLine = L.map((l, i) => (l.includes('await queue.start()') ? i + 1 : 0)).filter(Boolean);
const saveOneIdx = L.findIndex(l => l.includes('const saveOne ='));
const saveOneLine = saveOneIdx + 1;

console.log('\n═══ 根因①：直落块位置（从落盘阶段搬回收集阶段）═══');
console.log(`  直落定义 @${defLine} | 真调用 @${callLines} | fetchBlob @${fbLine} | saveOne @${saveOneLine}`);
check('直落真调用只有一处', callLines.length === 1, `${callLines.length} 处: ${callLines}`);
check('不在落盘阶段（saveOne 之后）', callLines[0] < saveOneLine, `调用 ${callLines[0]} vs saveOne ${saveOneLine}`);
check('落盘阶段无 item.isTop 直落残留', !codeOnly.slice(codeOnly.indexOf('const saveOne =')).includes('item.isTop && cfg.isVideoViaBlob'), '落盘阶段还有');
check('saveOne 在落盘阶段且是唯一定义', saveOneLine > 0 && L.filter(l => l.includes('const saveOne =')).length === 1);

console.log('\n═══ 根因②：直落必须早于 fetchBlob（省掉白下载）═══');
check('直落判定在 fetchBlob 之前', callLines[0] < fbLine, `调用 ${callLines[0]} vs fetchBlob ${fbLine}`);
check('直落在队列任务内',
    qa.some(q => q < callLines[0]) && startLine.some(s => s > callLines[0]),
    `queue.add=${qa} 调用=${callLines[0]} start=${startLine}`);
check('直落在 files.push 之前', callLines[0] < Math.min(...pushLine.filter(x => x > callLines[0])));
check('直落成功即 return null（不重复下载）',
    /__handedToGM = true;[\s\S]{0,120}?return null;/.test(codeOnly));
{
    // 取直落调用**之前最近**的那个 queue.add（主队列，不是 m3u8 的那个）
    const before = qa.filter(q => q < callLines[0]);
    const w0 = before[before.length - 1];
    const w1 = fbIdx;                               // 0-indexed，半开区间 [w0, w1)
    // 注意：用原始行 L 而非 codeOnly —— 剥注释会改变行号，slice 会错位
    const win = L.slice(w0, w1).join('\n');   // [w0, w1) 半开，不含 fetchBlob 行本身
    check('直落块在 fetchBlob 之前的窗口内', win.includes('saveVideoViaGM'));
    // 只看真代码行（排掉 // 注释），注释里会提到 fetchBlob
    // 剥掉行内注释后再查（注释里会提到 fetchBlob，真调用才有 await）
    const winCode = L.slice(w0, w1)
        .map(l => l.replace(/\/\/.*$/, ''))
        .join('\n');
    check('该窗口内还没有真正的 fetchBlob 调用', !winCode.includes('await fetchBlob'),
        winCode.split('\n').filter(l => l.includes('await fetchBlob')).join(' | '));
    check('窗口内直落块完整（含 __handedToGM 与 return null）',
        winCode.includes('__handedToGM = true') && winCode.includes('return null'));
    check('窗口顺序：queue.add < 直落 < fetchBlob',
        w0 < callLines[0] && callLines[0] < fbLine,
        `${w0} / ${callLines[0]} / ${fbLine}`);
}

console.log('\n═══ 根因③：extOf 二次推导已移除 ═══');
check('落盘命名不再调 extOf',
    !/const ext = extOf\(url,/.test(codeOnly), '二次推导还在');
check('改用 item.ext', /const ext = item\.ext \|\| \(item\.isTop \? 'mp4' : 'jpg'\);/.test(codeOnly));
check('extOf 只在收集阶段调用',
    (codeOnly.match(/extOf\(/g) || []).filter(s => s).length >= 2 &&
    !L.slice(callLines[0], saveOneLine).some(l => l.includes('extOf(url')),
    '收集→落盘之间还有 extOf 调用');
check('extOf 字母开头正则仍在', /\$/.test('') || /const m = url\.split\('\?'\)\[0\]\.match\(\/\\\.\(\[A-Za-z\]\[A-Za-z0-9\]\{1,3\}\)\$\/\)/.test(src));
check('MEDIA_EXTS 白名单仍在', /const MEDIA_EXTS = \[/.test(src));

console.log('\n═══ 根因③ 真跑：URL 尾部形态对照 ═══');
{
    const MEDIA_EXTS = ['jpg','jpeg','png','gif','webp','bmp','heic','avif','mp4','m4v','mov','mkv','avi','flv','ts','m3u8','webm','3gp','mp3','m4a','aac','wav','bin','part','txt'];
    const extOf = (url, fb) => {
        if (typeof url !== 'string' || !url) return fb;
        const m = url.split('?')[0].match(/\.([A-Za-z][A-Za-z0-9]{1,3})$/);
        if (!m) return fb;
        const ext = m[1].toLowerCase();
        if (ext === 'json' || ext === 'php' || ext === 'html') return fb;
        if (!MEDIA_EXTS.includes(ext)) return fb;
        return ext;
    };
    // 收集阶段的干净 URL
    const clean = 'https://f.video.weibocdn.com/xxx/abc_00';
    // fetchBlob 里加过缓存参数/破缓存后的 URL
    const busted = 'https://f.video.weibocdn.com/xxx/abc_00?download=1&download_timestamp=1792135470801';

    const e1 = extOf(clean, 'mp4');
    const e2 = extOf(busted, 'mp4');
    console.log(`  干净 URL → ${e1} | 加缓存参数后 → ${e2}`);
    check('干净 URL 走 fallback mp4', e1 === 'mp4', e1);
    check('加参数后仍走 fallback mp4（未被数字段污染）', e2 === 'mp4', e2);
    check('两者一致（所以二次推导无害）', e1 === e2, `${e1} vs ${e2}`);

    // 真实 mp4 URL 必须仍然认得出
    check('真 .mp4 URL 仍识别为 mp4', extOf('https://x.com/a/b.mp4', 'mp4') === 'mp4');
    check('m3u8 仍识别', extOf('https://x.com/a/live.m3u8', 'mp4') === 'm3u8');
    check('.00 数字后缀不认', extOf('https://x.com/a/00', 'jpg') === 'jpg');
    check('.123 数字后缀不认', extOf('https://x.com/a/1.123', 'jpg') === 'jpg');
}

console.log('\n═══ 命名链路：item.ext → renderName ═══');
check('收集阶段给 item 挂了 ext', /mediaItems\.push\(\{ url: top, index: nextIndex\(\), ext: tExt, isLive: false, isTop: true \}\)/.test(codeOnly));
check('renderName 接收 ext', /renderName\(info, item\.index, ext\)/.test(codeOnly));
check('LivePhoto -live 位置正确', /base\.replace\(\/\\\.\[A-Za-z0-9\]\{2,4\}\$\/, ''\) \+ `-live\.\$\{ext\}`/.test(codeOnly));

console.log('\n═══ 状态机未坏 ═══');
check('双条件判定仍在', /files\.length === 0 && videoHanded === 0/.test(codeOnly));
check('videoHanded 统计仍在', /const videoHanded = mediaItems\.filter/.test(codeOnly));
check('handedToGM 辅助仍在', /function handedToGM\(item\)/.test(codeOnly));
check('onGMDone 回调挂上（两处：纯视频 / 混批）',
    (codeOnly.match(/\.onGMDone = \(ok\) =>/g) || []).length === 2,
    (codeOnly.match(/\.onGMDone = \(ok\) =>/g) || []).length + ' 处');
check('onGMDone 被调用', /item\.onGMDone\(true\)/.test(codeOnly));

console.log('\n═══ 队列修复未回退 ═══');
{
    const i = codeOnly.indexOf('function createQueue');
    const q = codeOnly.slice(i, i + 1800);
    check('started 标记仍在', /let started = false;/.test(q));
    check('假 resolve 仍已删除', !/settle = \(res\) => res;/.test(q));
    check('start 先建 Promise 再 next()', /const p = new Promise\(\(resolve\) => \{ settle = resolve; \}\);[\s\S]{0,160}started = true;\s*\n\s*next\(\);\s*\n\s*return p;/.test(q));
}

console.log('\n═══ 老功能未坏 ═══');
check('saveVideoViaBlob 兜底仍在（doneCb）', /function saveVideoViaBlob\(url, name, doneCb\)/.test(codeOnly));
check('降级链仍在', /降级 blob \+ saveAs 路径/.test(codeOnly));
check('fallbackTried 仍在', /let fallbackTried = false;/.test(codeOnly));
check('图片仍走 fetchBlob', /let res = await fetchBlob\(url, \{ verbose: !!item\.isTop \}\)/.test(codeOnly));
check('两趟去重未坏', /const deduped = \[\]/.test(src));
check('右下角常驻未坏', /\.wb-card-dl\{[\s\S]{0,400}?opacity:\.(?!0\b)[\d.]+/.test(src));
check('GM_download grant 在', /@grant\s+GM_download/.test(src));
check('零 @require', !/^\/\/ @require/m.test(src));

console.log('\n═══ 版本 ═══');
const vMeta = (src.match(/@version\s+([\d.]+)/) || [])[1];
const vConst = (src.match(/const VERSION = '([\d.]+)'/) || [])[1];
check('版本号两处一致（动态比对，不写死版本）',
    vMeta === vConst && /^\d+\.\d+\.\d+$/.test(vMeta || ''), `${vMeta}/${vConst}`);
check('头部有 v0.1.29 记录', /v0\.1\.29/.test(src));

console.log(`\n${'═'.repeat(46)}`);
console.log(`结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
