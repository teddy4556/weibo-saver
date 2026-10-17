// v0.1.11 回归：修复卡片按钮显示不稳定（6 个根因）
const fs = require('fs');
const P = require('./_target.js').TARGET;
const src = fs.readFileSync(P, 'utf8');
const codeOnly = src.split('\n').filter(l => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}${e ? ' → ' + e : ''}`); } };

console.log('\n═══ 根因 1&2 · inline display 统一到一处 ═══');
check('applyBatchMode 退出批量改调统一函数',
    /退出批量：恢复单条下载按钮[\s\S]{0,400}applyCardBtnVisibility\(cfg\.isCardBtn\)/.test(src));
check('不再无条件 display:""',
    !/退出批量：恢复单条下载按钮[\s\S]{0,120}el\.style\.display = ''/.test(src));
check('批量模式改调统一函数',
    /批量模式下隐藏单条下载按钮[\s\S]{0,140}applyCardBtnVisibility\(cfg\.isCardBtn\)/.test(src));
// 只统计 .wb-card-dl 上的 display 赋值（勾选圈/工具条是别的元素，不算）
{
    const dlWrites = codeOnly.split('\n').filter(l =>
        /\.style\.display =/.test(l) && /wb-card-dl|on && !cfg\.isBatch/.test(l));
    check('.wb-card-dl 的 display 只在统一函数里写', dlWrites.length === 1, `${dlWrites.length} 处: ${dlWrites.join(' | ')}`);
}

console.log('\n═══ 根因 3 · 新卡片初始状态 ═══');
check('注入时按开关设初始 display',
    /if \(!cfg\.isCardBtn \|\| cfg\.isBatch\) btn\.style\.display = 'none';/.test(src));
check('在 appendChild 之前设置',
    src.indexOf("btn.style.display = 'none'") < src.indexOf('card.appendChild(btn)'));

console.log('\n═══ 根因 4 · 懒加载误判 ═══');
check('rect=0 判为待布局而非太小',
    /if \(rect\.width === 0 && rect\.height === 0\) \{[\s\S]{0,120}wbPending/.test(src));
check('待布局的卡片不设 wbDlBtn（会重试）',
    /wbPending = '1';   \/\/ 还没布局好，下轮再说[\s\S]{0,60}continue;/.test(src));
check('真太小的仍永久跳过',
    /wbTooSmall = '1';   \/\/ 确实太小（头像\/表情），永久跳过/.test(src));
check('布局就绪后清 pending 标记', /delete card\.dataset\.wbPending;/.test(src));
{
    // 行为测试：懒加载序列
    const inject = (rect, state) => {
        // state: {dlBtn, pending, tooSmall}
        if (rect.width === 0 && rect.height === 0) {
            if (!state.pending) state.pending = true;
            return 'pending（会重试）';
        }
        if (rect.width < 200 || rect.height < 80) { state.tooSmall = true; return 'tooSmall（永久跳过）'; }
        state.pending = false;   // 等价于 delete card.dataset.wbPending
        return 'mounted';
    };
    const s1 = {};
    check('未布局卡片 → pending 而非 tooSmall', inject({ width: 0, height: 0 }, s1) === 'pending（会重试）');
    check('  且没被标记 tooSmall', s1.tooSmall === undefined);
    check('布局就绪后 → mounted', inject({ width: 600, height: 400 }, s1) === 'mounted');
    check('  pending 被清掉', s1.pending === false);
    const s2 = {};
    check('头像 40x40 → tooSmall 永久跳过', inject({ width: 40, height: 40 }, s2) === 'tooSmall（永久跳过）');
}

console.log('\n═══ 根因 5 · pending 主动清理 ═══');
check('有 pendingCards 计数器', /let pendingCards = 0/.test(src));
check('打标记时累加且不重复', /if \(!card\.dataset\.wbPending\) pendingCards\+\+;/.test(src));
check('flush 里检查 pending 卡片',
    /flush\(\) \{[\s\S]{0,600}querySelectorAll\('\[data-wb-pending="1"\]'\)/.test(src));
check('布局就绪则递减', /if \(r\.width > 0 \|\| r\.height > 0\) pendingCards--;/.test(src));

console.log('\n═══ 根因 6 · React 清节点后的自愈 ═══');
check('injectCardButtons 有自愈',
    /wbDlBtn === '1'\) \{[\s\S]{0,200}querySelector\(':scope > \.wb-card-dl'\)[\s\S]{0,120}wbDlBtn = '0'/.test(src));
// v0.1.13：自愈判据从 .wb-tap 改为主标签 .wb-tap-label（时间戳入口已降级为可选）
// v0.1.15：顶部标签已删，enhanceCards 自愈简化为一刀切 continue
check('enhanceCards 自愈简化', /if \(card\.dataset\.wbEnhanced === '1'\) continue;/.test(src));
check('自愈后走正常挂载路径', /} else \{\s*continue;\s*\}/.test(src));

console.log('\n═══ 诊断增强 ═══');
check('统计未隐藏按钮', /visibleBtns/.test(src));
check('统计待布局', /pending = document\.querySelectorAll\('\[data-wb-pending="1"\]'\)/.test(src));
check('统计尺寸太小', /tooSmall = document\.querySelectorAll\('\[data-wb-too-small="1"\]'\)/.test(src));
check('诊断输出三类计数', /未被开关隐藏/.test(src) && /等待布局（懒加载）/.test(src) && /尺寸太小（头像\/表情）/.test(src));

console.log('\n═══ 位置与样式未变 ═══');
check('按钮仍在右下', /\.wb-card-dl\{[\s\S]{0,80}?bottom:10px;[\s\S]{0,40}?right:10px/.test(src));
check('按钮已改常驻（v0.1.15）', /\.wb-card-dl\{[\s\S]{0,500}?pointer-events:auto/.test(src));
check('按钮常驻（v0.1.15 起不隐藏）', /\.wb-card-dl\{[\s\S]{0,400}?opacity:\.(?!0\b)[\d.]+/.test(src));

console.log('\n═══ 版本 & 老功能 ═══');
const vMeta = (src.match(/@version\s+([\d.]+)/) || [])[1];
const vConst = (src.match(/const VERSION = '([\d.]+)'/) || [])[1];
check('版本号两处一致（动态比对，不写死版本）',
    vMeta === vConst && /^\d+\.\d+\.\d+$/.test(vMeta || ''), `${vMeta}/${vConst}`);
check('有 SKIP 原因统计', /const SKIP = \{ noId: 0, noMedia: 0, tooSmall: 0 \}/.test(src));
check('三处跳过都计数', /SKIP\.noId\+\+/.test(src) && /SKIP\.noMedia\+\+/.test(src) && /SKIP\.tooSmall\+\+/.test(src));
check('每次 enhanceCards 重置计数', /SKIP\.noId = 0; SKIP\.noMedia = 0; SKIP\.tooSmall = 0;/.test(src));
check('诊断输出三项原因', /识别不出微博 id/.test(src) && /判定为纯文字/.test(src) && /尺寸太小/.test(src));
{
    const seg = src.slice(src.indexOf('v0.1.11 变更'), src.indexOf('v0.1.10 变更'));
    const n = (seg.match(/^ \*  [0-9]+\./gm) || []).length;
    check('头部有 v0.1.11 历史记录', /v0\.1\.11 变更/.test(src));
    check('旧断言留存', n === 6, `${n} 条`);
    check('列明「显示不稳定」', /显示不稳定/.test(seg));
}
check('命名模板未坏', /const NAME_TPL_DEFAULT = '微博#\{username\}#\{uid\}#\{index\}\.\{ext\}'/.test(src));
check('live 命名修复未坏', src.includes("+ `-live.${ext}`"));
check('落盘错峰未坏', /i \+= batchSize/.test(src));
check('三路识别未坏', /DIAG\.href/.test(src) && /DIAG\.attr/.test(src) && /DIAG\.media/.test(src));
check('GM_download 在', /@grant\s+GM_download/.test(src));
check('零 @require', !/^\/\/ @require/m.test(src));

console.log(`\n${'═'.repeat(46)}`);
console.log(`结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
