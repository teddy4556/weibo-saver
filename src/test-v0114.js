// v0.1.14 回归：修复单视频下载失败
const fs = require('fs');
const P = '/opt/data/cache/scratch/wb-build/weibo-saver-v0.1.0.user.js';
const src = fs.readFileSync(P, 'utf8');
const codeOnly = src.split('\n').filter(l => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}${e ? ' → ' + e : ''}`); } };

// 抽 get + pickVideoByUrlMap 真跑
const TAG = '[T]';
eval(src.match(/function get\(obj, path, def\) \{[\s\S]*?\n    \}/)[0]);
eval(src.match(/function pickVideoByUrlMap\(mediaInfo\) \{[\s\S]*?\n    \}/)[0]);

console.log('\n═══ 核心：顶层视频走 tv 组件接口 ═══');
check('topMediaUrlAsync 已定义', /async function topMediaUrlAsync\(status, pageInfo, mediaInfo, objectType\)/.test(src));
check('顶层视频调 fetchVideoHD', /if \(cfg\.isVideoHD && oid\) \{\s*url = await fetchVideoHD\(oid\);/.test(src));
check('有 oid 才调（没 oid 不空转）', /if \(cfg\.isVideoHD && oid\) \{/.test(src));
check('调用处已加 await', /await topMediaUrl\(status\)/.test(src));
check('collectResources 是 async', /async function collectResources/.test(src));

console.log('\n═══ oid 四级兜底 ═══');
const oidBlock = src.slice(src.indexOf('async function topMediaUrlAsync'), src.indexOf('function pickVideoByUrlMap'));
check('page_info.object_id', /get\(pageInfo, 'object_id'/.test(oidBlock));
check('media_info.object_id', /get\(mediaInfo, 'object_id'/.test(oidBlock));
check('page_info.page_id', /get\(pageInfo, 'page_id'/.test(oidBlock));
check('status.object_id', /get\(status, 'object_id'/.test(oidBlock));
const oidLines = oidBlock.split('\n').filter(l => /get\((pageInfo|mediaInfo|status), '(object_id|page_id)'/.test(l));
check('oid 四级都在同一表达式里', oidLines.length === 4, `${oidLines.length} 处`);
check('用 || 连接（任一命中即可）', /get\(pageInfo, 'object_id'[\s\S]{0,200}\|\|[\s\S]{0,200}\|\|[\s\S]{0,200}\|\|/.test(oidBlock));

console.log('\n═══ 降级链补全（已查证字段）═══');
check('pickBestVideo 仍兜底', /url = pickBestVideo\(mediaInfo\) \|\| pickVideoByUrlMap\(mediaInfo\);/.test(src));
check('认 page_url', /get\(pageInfo, 'page_url'/.test(src));
check('认 download_url', /get\(mediaInfo, 'download_url'/.test(src));
check('认 h5_url', /get\(mediaInfo, 'h5_url'/.test(src));
check('直播认 replay_hd', /get\(mediaInfo, 'replay_hd'/.test(src));
check('直播认 stream_url_hd', /get\(mediaInfo, 'stream_url_hd'/.test(src));

console.log('\n═══ pickVideoByUrlMap 行为（真跑）═══');
{
    // 字符串值
    check('urls 字符串值 → 取最高清键',
        pickVideoByUrlMap({ urls: { sd: 'low.mp4', hd: 'high.mp4' } }) === 'high.mp4',
        pickVideoByUrlMap({ urls: { sd: 'low.mp4', hd: 'high.mp4' } }));
    // 对象值
    check('urls 对象值 → 取 .url',
        pickVideoByUrlMap({ urls: { sd: { url: 'l.mp4' }, mp4_1080p: { url: 'h.mp4' } } }) === 'h.mp4',
        pickVideoByUrlMap({ urls: { sd: { url: 'l.mp4' }, mp4_1080p: { url: 'h.mp4' } } }));
    // 数字键名排序
    check('1280x720 > 640x360',
        pickVideoByUrlMap({ urls: { '640x360': 'a.mp4', '1280x720': 'b.mp4' } }) === 'b.mp4',
        pickVideoByUrlMap({ urls: { '640x360': 'a.mp4', '1280x720': 'b.mp4' } }));
    check('4k 优先于 1080p',
        pickVideoByUrlMap({ urls: { mp4_1080p: 'a.mp4', mp4_4k: 'b.mp4' } }) === 'b.mp4');
    // 边界
    check('无 urls → null', pickVideoByUrlMap({}) === null);
    check('urls 非对象 → null', pickVideoByUrlMap({ urls: 'str' }) === null);
    check('urls 空对象 → null', pickVideoByUrlMap({ urls: {} }) === null);
    check('urls 值全空 → null', pickVideoByUrlMap({ urls: { a: '', b: {} } }) === null);
}

console.log('\n═══ 转发视频 ═══');
check('顶层视频查 retweeted_status', /get\(status, 'retweeted_status\.page_info'/.test(src));

console.log('\n═══ 视频降级兜底 ═══');
check('顶层视频登记 fallbackUrls', /fallbackUrls\.set\(top, fallbackVideo\)/.test(src));
check('fallback 来自 stream_url_hd', /page_info\.media_info\.stream_url_hd/.test(src));
check('下载层不再只对图片降级', !/if \(isEmptyResult\(res\) && isHdEndpoint\(url\)\)/.test(codeOnly));
check('空结果先查降级地址', /if \(isEmptyResult\(res\)\) \{\s*const fallback = fallbackUrls\.get\(url\)/.test(codeOnly));
check('区分视频/图片日志', /isVid \? '高清视频' : '超清图'/.test(src));
check('无降级地址时也报错', /超清接口失败且无降级地址/.test(src));

console.log('\n═══ 诊断日志 ═══');
check('日志含 oid', /oid=\$\{oid \|\| 'none'\}/.test(src));
check('日志含 tv 接口命中情况', /tv接口=/.test(src));
check('pickVideoByUrlMap 命中时打日志', /pickVideoByUrlMap: 键=/.test(src));

console.log('\n═══ 版本 & 老功能 ═══');
const vMeta = (src.match(/@version\s+([\d.]+)/) || [])[1];
const vConst = (src.match(/const VERSION = '([\d.]+)'/) || [])[1];
check('版本 0.1.14 两处一致', vMeta === '0.1.14' && vConst === '0.1.14', `${vMeta}/${vConst}`);
check('头部有 v0.1.14 记录', /v0\.1\.14 变更/.test(src));
check('下载标签机制未坏', /function injectTapLabel/.test(src));
check('三路识别未坏', /DIAG\.href/.test(src) && /DIAG\.attr/.test(src) && /DIAG\.media/.test(src));
check('live 命名修复未坏', src.includes("+ `-live.${ext}`"));
check('落盘错峰未坏', /i \+= batchSize/.test(src));
check('m3u8 解析未坏', /function parseM3u8/.test(src));
check('GM_download 在', /@grant\s+GM_download/.test(src));
check('零 @require', !/^\/\/ @require/m.test(src));

console.log(`\n${'═'.repeat(46)}`);
console.log(`结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
