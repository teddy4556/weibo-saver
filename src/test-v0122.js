// v0.1.22 回归：修视频下载失败
const fs = require('fs');
const P = '/opt/data/cache/scratch/wb-build/weibo-saver-v0.1.0.user.js';
const src = fs.readFileSync(P, 'utf8');
const codeOnly = src.split('\n').filter(l => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}${e ? ' → ' + e : ''}`); } };

console.log('\n═══ 修法一：a.remove() 不能紧跟 click()（真因之一）═══');
{
    // fallbackSave 是文件里最后一个落盘函数，其后没有下一个函数可做右边界，
    // 所以用固定长度切片（不能按 saveBlob 切 —— 那个函数排在 fallbackSave 之前）
    const fs2 = src.slice(src.indexOf('function fallbackSave'), src.indexOf('function fallbackSave') + 1600);
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
    check('blob URL 延后 60s 释放', /revokeObjectURL\(url\)\s*,\s*60000\s*\)/.test(fs2));
    check('removeChild 前判父节点存在', /a\.parentNode\)\s*a\.parentNode\.removeChild\(a\)/.test(fs2));
}

console.log('\n═══ 修法二：视频直连，绕过 Blob 整条链 ═══');
{
        /if \(item\.isTop && !cfg\.isFetchVideoViaBlob\) \{\s*\n\s*return saveDirect\(/.test(codeOnly));
        /a\.download = name;/.test(codeOnly));
        /a\.click\(\);[\s\S]{0,120}setTimeout[\s\S]{0,120}removeChild\(a\)/.test(codeOnly));
        codeOnly.slice(codeOnly.indexOf('function saveDirect'), codeOnly.indexOf('function saveBlob'))
            .includes('视频直连下载'));
}

console.log('\n═══ 修法二（v0.1.23 已撤销）：视频直连已移除 ═══');
check('saveDirect 已删除', !/function saveDirect\(/.test(codeOnly));
check('不再有 isTop 直连分支', !/item\.isTop && !cfg\./.test(codeOnly));
{
    check('有大文件阈值常量', /const BIG_FILE_BYTES = 2 \* 1024 \* 1024;/.test(codeOnly));
    check('有 isBigBlob 判定', /function isBigBlob\(blob\)/.test(codeOnly));
    check('字符串 URL 不算大文件（直连更稳）', /typeof blob === 'string'\) return false;/.test(codeOnly));
    check('saveBlob 开头就分流', /if \(isBigBlob\(blob\)\) \{[\s\S]{0,260}fallbackSave\(blob, filename, onDone\);/.test(codeOnly));
    check('分流后 return，不再往下走 GM_download', /fallbackSave\(blob, filename, onDone\);\s*\n\s*return;/.test(codeOnly));
    check('大文件有日志说明原因', /GM_download 对 blob: URL \+ 大文件易超时/.test(codeOnly));
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
check('有视频下载方式菜单', /GM_registerMenuCommand\(\s*\n?\s*cfg\.isFetchVideoViaBlob/.test(src));
check('菜单能切换并持久化', /GM_setValue\(CFG_KEYS\.videoBlob, cfg\.isFetchVideoViaBlob\)/.test(codeOnly));
check('cfg 有 videoBlob key', /videoBlob: 'wb_video_blob'/.test(src));
check('默认直连', /isFetchVideoViaBlob: false,/.test(codeOnly));
check('菜单文案说明两种模式差别', /不走内存。推荐用这个。/.test(src));

console.log('\n═══ 老功能未坏 ═══');
check('图片仍走 GM_download', /if \(typeof GM_download === 'function'\) \{/.test(codeOnly));
check('GM_download 失败仍兜底', /GM_download ❌/.test(codeOnly));
check('CDN 破缓存重试未坏', /const MAX = 4;/.test(codeOnly));
check('video_sources 降级未坏', /pickFromVideoSourcesAttr/.test(codeOnly));
check('extOf 白名单未坏', /const MEDIA_EXTS = \[/.test(src));
check('两趟去重未坏', /const deduped = \[\]/.test(src));
check('祖先兜底仍已删', !/closest\('\[data-wb-dl-btn/.test(codeOnly));
check('右下角常驻未坏', /\.wb-card-dl\{[^}]*opacity:\.85/.test(src));
check('跳过统计未坏', /nNoId|无id=/.test(codeOnly));

console.log('\n═══ 版本 ═══');
const vMeta = (src.match(/@version\s+([\d.]+)/) || [])[1];
const vConst = (src.match(/const VERSION = '([\d.]+)'/) || [])[1];
check('版本 0.1.22 两处一致', vMeta === '0.1.22' && vConst === '0.1.22', `${vMeta}/${vConst}`);
check('头部有 v0.1.22 记录', /v0\.1\.22 变更/.test(src));
check('零 @require', !/^\/\/ @require/m.test(src));
check('GM_download 仍保留（图片靠它）', /@grant\s+GM_download/.test(src));

console.log(`\n${'═'.repeat(46)}`);
console.log(`结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
