// v0.1.5 回归：卡片级下载按钮
const fs = require('fs');
const P = require('./_target.js').TARGET;
const src = fs.readFileSync(P, 'utf8');

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}${e ? ' → ' + e : ''}`); } };

console.log('\n═══ 按钮注入 ═══');
check('injectCardButtons 已定义', /function injectCardButtons\(\)/.test(src));
check('flush 里挂载', /function flush\(\) \{[\s\S]{0,200}enhanceCards\(\);\s*injectCardButtons\(\);/.test(src));
check('用 createElement 造 button', /document\.createElement\('button'\)/.test(src));
check('class 用 wb-card-dl', /btn\.className = 'wb-card-dl'/.test(src));
check('有 type=button 防表单提交', /btn\.type = 'button'/.test(src));
check('有 aria-label（无障碍）', /btn\.setAttribute\('aria-label'/.test(src));
check('幂等标记 wbDlBtn', /card\.dataset\.wbDlBtn = '1'/.test(src));
check('纯文字微博不挂', /if \(!cardHasMedia\(card\)\) \{ nNoMedia\+\+; continue; \}/.test(src));

console.log('\n═══ 点击行为 ═══');
check('阻止冒泡（不触发原生）', /e\.stopPropagation\(\);[\s\S]{0,40}e\.preventDefault\(\);/.test(src));
check('重复点击保护', /btn\.dataset\.wbBusy === '1'\) return/.test(src));
check('调 downloadWeibo(id)', /downloadWeibo\(id\)\.then\(\(ok\)/.test(src));
check('状态：下载中', /⏳ 下载中/.test(src));
check('状态：完成', /✅ 完成/.test(src));
check('状态：重试', /↻ 重试/.test(src));
check('有 busy/ok/fail 三态样式类', /wb-busy/.test(src) && /wb-ok/.test(src) && /wb-fail/.test(src));
// v0.1.15：顶部标签机制已整体移除，只剩右下角一个入口，无「同步另一入口」逻辑
check('事件委托只接右下角按钮', /closest\('\.wb-card-dl'\)/.test(src));

console.log('\n═══ 位置与避让 ═══');
// v0.1.7 起两者都在右下（批量模式靠 display 互斥，不再需要分居）
check('下载按钮有绝对定位', /\.wb-card-dl\{[\s\S]{0,60}?position:absolute;/.test(src));
    check('勾选圈有绝对定位', /\.wb-card-pick\{[\s\S]{0,60}?position:absolute;/.test(src));
check('卡片 position 被强制 relative', /pos === 'static'\) card\.style\.position = 'relative'/.test(src));
check('z-index: 按钮 < 勾选圈', /wb-card-dl\{[^}]*z-index:12/.test(src) && /wb-card-pick\{[^}]*z-index:14/.test(src));
check('卡片 position 被强制 relative', /pos === 'static'\) card\.style\.position = 'relative'/.test(src));

console.log('\n═══ hover 显现 ═══');
check('常驻半透明 + 可点', /\.wb-card-dl\{[\s\S]{0,500}?pointer-events:auto/.test(src));
check('hover 加深（不再靠它显现）', /\.wb-card-dl:hover\{[\s\S]{0,120}?brightness\([\d.]+\)[\s\S]{0,60}?opacity:1/.test(src));
check('卡片打 data-wb-enhanced 供 CSS 用', /card\.dataset\.wbEnhanced = '1';/.test(src));
check('完成态常显（不 hover 也能看到）', /\.wb-card-dl\.wb-ok:hover\{filter:none;opacity:1\}/.test(src));

console.log('\n═══ 与批量模式互斥 ═══');
check('进批量 → 藏按钮（v0.1.11 走统一函数）',
    /批量模式下隐藏单条下载按钮[\s\S]{0,200}applyCardBtnVisibility\(cfg\.isCardBtn\)/.test(src));
check('退批量 → 恢复按钮（v0.1.11 走统一函数）',
    /退出批量：恢复单条下载按钮[\s\S]{0,400}applyCardBtnVisibility\(cfg\.isCardBtn\)/.test(src));
check('统一函数处理 isBatch 优先级', /on && !cfg\.isBatch/.test(src));
check('applyCardBtnVisibility 存在', /function applyCardBtnVisibility\(on\)/.test(src));
check('批量优先于开关', /on && !cfg\.isBatch/.test(src));

console.log('\n═══ 开关 ═══');
check('cfg key 存在', /isCardBtn: 'wb_card_btn'/.test(src));
check('默认开', /isCardBtn: true,/.test(src));
check('注入前检查开关', /function injectCardButtons\(\) \{\s*if \(!cfg\.isCardBtn\) return;/.test(src));
check('面板有按钮', /id="wb-cardbtn"/.test(src));
check('PANEL_LABELS 已登记', /'#wb-cardbtn': \{ key: 'isCardBtn'/.test(src));
check('面板点击联动显隐', /if \(sel === '#wb-cardbtn'\) applyCardBtnVisibility/.test(src));
check('油猴菜单可切', /label: '卡片级下载按钮（hover 显示）'/.test(src));

console.log('\n═══ 版本 & 老功能 ═══');
const vMeta = (src.match(/@version\s+([\d.]+)/) || [])[1];
const vConst = (src.match(/const VERSION = '([\d.]+)'/) || [])[1];
check('版本号两处一致（动态比对，不写死版本）',
    vMeta === vConst && /^\d+\.\d+\.\d+$/.test(vMeta || ''), `${vMeta}/${vConst}`);
check('头部有 v0.1.5 历史记录', /v0\.1\.5 变更/.test(src));
check('命名模板未坏', /const NAME_TPL_DEFAULT = '微博#\{username\}#\{uid\}#\{index\}\.\{ext\}'/.test(src));
// v0.1.15：时间戳入口已移除
check('GM_download 仍在', /@grant\s+GM_download/.test(src));
check('零 @require', !/^\/\/ @require/m.test(src));
check('TDZ: PANEL_LABELS 早于 syncPanelToggles', src.indexOf('const PANEL_LABELS') < src.indexOf('function syncPanelToggles'));
check('TDZ: fallbackUrls 早于使用', src.indexOf('const fallbackUrls') < src.indexOf('fallbackUrls.set'));

console.log(`\n${'═'.repeat(46)}`);
console.log(`结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
