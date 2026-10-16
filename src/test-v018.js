// v0.1.8 回归：删除命名选项区 + 自绘图标
const fs = require('fs');
const P = '/opt/data/cache/scratch/wb-build/weibo-saver-v0.1.0.user.js';
const src = fs.readFileSync(P, 'utf8');

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}${e ? ' → ' + e : ''}`); } };

const codeOnly = src.split('\n').filter(l => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

console.log('\n═══ 命名选项区已删除 ═══');
check('DOM 无 wb-namebox', !/wb-namebox/.test(codeOnly));
check('DOM 无 wb-on-list', !/wb-on-list/.test(codeOnly));
check('DOM 无 wb-off-list', !/wb-off-list/.test(codeOnly));
check('DOM 无 wb-msgnum', !/wb-msgnum/.test(codeOnly));
check('CSS 无 namebox 规则', !/\.wb-namebox/.test(src));
check('CSS 无 hover 展开残留', !/#wb-panel:hover \.wb-namebox/.test(src));
check('面板只剩两行按钮 + 列表', /id="wb-list"><\/div>/.test(src));

console.log('\n═══ 拖拽逻辑已删 ═══');
check('无 renderNames', !/renderNames/.test(codeOnly));
check('无 dragEl', !/dragEl/.test(codeOnly));
check('无 dragstart 监听', !/addEventListener\('dragstart'/.test(codeOnly));

console.log('\n═══ 旧命名体系彻底清除 ═══');
check('代码里无 NAME_FIELDS', !/NAME_FIELDS/.test(codeOnly));
check('代码里无 nameOrder 变量', !/nameOrder/.test(codeOnly));
check('代码里无 buildFilename 调用', !/buildFilename\(/.test(codeOnly));
check('代码里无 NAME_KEY', !/NAME_KEY/.test(codeOnly));
check('无旧「重置命名模板」菜单', !/重置命名模板/.test(codeOnly));

console.log('\n═══ 新模板体系完好 ═══');
check('NAME_TPL_DEFAULT 保留', /const NAME_TPL_DEFAULT = '微博#\{username\}#\{uid\}#\{index\}\.\{ext\}'/.test(src));
check('NAME_TPL_KEY 保留', /const NAME_TPL_KEY = 'wb_name_template'/.test(src));
check('renderName 保留', /function renderName\(info, index, ext\)/.test(src));
check('占位符列表保留', /const NAME_TPL_FIELDS = \['username', 'uid', 'mblogid', 'time', 'index', 'ext'\]/.test(src));
check('设置模板菜单保留', /GM_registerMenuCommand\('🏷 设置命名模板'/.test(src));
check('预览菜单保留', /GM_registerMenuCommand\('👀 预览命名效果'/.test(src));
check('恢复默认菜单保留', /GM_registerMenuCommand\('↩️ 恢复默认命名模板'/.test(src));

console.log('\n═══ 标题/文件名同源（顺手修的不一致）═══');
check('downloadWeibo title 走模板', /const title = renderName\(info, '00', 'jpg'\)/.test(src));
check('title 去掉尾部扩展名', /renderName\(info, '00', 'jpg'\)\.replace\(\/\\\.jpg\$\/, ''\)/.test(src));
check('不再用旧函数算 title', !/const title = buildFilename/.test(src));
check('落盘文件走 renderName', /renderName\(info, item\.index, ext\)/.test(src));
check('m3u8 文件走 renderName', /renderName\(info, index, 'mp4'\)/.test(src));
check('正文 txt 走 renderName', /renderName\(info, 'txt', 'txt'\)/.test(src));

console.log('\n═══ 自绘图标 ═══');
const icon = src.match(/@icon\s+data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)/);
check('@icon 是内联 data URI', !!icon);
check('@icon 行不用远程 favicon', !/@icon\s+https?:/.test(src));
check('代码里无远程 favicon 引用', !/favicon/.test(codeOnly));
if (icon) {
    const dec = Buffer.from(icon[1], 'base64').toString('utf-8');
    check('能解码成 SVG', dec.startsWith('<svg'), dec.slice(0, 30));
    check('含 viewBox（可缩放）', /viewBox="0 0 64 64"/.test(dec));
    check('含微博红 #e6162d', /#e6162d/i.test(dec));
    check('是下载箭头语义（竖线+箭头+底横条）',
    /M32 14 L32 38/.test(dec) && /M21 30 L32 41 L43 30/.test(dec) && /y="47"/.test(dec));
    check('base64 长度可控', icon[1].length < 1200, `${icon[1].length} 字符`);
}

console.log('\n═══ 面板功能未坏 ═══');
check('两行按钮仍在', (src.match(/<div class="wb-row">/g) || []).length === 2);
check('卡片按钮开关在', /id="wb-cardbtn"/.test(src));
check('批量按钮在', /id="wb-batch"/.test(src));
check('四个下载开关在', /id="wb-pack"/.test(src) && /id="wb-hd"/.test(src) && /id="wb-vhd"/.test(src) && /id="wb-text"/.test(src));
check('PANEL_LABELS 5 项', /'#wb-cardbtn'/.test(src) && /'#wb-batch'/.test(src));
check('下载列表渲染在', /function renderPanel\(\)/.test(src));

console.log('\n═══ 版本 & 老功能 ═══');
const vMeta = (src.match(/@version\s+([\d.]+)/) || [])[1];
const vConst = (src.match(/const VERSION = '([\d.]+)'/) || [])[1];
check('版本号两处一致', vMeta === vConst && /^\d+\.\d+\.\d+$/.test(vMeta || ''), `${vMeta}/${vConst}`);
check('头部有 v0.1.8 历史记录', /v0\.1\.8 变更/.test(src));
check('面板在左下', /#wb-panel\{[\s\S]{0,200}?bottom:\d+px/.test(src));
check('按钮在右下', /\.wb-card-dl\{[\s\S]{0,80}?bottom:10px;[\s\S]{0,40}?right:10px/.test(src));
check('三路识别在', /DIAG\.href/.test(src) && /DIAG\.attr/.test(src) && /DIAG\.media/.test(src));
check('GM_download 在', /@grant\s+GM_download/.test(src));
check('零 @require', !/^\/\/ @require/m.test(src));

console.log(`\n${'═'.repeat(46)}`);
console.log(`结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
