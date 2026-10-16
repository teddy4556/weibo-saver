// v0.1.23 回归：撤销 v0.1.22 的「视频直连」（跨域 a[download] 会导航走人）
const fs = require('fs');
const P = '/opt/data/cache/scratch/wb-build/weibo-saver-v0.1.0.user.js';
const src = fs.readFileSync(P, 'utf8');
const codeOnly = src.split('\n').filter(l => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}${e ? ' → ' + e : ''}`); } };

console.log('\n═══ 根因：<a download> 只对同源 URL 生效 ═══');
console.log('  ← 用户实测反馈：「其他脚本下载视频不会跳出新链接」');
console.log('  ← v0.1.22 让 <a href="f.video.weibocdn.com/..." download> 直接导航 → 页面被跳走');
{
    // 代码里不能再有「把跨域视频 URL 直接交给 a[download]」的路径
    check('saveDirect 函数已删除', !/function saveDirect\(/.test(codeOnly));
    check('不再有 saveDirect 调用', !/return saveDirect\(/.test(codeOnly));
    check('不再有 item.isTop 直连分支',
        !/item\.isTop && !cfg\.isFetchVideoViaBlob/.test(codeOnly));
    check('撤销原因写进头部注释', /<a download> 属性\*?\*?只对同源 URL 生效/.test(src) || /只对同源 URL 生效/.test(src));
    check('说明参考脚本为何不跳', /blob: 是同源/.test(src) || /createObjectURL\(blob\) —— blob: 是同源/.test(src));
}

console.log('\n═══ 正确链路：视频仍走 blob，只是落盘改原生 ═══');
{
    // v0.1.24：视频改走 GM_download 直落（绕过 blob），
    // 但「视频 URL 跨域所以不能交给 <a download>」这个判断依然有效。
    // v0.1.25：判定改成 `=== false`（v0.1.24 的 `!cfg.x` 在 undefined 时不可靠）
    check('视频有直落分支', /if \(item\.isTop && cfg\.isVideoViaBlob === false\)/.test(codeOnly));
    check('blob 路径仍在（可回退对照）', /let res = await fetchBlob\(url, \{ verbose:/.test(codeOnly));
    check('isBigBlob 支持 forceNative', /function isBigBlob\(blob, forceNative\)/.test(codeOnly));
    check('forceNative 无条件走原生',
        /if \(forceNative\) return true;/.test(codeOnly));
    check('saveBlob 接受 forceNative',
        /function saveBlob\(blob, filename, onProgress, onDone, forceNative\)/.test(codeOnly));
    {
        const i = codeOnly.indexOf('function saveBlob(');
        const seg = codeOnly.slice(i, i + 900);
        check('forceNative 时走 fallbackSave',
            /if \(isBigBlob\(blob, forceNative\)\)/.test(seg)
            && /fallbackSave\(blob, filename, onDone\)/.test(seg)
            && /fallbackSave\(blob, filename, onDone\);\s*\n\s*return;/.test(seg));
    }
    check('视频不打体积判断（无条件原生）',
        /forceNative\s*\?\s*`\$\{TAG\} 落盘：视频走原生/.test(codeOnly));
}

console.log('\n═══ files 携带类型标记，流到落盘 ═══');
{
    check('files.push 带 isVideo', /files\.push\(\{ name, data: blob, isVideo: !!item\.isTop \}\)/.test(codeOnly));
    check('批量落盘传 forceNative',
        /saveBlob\(f\.data, safeDownloadName\(f\.name\), null, \(ok\) => \{[\s\S]{0,120}?\}, !!f\.isVideo\)/.test(codeOnly));
    check('saveOne 也支持 isVideo',
        /const saveOne = \(blob, name, isVideo\) =>/.test(codeOnly));
    check('图片不受影响（不传 isVideo → undefined → false）',
        /!!f\.isVideo/.test(codeOnly));
}

console.log('\n═══ 延迟清理仍保留（v0.1.22 修对了的部分要留住）═══');
{
    const i0 = src.indexOf('function fallbackSave');
    const fs2 = src.slice(i0, i0 + 2600);
    const lines = fs2.split('\n');
    const clickLine = lines.findIndex(l => l.trim().startsWith('a.click()'));
    const nextLine = clickLine >= 0 ? (lines[clickLine + 1] || '').trim() : '';
    check('click() 下一行不是裸 a.remove()', clickLine >= 0 && !/^a\.remove\(\);?$/.test(nextLine));
    check('下一行是注释（清理已挪进 setTimeout）', clickLine >= 0 && nextLine.startsWith('//'));
    check('清理延迟 2000ms（a.remove 不能紧跟 click）', /\}, 2000\);/.test(src));
    check('blob URL 不再写死 60s 释放（v0.1.30 改确认式）',
    !/revokeObjectURL\(url\)\s*,\s*60000\s*\)/.test(fs2), '写死的 60s 释放还在');
check('改用探流确认后再释放', /fetch\(url, \{ method: 'GET' \}\)/.test(fs2) && /blob 已关联/.test(fs2));
}

console.log('\n═══ 开关菜单文案要改（不再有「直连」选项）═══');
{
    check('菜单里不再出现「直连」', !/直连（推荐）/.test(src));
    check('菜单提到视频走原生', /视频走原生/.test(src));
    check('失效的 videoBlob 开关已彻底移除', !/videoBlob/.test(src));
    check('换成视频封面开关', /vidCover: 'wb_video_cover'/.test(src) && /视频封面/.test(src));
}

console.log('\n═══ 图片链路未动 ═══');
{
    check('GM_download 分支仍在', /if \(typeof GM_download === 'function'\) \{/.test(codeOnly));
    check('图片默认不 forceNative', /isBigBlob\(blob, forceNative\)/.test(codeOnly));
    check('体积阈值常量仍在（图片大文件兜底）', /const BIG_FILE_BYTES = 2 \* 1024 \* 1024;/.test(codeOnly));
    check('GM_download 失败仍兜底 a.click', /GM_download ❌/.test(codeOnly));
}

console.log('\n═══ 版本 ═══');
const vMeta = (src.match(/@version\s+([\d.]+)/) || [])[1];
const vConst = (src.match(/const VERSION = '([\d.]+)'/) || [])[1];
check('版本号两处一致', vMeta === vConst && /^\d+\.\d+\.\d+$/.test(vMeta || ''), `${vMeta}/${vConst}`);
check('头部有 v0.1.23 历史记录', /v0\.1\.23/.test(src));
check('头部有 v0.1.23 记录', /v0\.1\.23 变更/.test(src));
check('CDN 破缓存重试未坏', /const MAX = 4;/.test(codeOnly));
check('extOf 白名单未坏', /const MEDIA_EXTS = \[/.test(src));
check('两趟去重未坏', /const deduped = \[\]/.test(src));
check('右下角常驻未坏', /\.wb-card-dl\{[\s\S]{0,400}?opacity:\.(?!0\b)[\d.]+/.test(src));
check('零 @require', !/^\/\/ @require/m.test(src));

console.log(`\n${'═'.repeat(46)}`);
console.log(`结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
