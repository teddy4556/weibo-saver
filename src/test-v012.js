// v0.1.2 回归：落盘链路（GM_download 绕开 Chrome 自动下载闸）
const fs = require('fs');
const P = '/opt/data/cache/scratch/wb-build/weibo-saver-v0.1.0.user.js';
const src = fs.readFileSync(P, 'utf8');

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}${e ? ' → ' + e : ''}`); } };

console.log('\n═══ grant 头 ═══');
check('@grant GM_download 已加', /\/\/ @grant\s+GM_download/.test(src));
check('@grant GM_xmlhttpRequest 保留', /\/\/ @grant\s+GM_xmlhttpRequest/.test(src));

console.log('\n═══ 落盘走 GM_download ═══');
check('saveBlob 优先 GM_download', /if \(typeof GM_download === 'function'\)/.test(src));
check('GM_download 带 url/name', /GM_download\(\{[\s\S]*?url:[\s\S]*?name:/.test(src));
check('有 onload 成功回调', /onload:[\s\S]{0,120}GM_download ✅[\s\S]{0,60}onDone && onDone\(true\)/.test(src));
check('有 onerror 回调', /onerror:\s*\(e\)\s*=>/.test(src));
check('有 ontimeout 回调', /ontimeout:\s*\(\)\s*=>/.test(src));
check('失败自动兜底 a.click', /fallbackSave\(blob, filename, onDone\)/.test(src));
check('兜底函数已定义', /function fallbackSave\(blob, filename, onDone\)/.test(src));
check('兜底释放 blob URL', /revokeObjectURL/.test(src));

console.log('\n═══ 文件名安全（GM_download 扩展名白名单）═══');
check('safeDownloadName 已定义', /function safeDownloadName\(name\)/.test(src));
check('GM_download 用净化名', /name: safeDownloadName\(filename\)/.test(src));
// v0.1.23 起 saveOne 多一个 isVideo 参数（视频强制走原生落盘）
check('saveOne 内部统一净化', /const saveOne = \(blob, name, isVideo\) =>[\s\S]{0,200}safeDownloadName\(name\)/.test(src));
check('所有落盘点都经 saveOne/saveBlob 净化', !/saveBlob\(f\.data, f\.name\)/.test(src));

// safeDownloadName 行为
eval(src.match(/function safeDownloadName\(name\) \{[\s\S]*?\n    \}/)[0]);
const cases = [
    ['张三-2026-10-15-12-30.jpg', '张三-2026-10-15-12-30.jpg'],
    ['张三-2026-10-15 12:30.bin', '张三-2026-10-15 12:30.bin'],
    ['没有扩展名', '没有扩展名.bin'],
    ['标题.', '标题..bin'],
    ['', 'weibo.bin'],
];
cases.forEach(([i, want]) => {
    const got = safeDownloadName(i);
    check(`safeDownloadName(${JSON.stringify(i)}) = ${JSON.stringify(got)}`, got === want, `期望 ${JSON.stringify(want)}`);
});
check('扩展名统一小写', safeDownloadName('a.JPG') === 'a.jpg', safeDownloadName('a.JPG'));
check('中文伪扩展名保留原名 + 补 .bin', safeDownloadName('a.用户-时间') === 'a.用户-时间.bin', safeDownloadName('a.用户-时间'));
check('中文名同样补 .bin', safeDownloadName('a.用户') === 'a.用户.bin', safeDownloadName('a.用户'));

console.log('\n═══ 落盘异步化（不等回调就报完成 = 骗人）═══');
check('有「保存中」中间态', /message: '保存中'/.test(src));
check('await saveOne 等待回调', /await saveOne\(zip/.test(src));
check('落盘按批并发（v0.1.9 起）', /await Promise\.all\([\s\S]{0,200}batch\.map/.test(src));
check('批间让路', /await sleep\(gap\)/.test(src));
check('统计 savedOk', /let savedOk = 0/.test(src));
check('全失败时报错', /savedOk === 0/.test(src));
check('部分失败显示比例', /已存\$\{savedOk\}\/\$\{files\.length\}/.test(src));

console.log('\n═══ m3u8 落盘也走回调 ═══');
check('m3u8 走 saveBlob 并等回调', /saveBlob\(merged,[\s\S]{0,90}, null, resolve\)/.test(src));

console.log('\n═══ 版本号一致 ═══');
const vMeta = (src.match(/@version\s+([\d.]+)/) || [])[1];
const vConst = (src.match(/const VERSION = '([\d.]+)'/) || [])[1];
check('metadata 存在', !!vMeta, vMeta);
check('常量与 metadata 一致', vMeta === vConst, `${vMeta}/${vConst}`);



console.log('\n═══ 静态自检 ═══');
check('零 @require', !/^\/\/ @require/m.test(src));
check('无单引号日志插值', !/console\.(log|warn|error)\('[^']*\$\{/.test(src));
check('无 CSS Module 哈希类名', !/querySelector(All)?\([^)]*_[a-zA-Z0-9]{5,}_/.test(src));
check('TDZ: fallbackUrls 定义早于使用', src.indexOf('const fallbackUrls') < src.indexOf('fallbackUrls.set'));
check('打包仍默认 false', /isPack: false,/.test(src));

console.log(`\n${'═'.repeat(46)}`);
console.log(`结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
