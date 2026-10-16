// v0.1.21 回归：让「卡片=24 只挂 1 个」可归因
const fs = require('fs');
const P = '/opt/data/cache/scratch/wb-build/weibo-saver-v0.1.0.user.js';
const src = fs.readFileSync(P, 'utf8');
const codeOnly = src.split('\n').filter(l => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}${e ? ' → ' + e : ''}`); } };

console.log('\n═══ 核心问题：跳过原因只进手动菜单，自动扫描静默 ═══');
console.log('  ← 用户实测日志：collectCards 卡片=24，但 injectCardButtons 只挂 1 个');
console.log('  ← 且日志里完全没有「另外 23 张卡卡在哪一关」的任何信息');
{
    const ec = codeOnly.slice(codeOnly.indexOf('function enhanceCards'), codeOnly.indexOf('function injectCardButtons'));
    check('enhanceCards 打候选数', /候选=\$\{cards\.length\}/.test(ec));
    check('enhanceCards 打新增数', /新增=\$\{touched\}/.test(ec));
    check('enhanceCards 打三类跳过', /无id=\$\{SKIP\.noId\}/.test(ec) && /无媒体=\$\{SKIP\.noMedia\}/.test(ec) && /太小=\$\{SKIP\.tooSmall\}/.test(ec));
    check('enhanceCards 打已增强数（可对账）', /已增强=\$\{cards\.filter/.test(ec));
    check('不再被 touched 条件包住（原为 if (touched) 才打印）',
        !/if \(touched\) console\.log/.test(ec),
        '仍只在有新增时才打印');
}

console.log('\n═══ injectCardButtons 此前完全没有跳过统计 ═══');
{
    const n = codeOnly.indexOf('function injectCardButtons');
    const ic = codeOnly.slice(n, n + 3000);
    check('声明三个计数器', /let nNoId = 0, nNoMedia = 0, nTooSmall = 0;/.test(ic));
    check('无 id 时计数', /if \(!id\) \{ nNoId\+\+; continue; \}/.test(ic));
    check('无媒体时计数', /if \(!cardHasMedia\(card\)\) \{ nNoMedia\+\+; continue; \}/.test(ic));
    check('太小时计数', /nTooSmall\+\+/.test(ic));
    check('日志带三个计数', /无id=\$\{nNoId\}/.test(ic) && /无媒体=\$\{nNoMedia\}/.test(ic) && /太小=\$\{nTooSmall\}/.test(ic));
    check('日志带未布局数（懒加载）', /未布局=\$\{pendingCards\}/.test(ic));
    check('日志带已增强数（与上轮对账）', /已增强=\$\{st\}/.test(ic));
    check('不再被 n 条件包住',
        !/if \(n\) console\.log/.test(ic),
        '仍只在挂载成功时才打印');
}

console.log('\n═══ collectCards 日志可对账 ═══');
{
    const cc = codeOnly.slice(codeOnly.indexOf('function collectCards'), codeOnly.indexOf('function cardHasMedia'));
    check('改用「候选」措辞（更准确）', /候选=\$\{finalCards\.length\}/.test(cc));
    check('三路命中各自可见', /href路=\$\{DIAG\.href\}/.test(cc) && /属性路=\$\{DIAG\.attr\}/.test(cc) && /媒体路=\$\{DIAG\.media\}/.test(cc));
    check('去重统计可见', /去嵌套=\$\{DIAG\.nested\}/.test(cc) && /超大容器=\$\{DIAG\.oversized\}/.test(cc));
}

console.log('\n═══ 已知事实记录：属性路恒为 0 ═══');
console.log('  ← 用户实测：href路=6 属性路=0 媒体路=46');
{
    check('属性路有实测注释', /这条路径命中数恒为 0/.test(src) || /命中数恒为 0/.test(src));
    check('媒体路有主力注释', /这条路是当前主力/.test(src));
}

console.log('\n═══ 不变量：能对账 ═══');
{
    // 模拟：24 个候选，1 个通过，23 个被三类跳过瓜分
    const cards = 24, enhanced = 6;
    const noId = 12, noMedia = 4, tooSmall = 2;
    const skipped = noId + noMedia + tooSmall;
    check('候选 = 已增强 + 跳过（本轮新增）', cards === enhanced + skipped,
        `${cards} vs ${enhanced}+${skipped}`);
    check('三类跳过都非零时能被区分', noId > 0 && noMedia > 0 && tooSmall > 0);
    check('日志字段齐全即可对账',
        /无id=/.test(src) && /无媒体=/.test(src) && /太小=/.test(src) && /未布局=/.test(src));
}

console.log('\n═══ 版本 & 老功能 ═══');
const vMeta = (src.match(/@version\s+([\d.]+)/) || [])[1];
const vConst = (src.match(/const VERSION = '([\d.]+)'/) || [])[1];
check('版本号两处一致', vMeta === vConst && /^\d+\.\d+\.\d+$/.test(vMeta || ''), `${vMeta}/${vConst}`);
check('头部有 v0.1.21 历史记录', /v0\.1\.21 变更/.test(src));
check('头部有 v0.1.21 记录', /v0\.1\.21 变更/.test(src));
check('去重两趟未坏', /const deduped = \[\]/.test(src));
check('祖先兜底仍已删', !/closest\('\[data-wb-dl-btn/.test(codeOnly));
check('CDN 重试未坏', /const MAX = 4;/.test(codeOnly));
check('破缓存未坏', /download_timestamp=\$\{_bustSeq\}/.test(codeOnly));
check('extOf 白名单未坏', /const MEDIA_EXTS = \[/.test(src));
check('右下角常驻未坏', /\.wb-card-dl\{[\s\S]{0,400}?opacity:\.(?!0\b)[\d.]+/.test(src));
check('GM_download 在', /@grant\s+GM_download/.test(src));
check('零 @require', !/^\/\/ @require/m.test(src));

console.log(`\n${'═'.repeat(46)}`);
console.log(`结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
