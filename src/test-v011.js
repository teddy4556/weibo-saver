// v0.1.1 回归测试：针对本次两个修复
const fs = require('fs');
const P = '/opt/data/cache/scratch/wb-build/weibo-saver-v0.1.0.user.js';
const src = fs.readFileSync(P, 'utf8');

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
    if (cond) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.log(`  ❌ ${name}${extra ? ' → ' + extra : ''}`); }
};

// 抽依赖
eval(src.match(/function get\(obj, path, def\) \{[\s\S]*?\n    \}/)[0]);
eval(src.match(/function isAvatarImage\(url\) \{[\s\S]*?\n    \}/)[0]);
eval(src.match(/const IMAGE_SIZE_PATTERNS = \[[\s\S]*?function toLargeUrl\(url\) \{[\s\S]*?\n    \}/)[0]);

console.log('\n═══ 修复 1 · mw2000 不得过 toLargeUrl（核心 bug）═══');
const mw2000 = 'https://wx1.sinaimg.cn/mw2000/abc123.jpg';
const large = toLargeUrl(mw2000);
check('toLargeUrl(mw2000) 仍会降级（说明函数本身如此）', large === 'https://wx1.sinaimg.cn/large/abc123.jpg', large);
check('源码里降级分支不再调 toLargeUrl', !/url = toLargeUrl\(mw2000\)/.test(src));
check('mix 分支也不再调 toLargeUrl', !/urlData\[sfx\] = toLargeUrl\(imgUrl\)/.test(src));
check('降级路径直接用 mw2000', /url = mw2000;/.test(src));
// v0.1.3 重构：mix 分支从「三元 + else 分支」改成「let real = imgUrl + 条件覆盖」
check('mix 降级用 imgUrl 兜底', /let real = imgUrl;/.test(src));
check('mix 有超清条件判断', /if \(cfg\.isImageHD && !vipOnly && ext !== 'gif'\)/.test(src));
check('mix 无 pid 时保持 imgUrl', /if \(pid\) \{[\s\S]{0,120}real = hdImageUrl\(pid\);/.test(src));
check('mix 登记降级地址', /fallbackUrls\.set\(real, imgUrl\)/.test(src));

console.log('\n═══ 修复 1b · 超清失败有降级兜底 ═══');
check('有 isHdEndpoint 判定', /function isHdEndpoint\(url\)/.test(src));
check('isHdEndpoint 匹配 ajax 接口', /ajax\/common\/download\?pid=/.test(src));
check('下载层读 fallbackUrls', /fallbackUrls\.get\(url\)/.test(src));
check('空结果时触发降级', /if \(isEmptyResult\(res\)\) \{\s*const fallback = fallbackUrls\.get\(url\)/.test(src));
check('有降级日志', /失败，降级重试/.test(src));

console.log('\n═══ TDZ 检查（const 不 hoisting）═══');
const defLine = src.indexOf('const fallbackUrls = new Map()');
check('定义存在', defLine > 0);
// 不写死字面量：直接比对所有 set/get 的位置
const allRefs = [];
let i = -1;
while ((i = src.indexOf('fallbackUrls.', i + 1)) >= 0) allRefs.push(i);
const allAfterDef = allRefs.every((pos) => pos > defLine);
check(`全部 ${allRefs.length} 处 fallbackUrls 引用都在定义之后`, allAfterDef);
check('有 set 也有 get', /fallbackUrls\.set\(/.test(src) && /fallbackUrls\.get\(/.test(src));

console.log('\n═══ 修复 2 · 打包默认关闭 ═══');
check('defaults.isPack = false', /isPack: false,/.test(src));
check('有配置迁移 stamp', /wb_config_stamp/.test(src));
check('迁移逻辑重置 isPack', /cfg\.isPack = defaults\.isPack;/.test(src));
check('迁移有日志', /配置已迁移到 v\$\{VERSION\}/.test(src));

console.log('\n═══ 版本号三处一致 ═══');
const vMeta = (src.match(/@version\s+([\d.]+)/) || [])[1];
const vConst = (src.match(/const VERSION = '([\d.]+)'/) || [])[1];
check('metadata 与常量一致', vMeta === vConst, `${vMeta} vs ${vConst}`);
check('版本号存在', !!vConst, vConst);

check('头部有变更记录', /v0\.1\.[\d]+ 变更/.test(src));

console.log('\n═══ 落盘分支（isPack=false 时）═══');
check('非打包走错峰批量落盘', /for \(let i = 0; i < files\.length; i \+= batchSize\)/.test(src));
check('落盘仍等真实回调', /await Promise\.all\([\s\S]{0,200}batch\.map/.test(src));
check('打包条件含 isPack', /if \(cfg\.isPack && files\.length > 1\)/.test(src));

console.log('\n═══ 静态自检 ═══');
check('零 @require', !/^\/\/ @require/m.test(src));
check('无单引号日志插值', !/console\.(log|warn|error)\('[^']*\$\{/.test(src));
check('无 CSS Module 哈希类名', !/querySelector(All)?\([^)]*_[a-zA-Z0-9]{5,}_/.test(src));
check('TAG 定义用反引号', /const TAG = `\[WeiboSaver-v\$\{VERSION\}\]`/.test(src));

console.log(`\n${'═'.repeat(46)}`);
console.log(`结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
