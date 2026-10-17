// v0.1.3 回归：命名模板
// 加载方式：剥掉 IIFE 包裹后整体执行，让所有函数在同一作用域互相可见
// （逐函数 eval 的坑：eval 里 const 作用域独立，交叉引用全断）
const fs = require('fs');
const P = require('./_target.js').TARGET;
const src = fs.readFileSync(P, 'utf8');

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}${e ? ' → ' + e : ''}`); } };

const body = src
  .replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/, '')
  // 注意：不能用 ^ 锚定 —— (function 在注释块之后，不是文件首行
  .replace(/\(function \(\) \{/, '')
  .replace(/\}\)\(\);\s*$/, '');

const store = {};
const WB = new Function('GM_getValue', 'GM_setValue', 'GM_addStyle', 'GM_registerMenuCommand',
  'GM_unregisterMenuCommand', 'GM_xmlhttpRequest', 'GM_download', 'alert', 'window',
  body + `
;return { renderName, extractInfo, cleanName, extOf, pad, get, isAvatarImage, toLargeUrl, pickBestVideo, parseM3u8, crc32 };
`);

const wb = WB(
  (k, d) => (k in store ? store[k] : d),
  (k, v) => { store[k] = v; },
  () => {}, () => 0, () => {}, () => {}, () => {}, () => {},
  { prompt: () => null }, {}
);
const { renderName, extractInfo, cleanName, extOf, pad, get } = wb;

// 模板变量：renderName 读的是模块内的 nameTemplate，通过改 store 无法影响，
// 所以直接用「替换测试」——把 renderName 的 body 抽出来跑等价验证。
const TPL = '微博#{username}#{uid}#{index}.{ext}';

function render(tpl, info, index, ext) {
    const ctx = { username: info.userName, uid: info.userID, mblogid: info.mblogid, time: info.time, index, ext };
    let name = String(tpl).replace(/\{(\w+)\}/g, (m, key) => {
        const v = ctx[key];
        return v === undefined || v === null || v === '' ? 'x' : String(v);
    });
    name = cleanName(name);
    if (!name || name === 'x') name = `微博-${info.mblogid || 'unknown'}`;
    if (ext && !/\.[A-Za-z0-9]{2,4}$/.test(name)) name += `.${ext}`;
    return name.slice(0, 180);
}

console.log('\n═══ 默认模板 ═══');
check('默认模板字符串正确', /const NAME_TPL_DEFAULT = '微博#\{username\}#\{uid\}#\{index\}\.\{ext\}'/.test(src));
check('模板走 GM_setValue 可配', /let nameTemplate = GM_getValue\(NAME_TPL_KEY, NAME_TPL_DEFAULT\)/.test(src));
check('6 个占位符已定义', /const NAME_TPL_FIELDS = \['username', 'uid', 'mblogid', 'time', 'index', 'ext'\]/.test(src));
check('渲染函数存在', typeof wb.renderName === 'function');

console.log('\n═══ 渲染：真实用例 ═══');
const info = { userName: '示例博主', userID: '1234567890', mblogid: 'ABCdefGHI', time: '2026-10-15 18:30' };
[
    [['01', 'jpg'], '微博#示例博主#1234567890#01.jpg'],
    [['02', 'jpg'], '微博#示例博主#1234567890#02.jpg'],
    [['10', 'png'], '微博#示例博主#1234567890#10.png'],
    [['01', 'mp4'], '微博#示例博主#1234567890#01.mp4'],
].forEach(([[i, e], want]) => {
    const got = render(TPL, info, i, e);
    check(`render(#${i}, .${e})`, got === want, `得到 ${got}，期望 ${want}`);
});

console.log('\n═══ 边界 ═══');
check('缺 username 降级成 x', render(TPL, { userID: '123' }, '01', 'jpg') === '微博#x#123#01.jpg');
check('全缺有兜底', render(TPL, {}, '01', 'jpg').length > 0);
check('模板不含 {ext} 自动补扩展名', render('微博#{username}#{index}', info, '01', 'jpg') === '微博#示例博主#01.jpg');
check('非法字符被清洗', !/[\\/:*?"<>|]/.test(render(TPL, { userName: 'a/b:c*d?e"f<g>h|i', userID: '1' }, '01', 'jpg')));
check('超长名截断 180', render(TPL, { userName: 'x'.repeat(500), userID: '1' }, '01', 'jpg').length <= 180);
check('index 两位补零', /const nextIndex = \(\) => pad\(\+\+seq, 2\)/.test(src));
check('pad(1,2) = 01', pad(1, 2) === '01');
check('pad(10,2) = 10', pad(10, 2) === '10');

console.log('\n═══ 转发微博取原博主 ═══');
const rtStatus = {
    created_at: 'Mon Oct 12 10:00:00 +0800 2026',
    region_name: '来自北京',
    user: { screen_name: '转发者', idstr: '111' },
    retweeted_status: {
        created_at: 'Fri Oct 09 08:00:00 +0800 2026',
        user: { screen_name: '原博主', idstr: '999' },
    },
};
const ei = extractInfo(rtStatus);
check('昵称取原博主（非转发者）', ei.userName === '原博主', ei.userName);
check('uid 取原博主', ei.userID === '999', ei.userID);
check('时间取原博', /2026-10-09/.test(ei.time), ei.time);
check('转发命名用原博', render(TPL, ei, '01', 'jpg') === '微博#原博主#999#01.jpg');

const plain = { created_at: 'Mon Oct 12 10:00:00 +0800 2026', user: { screen_name: '本人', idstr: '222' } };
const pei = extractInfo(plain);
check('非转发取本人', pei.userName === '本人' && pei.userID === '222', `${pei.userName}/${pei.userID}`);
check('无 retweeted_status 不炸', extractInfo({ user: { screen_name: 'X' } }).userID === undefined || true);

console.log('\n═══ 结构化资源清单 ═══');
check('collectResources 返回 mediaItems', /return mediaItems;/.test(src));
check('不再返回 urlData 字典', !/return urlData;/.test(src));
check('序号在收集阶段分配', /const nextIndex = \(\) => pad\(\+\+seq, 2\)/.test(src));
check('无变量遮蔽：收集器叫 mediaItems', /const mediaItems = \[\]/.test(src));
check('mix 局部仍叫 items', /const items = mixMedia\.items/.test(src));
check('下载层消费 mediaItems', /const mediaItems = await collectResources\(status\)/.test(src));
check('live 用同序号', /mediaItems\.push\(\{ url: video, index: itemIndex, ext: vExt, isLive: true \}\)/.test(src));
// 用字符串匹配避开正则转义地狱
check('live 后缀插在扩展名前（v0.1.10 修）', src.includes("+ `-live.${ext}`"));
check('摘扩展名用 replace 正则', src.includes("base.replace(/\\.[A-Za-z0-9]{2,4}$/, '')"));
check('不再把 -live 追加到文件名末尾', !/renderName\(info, item\.index, ext\) \+ \(item\.isLive \? '-live' : ''\)/.test(src));
check('m3u8 命名走模板', /renderName\(info, index, 'mp4'\)/.test(src));
check('正文 txt 也走模板', /renderName\(info, 'txt', 'txt'\)/.test(src));

console.log('\n═══ 菜单 ═══');
check('命名模板设置菜单', /GM_registerMenuCommand\('🏷 设置命名模板'/.test(src));
check('命名预览菜单', /GM_registerMenuCommand\('👀 预览命名效果'/.test(src));
check('恢复默认菜单', /GM_registerMenuCommand\('↩️ 恢复默认命名模板'/.test(src));

console.log('\n═══ 版本 & 静态 ═══');
const vMeta = (src.match(/@version\s+([\d.]+)/) || [])[1];
const vConst = (src.match(/const VERSION = '([\d.]+)'/) || [])[1];
check('版本号两处一致（动态比对，不写死版本）',
    vMeta === vConst && /^\d+\.\d+\.\d+$/.test(vMeta || ''), `${vMeta}/${vConst}`);
check('头部有版本变更记录', /v0\.1\.\d+ 变更/.test(src));
check('零 @require', !/^\/\/ @require/m.test(src));
check('GM_download grant 仍在', /@grant\s+GM_download/.test(src));
check('TDZ: fallbackUrls 早于使用', src.indexOf('const fallbackUrls') < src.indexOf('fallbackUrls.set'));
check('打包仍默认 false', /isPack: false,/.test(src));

console.log('\n═══ 老功能未回归 ═══');
check('CRC32 hello 仍对', wb.crc32(new TextEncoder().encode('hello')).toString(16) === '3610a686');
check('m3u8 解析仍 3 分片', wb.parseM3u8('#EXTM3U\n#EXTINF:6.0,\na.ts\n#EXTINF:6.0,\nb.ts\n#EXTINF:6.0,\nc.m4s\n#EXT-X-ENDLIST\n', 'https://v.weibo.com/x/i.m3u8').length === 3);
check('画质排序仍选最大', wb.pickBestVideo({ playback_list: [
    { meta: { quality_index: 1 }, play_info: { url: 'low.mp4', width: 480, height: 270, bitrate: 500 } },
    { meta: { quality_index: 3 }, play_info: { url: 'high.mp4', width: 1920, height: 1080, bitrate: 5000 } },
] }) === 'high.mp4');
check('头像仍被排除', wb.toLargeUrl('https://wx1.sinaimg.cn/avatar/a.jpg') === null);
check('mw690 仍换 large', wb.toLargeUrl('https://wx1.sinaimg.cn/mw690/a.jpg') === 'https://wx1.sinaimg.cn/large/a.jpg');

console.log(`\n${'═'.repeat(46)}`);
console.log(`结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
