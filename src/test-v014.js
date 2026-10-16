// v0.1.4 回归：批量下载常驻入口
const fs = require('fs');
const P = '/opt/data/cache/scratch/wb-build/weibo-saver-v0.1.0.user.js';
const src = fs.readFileSync(P, 'utf8');

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}${e ? ' → ' + e : ''}`); } };

console.log('\n═══ 批量按钮常驻面板 ═══');
check('批量按钮在第一行', /<div class="wb-row">[^]*?<span class="wb-toggle wb-main" id="wb-batch">/.test(src));
check('批量按钮仍是 wb-main', /wb-toggle wb-main" id="wb-batch"/.test(src));
check('带 wb-main 样式类', /wb-toggle wb-main/.test(src));
check('文案含「批量下载」', /📦 批量下载/.test(src));
check('关闭态文案「退出批量」', /✅ 退出批量/.test(src));
check('只有一处 wb-batch 按钮', (src.match(/id="wb-batch"/g) || []).length === 1);
check('开关堆里不再有 wb-batch', !/wb-toggle" id="wb-batch"/.test(src));

console.log('\n═══ 显式 label（不靠 slice 切前缀）═══');
check('PANEL_LABELS 已定义', /const PANEL_LABELS = \{/.test(src));
check('PANEL_LABELS 在模块级', src.indexOf('const PANEL_LABELS') < src.indexOf('function bindPanel'));
check('PANEL_LABELS 在 syncPanelToggles 之前', src.indexOf('const PANEL_LABELS') < src.indexOf('function syncPanelToggles'));
check('5 个按钮全登记', ['isBatch', 'isPack', 'isImageHD', 'isVideoHD', 'isIncludesText']
    .every(k => new RegExp(`key: '${k}'`).test(src)));
// 精确判据：真实调用是 el.textContent.slice(2) 或 xxx.textContent.slice(2)
check('代码里已无 textContent.slice(2) 调用', !/\w+\.textContent\.slice\(2\)/.test(src));
check('paintToggle 用显式 label 拼文案', /el\.textContent = cfg\[def\.key\] \? def\.on : def\.off;/.test(src));
check('paintToggle 统一切文案', /const paintToggle = \(sel\) =>/.test(src));
check('批量按钮有 on 高亮态', /el\.classList\.toggle\('on', !!cfg\[def\.key\] && !!def\.big\)/.test(src));

console.log('\n═══ 关批量不影响下载入口（用户原问题）═══');
// flush 无条件跑 enhanceCards
check('flush 无条件跑 enhanceCards', /function flush\(\) \{[\s\S]{0,200}enhanceCards\(\);[\s\S]{0,120}if \(cfg\.isBatch\) injectPickers\(\);/.test(src));
check('injectPickers 只在批量开时跑', /if \(cfg\.isBatch\) injectPickers\(\);/.test(src));
// applyBatchMode(false) 不碰 wb-tap
const apm = src.slice(src.indexOf('function applyBatchMode'), src.indexOf('function injectPickers'));
check('applyBatchMode 不移除 wb-tap', !/wb-tap/.test(apm));
check('applyBatchMode 只清 .wb-card-pick', /querySelectorAll\('\.wb-card-pick'\)\.forEach\(\(el\) => el\.remove\(\)\)/.test(apm));
check('applyBatchMode 清工具栏', /querySelector\('\.wb-batch-bar'\)[\s\S]{0,60}\.remove\(\)/.test(apm));
// 下载入口是独立的 click 委托
check('下载入口独立于批量', /document\.addEventListener\('click'[\s\S]{0,300}closest\('\.wb-card-dl'\)/.test(src));

console.log('\n═══ CSS ═══');
check('wb-main 有视觉区分', /\.wb-toggle\.wb-main\{[\s\S]{0,300}?font-weight:6\d\d/.test(src));
check('wb-main 有 hover 态', /\.wb-toggle\.wb-main:hover/.test(src));
check('wb-main 有激活态', /\.wb-toggle\.wb-main\.on\{/.test(src));

console.log('\n═══ 版本 & 静态 ═══');
const vMeta = (src.match(/@version\s+([\d.]+)/) || [])[1];
const vConst = (src.match(/const VERSION = '([\d.]+)'/) || [])[1];
check('版本号两处一致', vMeta === vConst && /^\d+\.\d+\.\d+$/.test(vMeta || ''), `${vMeta}/${vConst}`);
check('头部有 v0.1.4 历史记录', /v0\.1\.4 变更/.test(src));
check('零 @require', !/^\/\/ @require/m.test(src));
check('GM_download grant 仍在', /@grant\s+GM_download/.test(src));
check('命名模板未被改坏', /const NAME_TPL_DEFAULT = '微博#\{username\}#\{uid\}#\{index\}\.\{ext\}'/.test(src));
check('批量仍串行（未擅自改并发）', /for \(const id of ids\) \{[\s\S]{0,120}await downloadWeibo\(id\)/.test(src));

console.log(`\n${'═'.repeat(46)}`);
console.log(`结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
