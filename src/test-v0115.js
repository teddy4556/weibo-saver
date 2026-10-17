// v0.1.15 回归：下载入口收敛为一个（右下角常驻）
const fs = require('fs');
const P = require('./_target.js').TARGET;
const src = fs.readFileSync(P, 'utf8');
const codeOnly = src.split('\n').filter(l => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}${e ? ' → ' + e : ''}`); } };

console.log('\n═══ 顶部两个入口已彻底移除 ═══');
check('无 wb-tap-label 样式', !/\.wb-tap-label\{/.test(src));
check('无 .wb-tap::after 样式', !/\.wb-tap::after/.test(src));
check('无 injectTapLabel 函数', !/function injectTapLabel/.test(src));
check('无 findCardLink 函数', !/function findCardLink/.test(src));
check('无 looksLikeTimestamp 函数', !/function looksLikeTimestamp/.test(src));
check('无 wbTapLabel 标记', !/wbTapLabel/.test(codeOnly));
check('代码零残留引用', !/wb-tap-label/.test(codeOnly) && !/\.wb-tap['"\s]/.test(codeOnly));
check('TIME_TEXT_RE 也已删', !/TIME_TEXT_RE/.test(codeOnly));
check('全文件无 wb-tap（除注释）', !/wb-tap[-'\s]/.test(codeOnly.replace(/\/\/.*/g, '')));

console.log('\n═══ 右下角按钮常驻 ═══');
check('位置仍是右下', /\.wb-card-dl\{[\s\S]{0,80}?bottom:10px;[\s\S]{0,40}?right:10px/.test(src));
check('不再 opacity:0', /\.wb-card-dl\{[\s\S]{0,400}?opacity:\.(?!0\b)[\d.]+/.test(src));
check('不再 pointer-events:none', /pointer-events:auto/.test(codeOnly.slice(codeOnly.indexOf('.wb-card-dl{'), codeOnly.indexOf('.wb-card-dl{') + 400)));
check('hover 加深', /\.wb-card-dl:hover\{[\s\S]{0,120}?brightness\([\d.]+\)[\s\S]{0,60}?opacity:1/.test(src));
check('已删 hover 才显现的规则', !/\[data-wb-enhanced="1"\]:hover>\.wb-card-dl\{opacity:1;pointer-events:auto\}/.test(src));

console.log('\n═══ 事件委托只接一个 ═══');
check('只查 .wb-card-dl', /e\.target\.closest\('\.wb-card-dl'\)/.test(src));
check('不再查 wb-tap-label', !/closest\('\.wb-tap-label'\)/.test(codeOnly));
check('不再查 .wb-tap', !/closest\('\.wb-tap'\)/.test(codeOnly));
check('重复点击保护', /btn\.dataset\.wbBusy === '1'\) return/.test(src));
check('状态：下载中', /⏳ 下载中/.test(src));
check('状态：完成', /✅ 完成/.test(src));
check('状态：重试', /↻ 重试/.test(src));
check('有 busy/ok/fail 三态', /wb-busy/.test(src) && /wb-ok/.test(src) && /wb-fail/.test(src));

console.log('\n═══ enhanceCards 退化 ═══');
{
    const seg = codeOnly.slice(codeOnly.indexOf('function enhanceCards'), codeOnly.indexOf('function injectCardButtons'));
    check('只打标记', /card\.dataset\.wbEnhanced = '1';/.test(seg));
    check('不再注入标签', !/injectTapLabel\(/.test(seg));
    check('不再挂时间戳 class', !/classList\.add\('wb-tap'\)/.test(seg));
    check('自愈简化为一刀切 continue', /if \(card\.dataset\.wbEnhanced === '1'\) continue;/.test(seg));
    check('仍统计 SKIP', /SKIP\.noId\+\+/.test(seg) && /SKIP\.noMedia\+\+/.test(seg));
}

console.log('\n═══ 按钮注入仍完整 ═══');
check('injectCardButtons 在', /function injectCardButtons/.test(src));
check('自愈逻辑在', /wbDlBtn === '1'[\s\S]{0,200}wbDlBtn = '0'/.test(src));
check('按开关控制显隐', /if \(!cfg\.isCardBtn \|\| cfg\.isBatch\) btn\.style\.display = 'none';/.test(src));
check('带 wb-id 数据', /btn\.dataset\.id = id;/.test(src));
check('带 title 提示', /btn\.title = /.test(src));

console.log('\n═══ 诊断菜单已同步 ═══');
check('统计可见按钮', /buttonsVisible/.test(src));
check('输出改为按钮', /已挂下载按钮（右下角）/.test(src));
check('不再引用已删变量', !/tapLabels/.test(codeOnly) && !/labelsVisible/.test(codeOnly));

console.log('\n═══ 版本 & 老功能 ═══');
const vMeta = (src.match(/@version\s+([\d.]+)/) || [])[1];
const vConst = (src.match(/const VERSION = '([\d.]+)'/) || [])[1];
check('版本号两处一致（动态比对，不写死版本）',
    vMeta === vConst && /^\d+\.\d+\.\d+$/.test(vMeta || ''), `${vMeta}/${vConst}`);
    check('头部有 v0.1.15 历史记录', /v0\.1\.15 变更/.test(src));
check('头部有 v0.1.15 记录', /v0\.1\.15 变更/.test(src));
check('三路识别未坏', /DIAG\.href/.test(src) && /DIAG\.attr/.test(src) && /DIAG\.media/.test(src));
check('单视频修复未坏', /async function topMediaUrlAsync/.test(src));
check('live 命名修复未坏', src.includes("+ `-live.${ext}`"));
check('落盘错峰未坏', /i \+= batchSize/.test(src));
check('命名模板未坏', /const NAME_TPL_DEFAULT = '微博#\{username\}#\{uid\}#\{index\}\.\{ext\}'/.test(src));
check('GM_download 在', /@grant\s+GM_download/.test(src));
check('零 @require', !/^\/\/ @require/m.test(src));

console.log(`\n${'═'.repeat(46)}`);
console.log(`结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
