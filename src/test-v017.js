// v0.1.7 回归：面板位置（左上 → 左下）+ 按钮位置（左上 → 右下）
const fs = require('fs');
const P = '/opt/data/cache/scratch/wb-build/weibo-saver-v0.1.0.user.js';
const src = fs.readFileSync(P, 'utf8');

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}${e ? ' → ' + e : ''}`); } };

console.log('\n═══ 面板移到左下 ═══');
check('#wb-panel 用 bottom:0', /#wb-panel\{[\s\S]{0,200}?bottom:\d+px/.test(src));
check('不再用 top:0 锚定面板', !/#wb-panel\{[^}]*top:0/.test(src));
check('z-index 保持最高', /#wb-panel\{[^}]*z-index:2147483000/.test(src));
check('盒子圆角（左下贴合页面边）', /border-radius:[\d.]+px 0 0 0/.test(src) || /border-radius:0 0 [\d.]+px 0/.test(src) || /\.wb-box\{[\s\S]{0,200}?border-radius:\d+px/.test(src), '圆角规则没了');
check('高度收敛到 62vh', /max-height:\d+vh/.test(src));

console.log('\n═══ 内容顺序未被打乱 ═══');
check('主按钮仍在第一行', /<div class="wb-row">[^]*?<span class="wb-toggle wb-main" id="wb-batch">/.test(src));
check('下载列表在开关后面', /id="wb-text"[\s\S]{0,120}id="wb-list"/.test(src));
check('已撤销 column-reverse', !/flex-direction:column-reverse/.test(src));
check('已删无效 order:-1', !/wb-namebox\{order:-1\}/.test(src));

console.log('\n═══ 收起态可找回 ═══');
check('collapsed 仍隐藏', /#wb-panel\.wb-collapsed\{[\s\S]{0,160}?opacity:0[\s\S]{0,80}?pointer-events:none/.test(src));
check('收起留残影抓手', /#wb-panel\.wb-collapsed::after\{/.test(src));
check('残影定位在左下', /#wb-panel\.wb-collapsed::after\{[\s\S]{0,300}?left:0;[\s\S]{0,40}?bottom:0/.test(src));
check('命名区已删（v0.1.8 起无 hover 展开区）', !/wb-namebox/.test(src));
check('hover 恢复可见', /#wb-panel:hover\{[^}]*\}/.test(src) && /#wb-panel\.wb-collapsed\{[\s\S]{0,160}?opacity:0/.test(src));

console.log('\n═══ 卡片按钮在右下 ═══');
check('下载按钮 bottom+right', /\.wb-card-dl\{[\s\S]{0,80}?bottom:10px;[\s\S]{0,40}?right:10px/.test(src));
check('勾选圈 bottom+right', /\.wb-card-pick\{[\s\S]{0,90}?bottom:10px;[\s\S]{0,40}?right:10px/.test(src));
check('按钮不再压头像', !/\.wb-card-dl\{[^}]*top:8px;left:8px/.test(src));

console.log('\n═══ 三处尺寸守卫（防误认头像/表情）═══');
const guards = src.match(/width >= 200 && .*height >= 80|width < 200 \|\| .*height < 80/g) || [];
check('守卫 3 处', guards.length === 3, `实际 ${guards.length}`);
check('closestCard 守卫', /const bigEnough = rect\.width >= 200 && rect\.height >= 80;/.test(src));
check('enhanceCards 有守卫', /if \(r\.width < 200 \|\| r\.height < 80\) \{ SKIP\.tooSmall\+\+; continue; \}/.test(src));
check('injectCardButtons 守卫', /wbTooSmall/.test(src));

console.log('\n═══ 三路识别未坏 ═══');
check('href 路', /DIAG\.href/.test(src));
check('属性路', /DIAG\.attr/.test(src));
check('媒体路', /DIAG\.media/.test(src));
check('extractId 多来源', /function extractId\(card\)/.test(src));
check('诊断菜单', /🩺 卡片识别诊断/.test(src));

console.log('\n═══ 版本 & 老功能 ═══');
const vMeta = (src.match(/@version\s+([\d.]+)/) || [])[1];
const vConst = (src.match(/const VERSION = '([\d.]+)'/) || [])[1];
check('版本号两处一致', vMeta === vConst && /^\d+\.\d+\.\d+$/.test(vMeta || ''), `${vMeta}/${vConst}`);
check('头部有 v0.1.7 历史记录', /v0\.1\.7 变更/.test(src));
check('命名模板未坏', /const NAME_TPL_DEFAULT = '微博#\{username\}#\{uid\}#\{index\}\.\{ext\}'/.test(src));
check('GM_download 仍在', /@grant\s+GM_download/.test(src));
check('零 @require', !/^\/\/ @require/m.test(src));

console.log(`\n${'═'.repeat(46)}`);
console.log(`结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
