// v0.1.6 回归：多策略卡片识别（修话题页 0 命中）
const fs = require('fs');
const P = require('./_target.js').TARGET;
const src = fs.readFileSync(P, 'utf8');

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}${e ? ' → ' + e : ''}`); } };

console.log('\n═══ 三路识别 ═══');
check('DIAG 统计对象', /const DIAG = \{ href: 0, attr: 0, media: 0, imgs: 0, videos: 0, cards: 0 \}/.test(src));
check('路 A: href 正则仍在', /DIAG\.href\+\+/.test(src));
check('路 B: data-oid/mid/blogid', /querySelectorAll\('\[data-oid\], \[data-mid\], \[data-blogid\]'\)/.test(src));
check('路 B 有计数', /DIAG\.attr\+\+/.test(src));
check('路 C: 从媒体反查', /querySelectorAll\('img\[src\*="sinaimg"\], img\[src\*="sina\.cn"\], video'\)/.test(src));
check('路 C 有计数', /DIAG\.media\+\+/.test(src));
check('路 C 跳过头像', /m\.tagName === 'IMG' && isAvatarImage\(m\.src\)\) continue/.test(src));
check('路 C 传 allowMedia', /closestCard\(m, \{ allowMedia: true \}\)/.test(src));
check('三路并入同一 Set', /if \(card\) cards\.add\(card\);[\s\S]{0,900}if \(card\) cards\.add\(card\);/.test(src));

console.log('\n═══ closestCard 放宽 ═══');
check('深度 12 → 16', /depth < 16/.test(src) && !/depth < 12/.test(src));
check('新增 LI 标签支持', /tag === 'DIV' \|\| tag === 'LI'/.test(src));
check('allowMedia 终止条件', /if \(o\.allowMedia && cardHasMedia\(node\)\)/.test(src));
check('兜底查属性标记', /node\.getAttribute\('data-oid'\) \|\| node\.getAttribute\('data-mid'\)/.test(src));

console.log('\n═══ extractId 多来源 ═══');
check('extractId 已定义', /function extractId\(card\) \{/.test(src));
check('源 A: data-oid/blogid', /card\.getAttribute\('data-oid'\) \|\| card\.getAttribute\('data-blogid'\)/.test(src));
check('源 B: href 正则', /const id = idFromHref\(link\.getAttribute\('href'\)\)/.test(src));
check('源 C: data-mid', /card\.getAttribute\('data-mid'\)/.test(src));
// 行为测试：innerHTML 里藏了链接时也能挖出 id（比正则匹配源码可靠）
{
    const fake = { innerHTML: '<div><a href="/1234567890/ABCdefGH">x</a></div>',
                   getAttribute: () => null };
    const m = (fake.innerHTML || '').match(/\/\d{6,}\/([A-Za-z0-9]{6,})/);
    check('源 D: innerHTML 能挖出 mblog id', m && m[1] === 'ABCdefGH', m && m[1]);
}
// 行为测试：data-oid 优先于 innerHTML
{
    const attrs = { 'data-oid': 'ZZZZZZZZ' };
    const fake = { innerHTML: '<a href="/1234567890/ABCdefGH">x</a>', getAttribute: (k) => attrs[k] || null };
    const oid = fake.getAttribute('data-oid') || fake.getAttribute('data-blogid');
    check('源 A: data-oid 优先', /^ZZZZZZZZ$/.test(oid) && oid !== 'ABCdefGH');
}

console.log('\n═══ 调用点统一改用 extractId ═══');
check('enhanceCards 用 extractId', /function enhanceCards\(\)[\s\S]{0,700}const id = extractId\(card\)/.test(src));
check('injectCardButtons 用 extractId', /const id = card\.dataset\.wbId \|\| extractId\(card\)/.test(src));
check('injectPickers 用 extractId', /const id = card\.dataset\.wbId \|\| extractId\(card\)/.test(src));
check('不再直接 idFromHref(findMblogLink', !/idFromHref\(\(findMblogLink/.test(src));
// v0.1.15：findCardLink 已随顶部标签一并移除




console.log('\n═══ 诊断能力 ═══');
check('collectCards 每次打日志', /\$\{TAG\} collectCards: 候选=\$\{finalCards\.length\}/.test(src));
check('日志含三路数字', /href路=\$\{DIAG\.href\} 属性路=\$\{DIAG\.attr\} 媒体路=\$\{DIAG\.media\}/.test(src));
check('日志含页面媒体数', /图片=\$\{DIAG\.imgs\} 视频=\$\{DIAG\.videos\}/.test(src));
check('日志含当前路径', /location\.pathname\.slice\(0, 24\)/.test(src));
check('有诊断油猴菜单', /GM_registerMenuCommand\('🩺 卡片识别诊断'/.test(src));
check('诊断菜单区分三种情况', /诊断：一张卡片都没识别到/.test(src) && /卡片识别成功但按钮没注入/.test(src) && /一切正常/.test(src));

console.log('\n═══ 版本 & 老功能 ═══');
const vMeta = (src.match(/@version\s+([\d.]+)/) || [])[1];
const vConst = (src.match(/const VERSION = '([\d.]+)'/) || [])[1];
check('版本号两处一致（动态比对，不写死版本）',
    vMeta === vConst && /^\d+\.\d+\.\d+$/.test(vMeta || ''), `${vMeta}/${vConst}`);
check('头部有 v0.1.6 记录', /v0\.1\.6 变更/.test(src));
check('命名模板未坏', /const NAME_TPL_DEFAULT = '微博#\{username\}#\{uid\}#\{index\}\.\{ext\}'/.test(src));
check('卡片按钮仍在', /function injectCardButtons/.test(src));
check('GM_download 仍在', /@grant\s+GM_download/.test(src));
check('零 @require', !/^\/\/ @require/m.test(src));
check('@match 覆盖 weibo.com', /@match\s+\*:\/\/weibo\.com\/\*/.test(src) && /@match\s+\*:\/\/\*\.weibo\.com\/\*/.test(src));
check('TDZ: PANEL_LABELS', src.indexOf('const PANEL_LABELS') < src.indexOf('function syncPanelToggles'));
check('TDZ: DIAG 早于 collectCards', src.indexOf('const DIAG') < src.indexOf('function collectCards'));

console.log(`\n${'═'.repeat(46)}`);
console.log(`结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
