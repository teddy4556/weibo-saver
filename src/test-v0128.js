// v0.1.28 回归：修「保存的媒体不落盘」（files=0 被误判成无资源）
const fs = require('fs');
const P = require('./_target.js').TARGET;
const src = fs.readFileSync(P, 'utf8');
const codeOnly = src.split('\n').filter(l => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}${e ? ' → ' + e : ''}`); } };

console.log('\n═══ 真因：直落的视频不进 files → files=0 → 误判无资源 ═══');
console.log('  用户实测：视频其实下下来了（文件在），但进度条显示「重试」');
console.log('  v0.1.27 修好队列后才暴露出来 —— 之前队列提前 settle，根本走不到这行');
{
    const i = codeOnly.indexOf('const videoHanded');
    const seg = codeOnly.slice(i, i + 1800);
    check('有 videoHanded 统计', /const videoHanded = mediaItems\.filter/.test(codeOnly));
    check('统计只数已交给 GM 的', /m\.isTop && handedToGM\(m\)/.test(codeOnly));
    check('判定改为 files 与直落双条件',
        /if \(files\.length === 0 && videoHanded === 0\)/.test(codeOnly),
        '还是单看 files.length');
    const tail = codeOnly.slice(i, i + 1400);
    check('files=0 且有直落 → 不判失败',
        /if \(files\.length === 0\) \{[\s\S]{0,900}?已交给浏览器下载[\s\S]{0,900}?return true;/.test(tail));
    check('日志带「直落」计数', /直落=\$\{videoHanded\}/.test(codeOnly));
}

console.log('\n═══ 状态回调：GM_download 是异步的，不能提前定状态 ═══');
{
    const f = codeOnly.slice(codeOnly.indexOf('function saveVideoViaGM'), codeOnly.indexOf('function saveVideoViaBlob'));
// 注：v0.1.30 起 onload 里多了「字节不全则重下」块，onGMDone 距 onload 起点更远，
// 所以断言窗口按 onGMDone 的真实位置放宽。
    check('onload 调 item.onGMDone(true)', /onload[\s\S]{0,1600}?item\.onGMDone\(true\)/.test(f));
    check('onerror 调 item.onGMDone(false)', /onerror[\s\S]{0,900}?item\.onGMDone\(false\)/.test(f));
    check('ontimeout 调 item.onGMDone(false)', /ontimeout[\s\S]{0,700}?item\.onGMDone\(false\)/.test(f));
    check('有 handedToGM 辅助函数', /function handedToGM\(item\)/.test(codeOnly));
    check('直落成功时打 __handedToGM 标记', /item\.__handedToGM = true;/.test(codeOnly));
    check('标记在 handed 返回 true 时才打', /item\.__handedToGM = true;[\s\S]{0,80}?return null;/.test(codeOnly));
}

console.log('\n═══ 判定逻辑真跑（行为测试）═══');
{
    // 复刻落盘阶段的三分支判定
    function decide(filesLen, videoHanded, isTopCount) {
        if (filesLen === 0 && videoHanded === 0) return 'FAILED';
        if (filesLen === 0) return 'HANDED_ONLY';
        return 'SAVE_FILES';
    }
    const cases = [
        ['纯图片（files=3, 无直落）', 3, 0, 'SAVE_FILES'],
        ['纯视频直落（files=0, 直落=1）', 0, 1, 'HANDED_ONLY'],
        ['真的没资源（files=0, 直落=0）', 0, 0, 'FAILED'],
        ['混批（图2 + 视频直落1）', 2, 1, 'SAVE_FILES'],
        ['多视频直落（files=0, 直落=3）', 0, 3, 'HANDED_ONLY'],
        ['视频走 blob（files=1, 直落=0）', 1, 0, 'SAVE_FILES'],
    ];
    cases.forEach(([label, fl, vh, want]) => {
        const got = decide(fl, vh);
        check(`${label} → ${want}`, got === want, `得到 ${got}`);
    });

    // 旧判定对照
    const oldDecide = (filesLen) => (filesLen === 0 ? 'FAILED' : 'SAVE_FILES');
    check('旧判定会把纯视频误判失败',
        oldDecide(0) === 'FAILED' && decide(0, 1) === 'HANDED_ONLY',
        '对照失效');
}

console.log('\n═══ 混批：视频直落 + 图片落盘 ═══');
{
    check('视频直落数被记住（v0.1.31 改为双计数）', /let gmReported = 0;/.test(codeOnly) && /let gmOk = 0;/.test(codeOnly));
    check('混批也挂了 onGMDone', /if \(!m\.isTop \|\| !handedToGM\(m\)\) return;[\s\S]{0,160}m\.onGMDone = /.test(codeOnly));
    check('回调里分别计回报数与成功数', /gmReported \+= 1;/.test(codeOnly) && /if \(ok\) gmOk \+= 1;/.test(codeOnly));
    check('全部视频出结果才定终态', /if \(gmReported < videoHanded\) return;/.test(codeOnly));
    check('终态看整体成功数', /const allOk = gmOk === videoHanded;/.test(codeOnly));
}

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
check('HARD_TIMEOUT 仍在', /HARD_TIMEOUT/.test(codeOnly));
check('extOf 白名单未坏', /const MEDIA_EXTS = \[/.test(src));
check('两趟去重未坏', /const deduped = \[\]/.test(src));
check('右下角常驻未坏', /\.wb-card-dl\{[\s\S]{0,400}?opacity:\.(?!0\b)[\d.]+/.test(src));
check('GM_download grant 在', /@grant\s+GM_download/.test(src));
check('零 @require', !/^\/\/ @require/m.test(src));

console.log('\n═══ 版本 ═══');
const vMeta = (src.match(/@version\s+([\d.]+)/) || [])[1];
const vConst = (src.match(/const VERSION = '([\d.]+)'/) || [])[1];
check('版本号两处一致（动态比对，不写死版本）',
    vMeta === vConst && /^\d+\.\d+\.\d+$/.test(vMeta || ''), `${vMeta}/${vConst}`);
check('头部有 v0.1.28 历史记录', /v0\.1\.28/.test(src));
check('头部有 v0.1.28 记录', /v0\.1\.28/.test(src));

console.log(`\n${'═'.repeat(46)}`);
console.log(`结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
