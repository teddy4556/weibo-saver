// v0.1.27 同步断言：createQueue 结构修正
const fs = require('fs');
const P = require('./_target.js').TARGET;
const src = fs.readFileSync(P, 'utf8');
const codeOnly = src.split('\n').filter(l => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}${e ? ' → ' + e : ''}`); } };

console.log('\n═══ 真因：settle 假函数 + add 里提前 next() ═══');
{
    const i = codeOnly.indexOf('function createQueue');
    const q = codeOnly.slice(i, i + 1800);

    check('有 started 标记', /let started = false;/.test(q));
    check('假 resolve 已删除', !/settle = \(res\) => res;/.test(q), '假函数还在');
    check('add 只入队（无裸 next）',
        /add\(fn\)[\s\S]{0,200}?results\.length \+= 1;\s*\n\s*if \(started\) next\(\);/.test(q),
        'add 里还有无条件 next()');
    check('start 先建 Promise 再 next()',
        /const p = new Promise\(\(resolve\) => \{ settle = resolve; \}\);[\s\S]{0,160}started = true;\s*\n\s*next\(\);\s*\n\s*return p;/.test(q));
    check('空队列早退返回数组',
        /if \(tasks\.length === 0\) \{ settle\(null\); settle = null; return Promise\.resolve\(\[\]\); \}/.test(q));
    check('next() 完成判定要求 started',
        /if \(started && active === 0 && tasks\.length === 0 && settle\)/.test(q));
    check('注释写明症状', /队列完成 → fetchBlob 返回/.test(src) || /队列在 blob 还在下载时就宣布/.test(src));
    check('注释写明旧实现两处错误',
        /假 resolve/.test(src) && /没区分「还没 start」和「已全部完成」/.test(src));
}

console.log('\n═══ 两条下载路径都还调用队列 ═══');
check('createQueue 调用参数未改', /createQueue\(cfg\.isImageHD \? 3 : 5\)/.test(codeOnly));
check('两处 await queue.start() 都在', (codeOnly.match(/await queue\.start\(\)/g) || []).length === 2);
check('两处 queue.add 都在', (codeOnly.match(/queue\.add\(/g) || []).length >= 2);

console.log('\n═══ 视频直落 / 兜底链未坏 ═══');
check('saveVideoViaGM 在（doneCb）', /function saveVideoViaGM\(url, info, item, doneCb, fallbackBlob\)/.test(codeOnly));
check('saveVideoViaBlob 兜底在（doneCb）', /function saveVideoViaBlob\(url, name, doneCb\)/.test(codeOnly));
check('视频判定 === false', /cfg\.isVideoViaBlob === false/.test(codeOnly));
check('fallbackTried 防死循环', /let fallbackTried = false;/.test(codeOnly));
check('onerror 会降级', /GM_download 失败，降级 blob \+ saveAs 路径/.test(codeOnly));
check('队列后打点在', /队列完成 收集=\$\{files\.length\}/.test(codeOnly));

console.log('\n═══ 老功能未坏 ═══');
check('HARD_TIMEOUT 仍在', /HARD_TIMEOUT/.test(codeOnly));
check('CDN 破缓存未坏', /download_timestamp=\$\{_bustSeq\}/.test(codeOnly));
check('extOf 白名单未坏', /const MEDIA_EXTS = \[/.test(src));
check('两趟去重未坏', /const deduped = \[\]/.test(src));
check('右下角常驻未坏', /\.wb-card-dl\{[\s\S]{0,400}?opacity:\.(?!0\b)[\d.]+/.test(src));
check('图片仍走 GM_download', /if \(typeof GM_download === 'function'\) \{/.test(codeOnly));
check('GM_download grant 在', /@grant\s+GM_download/.test(src));
check('零 @require', !/^\/\/ @require/m.test(src));

console.log('\n═══ 版本 ═══');
const vMeta = (src.match(/@version\s+([\d.]+)/) || [])[1];
const vConst = (src.match(/const VERSION = '([\d.]+)'/) || [])[1];
check('版本号两处一致（动态比对，不写死版本）',
    vMeta === vConst && /^\d+\.\d+\.\d+$/.test(vMeta || ''), `${vMeta}/${vConst}`);
check('头部有 v0.1.27 历史记录', /v0\.1\.27/.test(src));
check('头部有 v0.1.27 记录', /v0\.1\.27/.test(src));

console.log(`\n${'═'.repeat(46)}`);
console.log(`结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
