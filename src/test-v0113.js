// v0.1.13（原）功能已整体移除 —— 此文件改为「确认已移除」的反向断言
// 背景：v0.1.13 引入卡片顶部标签（.wb-tap-label）根治入口不稳定，
//       v0.1.15 用户要求「去掉头像右侧的下载按钮，只保留右下角一个」，
//       该机制连同 findCardLink / looksLikeTimestamp 一并删除。
const fs = require('fs');
const src = fs.readFileSync('/opt/data/cache/scratch/wb-build/weibo-saver-v0.1.0.user.js', 'utf8');
const codeOnly = src.split('\n').filter(l => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}${e ? ' → ' + e : ''}`); } };

console.log('\n═══ 顶部标签机制已彻底移除 ═══');
check('无 injectTapLabel', !/function injectTapLabel/.test(src));
check('无 findCardLink', !/function findCardLink/.test(src));
check('无 looksLikeTimestamp', !/function looksLikeTimestamp/.test(src));
check('无 TIME_TEXT_RE', !/TIME_TEXT_RE/.test(src));
check('无 wb-tap-label 样式', !/\.wb-tap-label/.test(codeOnly));
check('无 .wb-tap::after 样式', !/\.wb-tap::after/.test(codeOnly));
check('无 wbTapLabel 标记', !/wbTapLabel/.test(codeOnly));

console.log('\n═══ 右下角按钮完好（唯一入口）═══');
check('injectCardButtons 在', /function injectCardButtons/.test(src));
check('常驻样式', /\.wb-card-dl\{[\s\S]{0,400}?opacity:\.(?!0\b)[\d.]+/.test(src));
check('位置右下', /bottom:10px;right:10px/.test(src));
check('事件委托只接它', /closest\('\.wb-card-dl'\)/.test(codeOnly));

console.log('\n═══ v0.1.13 的核心修复仍在（识别层）═══');
check('卡片合并小卡逻辑在', /合并过小的候选卡/.test(src));
check('cardHasMedia 放宽在', /getComputedStyle\(card\)\.backgroundImage/.test(src));
check('media 缓存在', /const _mediaCache = new WeakMap\(\)/.test(src));
check('自愈重挂在', /wbDlBtn === '1'[\s\S]{0,200}wbDlBtn = '0'/.test(src));
check('SKIP 统计在', /const SKIP = \{ noId: 0, noMedia: 0, tooSmall: 0 \}/.test(src));
check('诊断统计三类', /未被开关隐藏/.test(src) && /等待布局（懒加载）/.test(src) && /尺寸太小/.test(src));

console.log(`\n${'═'.repeat(46)}`);
console.log(`结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
