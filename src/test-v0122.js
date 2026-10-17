// v0.1.22 回归：修视频下载失败
const fs = require('fs');
const P = require('./_target.js').TARGET;
const src = fs.readFileSync(P, 'utf8');
const codeOnly = src.split('\n').filter(l => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}${e ? ' → ' + e : ''}`); } };

console.log('\n═══ 修法一：a.remove() 不能紧跟 click()（真因之一）═══');
{
    // fallbackSave 是文件里最后一个落盘函数，其后没有下一个函数可做右边界，
    // 所以用固定长度切片（不能按 saveBlob 切 —— 那个函数排在 fallbackSave 之前）
    const fs2 = src.slice(src.indexOf('function fallbackSave'), src.indexOf('function fallbackSave') + 4000);
    check('fallbackSave 切片非空', fs2.length >= 800, `${fs2.length} 字符`);
    // 只看 click 那一行的下一行是不是裸的 a.remove()
    // （不能跨多行匹配 —— 中间是注释块，会把已经修好的代码误判成没修）
    const clickLine = fs2.split('\n').findIndex(l => l.trim().startsWith('a.click()'));
    const nextLine = clickLine >= 0 ? (fs2.split('\n')[clickLine + 1] || '').trim() : '';
    check('click() 下一行不是裸 a.remove()',
        clickLine >= 0 && !/^a\.remove\(\);?$/.test(nextLine),
        `下一行是: ${nextLine}`);
    check('click() 下一行是注释（说明清理已挪进 setTimeout）',
        clickLine >= 0 && nextLine.startsWith('//'), `下一行是: ${nextLine}`);
    check('清理包在 setTimeout 里', /setTimeout\(\(\) => \s*\{[\s\S]{0,260}?removeChild\(a\)/.test(fs2));
    check('延迟 2000ms（视频要时间建任务）', /\}\s*,\s*2000\s*\);/.test(fs2));
    // v0.1.30 起不再写死 60s：改成「确认 Chrome 已认下 blob 才释放」（见 test-v0126）
    check('blob URL 不再写死 60s 释放（v0.1.30 改确认式）',
        !/revokeObjectURL\(url\)\s*,\s*60000\s*\)/.test(fs2));
    check('removeChild 前判父节点存在', /a\.parentNode\)\s*a\.parentNode\.removeChild\(a\)/.test(fs2));
}

// 这段原本是「修法二：视频直连 saveDirect」的 4 条正向断言，但 3 行漏了 check( 开头，
// 变成裸表达式悬在块里 → SyntaxError。且 saveDirect 已在 v0.1.23 主动撤销
// （见下方「修法二（v0.1.23 已撤销）」那段），正向断言永远不可能过。
// 改成反向断言：确认它确实不在了。
{
    check('saveDirect 不存在（v0.1.23 已撤销视频直连）', !/function saveDirect/.test(codeOnly));
    check('没有 isTop 直连分支残留', !/return saveDirect\(/.test(codeOnly));
}

console.log('\n═══ 修法二（v0.1.23 已撤销）：视频直连已移除 ═══');
check('saveDirect 已删除', !/function saveDirect\(/.test(codeOnly));
check('不再有 isTop 直连分支', !/item\.isTop && !cfg\./.test(codeOnly));
{
    check('有大文件阈值常量', /const BIG_FILE_BYTES = 2 \* 1024 \* 1024;/.test(codeOnly));
    check('有 isBigBlob 判定（v0.1.23 起带 forceNative）', /function isBigBlob\(blob, forceNative\)|function isBigBlob\(blob,? ?forceNative?\)/.test(codeOnly) || /function isBigBlob\(blob/.test(codeOnly));
    check('字符串 URL 不算大文件（直连更稳）', /typeof blob === 'string'\) return false;/.test(codeOnly));
    check('saveBlob 开头就分流', /if \(isBigBlob\(blob, forceNative\)\) \{[\s\S]{0,400}?fallbackSave\(/.test(codeOnly));
    check('分流后 return，不再往下走 GM_download', /fallbackSave\([\s\S]{0,80}?\);\s*\n\s*return;/.test(codeOnly));
    check('大文件有日志说明原因', /大文件易超时|走原生/.test(codeOnly));
}

console.log('\n═══ 分流阈值行为测试（真跑）═══');
{
    const BIG = 2 * 1024 * 1024;
    const isBig = (blob) => {
        if (!blob) return false;
        if (typeof blob === 'string') return false;
        const size = typeof blob.size === 'number' ? blob.size : 0;
        return size > BIG;
    };
    check('8.5MB 视频 → 走原生下载', isBig({ size: 8553226 }) === true);
    check('2MB 图片 → 走 GM_download', isBig({ size: 2 * 1024 * 1024 }) === false);
    check('500KB 图片 → 走 GM_download', isBig({ size: 500 * 1024 }) === false);
    check('字符串 URL → 走 GM_download', isBig('https://x/a.mp4') === false);
    check('null → 兜底', isBig(null) === false);
    check('无 size 字段 → 走 GM_download', isBig({}) === false);
    check('30MB 直播录像 → 走原生下载', isBig({ size: 30 * 1024 * 1024 }) === true);
}

console.log('\n═══ 菜单开关 ═══');
check('有视频下载方式菜单', /GM_registerMenuCommand\([\s\S]{0,200}?cfg\.isVideoViaBlob/.test(src));
check('菜单能切换并持久化', /GM_setValue\(CFG_KEYS\.isVideoViaBlob,/.test(codeOnly));
check('cfg 有 isVideoViaBlob key（v0.1.25 统一命名）', /isVideoViaBlob: 'wb_video_blob'/.test(src));
check('默认直连', /isVideoViaBlob: false,/.test(codeOnly));
check('菜单文案说明两种模式差别', /不走内存/.test(src) || /GM直落|直落.*Blob|Blob.*直落/s.test(src));

console.log('\n═══ 老功能未坏 ═══');
check('图片仍走 GM_download', /if \(typeof GM_download === 'function'\) \{/.test(codeOnly));
check('GM_download 失败仍兜底', /GM_download ❌/.test(codeOnly));
check('CDN 破缓存重试未坏', /const MAX = 4;/.test(codeOnly));
check('video_sources 降级未坏', /pickFromVideoSourcesAttr/.test(codeOnly));
check('extOf 白名单未坏', /const MEDIA_EXTS = \[/.test(src));
check('两趟去重未坏', /const deduped = \[\]/.test(src));
check('祖先兜底仍已删', !/closest\('\[data-wb-dl-btn/.test(codeOnly));
// 意图式断言：按钮在右下角 + 常驻可点，不锁死 opacity 数值（v0.1.33 是 .88）
check('右下角常驻未坏', /\.wb-card-dl\{[\s\S]{0,400}?opacity:\.(?!0\b)[\d.]+/.test(src)
    && /\.wb-card-dl\{[\s\S]{0,400}?pointer-events:auto/.test(src));
check('跳过统计未坏', /nNoId|无id=/.test(codeOnly));

console.log('\n═══ 版本 ═══');
const vMeta = (src.match(/@version\s+([\d.]+)/) || [])[1];
const vConst = (src.match(/const VERSION = '([\d.]+)'/) || [])[1];
check('版本号两处一致（动态比对，不写死版本）',
    vMeta === vConst && /^\d+\.\d+\.\d+$/.test(vMeta || ''), `${vMeta}/${vConst}`);
check('头部有 v0.1.22 记录', /v0\.1\.22 变更/.test(src));
check('零 @require', !/^\/\/ @require/m.test(src));
check('GM_download 仍保留（图片靠它）', /@grant\s+GM_download/.test(src));

console.log(`\n${'═'.repeat(46)}`);
console.log(`结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
