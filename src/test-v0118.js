// v0.1.18 回归：修复 v0.1.16 引入的「卡片按钮全部消失」
const fs = require('fs');
const P = '/opt/data/cache/scratch/wb-build/weibo-saver-v0.1.0.user.js';
const src = fs.readFileSync(P, 'utf8');
const codeOnly = src.split('\n').filter(l => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}${e ? ' → ' + e : ''}`); } };

// ══════════════ 复刻脚本里的去重算法（逐行照抄源码）══════════════
const mk = (id, children, w) => ({
    nodeType: 1, id, children: children || [], w: w || 600,
    contains(t) { if (t === this) return true; return this.children.some(c => c.contains(t)); },
    getBoundingClientRect() { return { width: this.w, height: 400 }; },
});

function dedupe(merged, vw) {
    let nested = 0, oversized = 0;
    let pool = merged.filter(Boolean);
    if (vw) {
        const before = pool.length;
        pool = pool.filter(c => {
            if (!c.nodeType) return false;
            const w = c.getBoundingClientRect().width;
            if (w > vw * 0.9) { oversized++; return false; }
            return true;
        });
        oversized = before - pool.length;
    }
    const deduped = [];
    for (const c of pool) {
        if (!c.nodeType) continue;
        const contained = deduped.some(o => o !== c && o.contains(c));
        const wraps = deduped.some(o => o !== c && c.contains(o));
        if (contained || wraps) { nested++; continue; }
        deduped.push(c);
    }
    return { finalCards: deduped, nested, oversized };
}

console.log('\n═══ 结构要求 ═══');
{
    const cc = codeOnly.slice(codeOnly.indexOf('function collectCards'), codeOnly.indexOf('function cardHasMedia'));
    check('两趟结构（先剔容器）', /pool = merged\.filter\(Boolean\)/.test(cc));
    check('按视口宽度剔容器', /c\.getBoundingClientRect\(\)\.width;[\s\S]{0,80}vw \* 0\.9/.test(cc));
    check('计数器 oversized', /DIAG\.oversized/.test(cc));
    check('第二趟只跳过不删', /if \(contained \|\| wraps\) \{ DIAG\.nested\+\+; continue; \}/.test(cc));
    check('无 splice 删除', !/deduped\.splice/.test(cc));
    check('contained 判断（是内层）', /o\.contains\(c\)/.test(cc));
    check('wraps 判断（是外层）', /c\.contains\(o\)/.test(cc));
    check('返回 finalCards', /return finalCards;/.test(cc));
}

console.log('\n═══ 顺序无关性（8 场景行为测试）═══');
{
    const c1 = mk('card1'), c2 = mk('card2'), c3 = mk('card3');
    const feed = mk('feed', [c1, c2, c3], 1200);   // 包住整个 feed 的巨型容器
    const inner = mk('inner'), outer = mk('outer', [inner], 700);
    const x = mk('x'), y = mk('y'), z = mk('z');

    const cases = [
        ['巨型容器排在最前（v0.1.16 塌的场景）', [feed, c1, c2, c3], 3],
        ['正常顺序', [c1, c2, c3], 3],
        ['双层嵌套·内层在前', [inner, outer], 1],
        ['双层嵌套·外层在前', [outer, inner], 1],
        ['只有巨型容器', [feed], 0],
        ['三张独立卡', [x, y, z], 3],
        ['容器与真卡混排', [c1, feed, c2], 2],
        ['顺序全乱', [feed, inner, c3, outer, c1], 3],
    ];
    cases.forEach(([label, input, want]) => {
        const r = dedupe(input, 1200);
        const got = r.finalCards.length;
        check(`${label} → ${got} 张`, got === want, `期望 ${want}`);
    });
}

console.log('\n═══ 关键回归：不能再出现「全被吞」═══');
{
    const c1 = mk('card1'), c2 = mk('card2'), c3 = mk('card3');
    const feed = mk('feed', [c1, c2, c3], 1200);
    const r = dedupe([feed, c1, c2, c3], 1200);
    check('巨型容器在前时真卡不被吞', r.finalCards.length === 3, `${r.finalCards.length} 张`);
    check('巨型容器本身被剔除', r.oversized === 1, `oversized=${r.oversized}`);
    check('保留下来的是真卡', r.finalCards.every(c => c.id.startsWith('card')));
}

console.log('\n═══ 视口未知时不崩 ═══');
{
    const c1 = mk('card1'), c2 = mk('card2');
    const r = dedupe([c1, c2], 0);   // vw=0 表示拿不到视口宽
    check('vw=0 时不丢卡片', r.finalCards.length === 2, `${r.finalCards.length} 张`);
    check('vw=0 时不做超大过滤', r.oversized === 0);
}

console.log('\n═══ 版本 & 老功能 ═══');
const vMeta = (src.match(/@version\s+([\d.]+)/) || [])[1];
const vConst = (src.match(/const VERSION = '([\d.]+)'/) || [])[1];
check('版本号两处一致', vMeta === vConst && /^\d+\.\d+\.\d+$/.test(vMeta || ''), `${vMeta}/${vConst}`);
check('头部有 v0.1.18 历史记录', /v0\.1\.18 变更/.test(src));
check('头部有 v0.1.18 记录', /v0\.1\.18 变更/.test(src));
check('v0.1.16 去嵌套仍在（已修方向）', /const deduped = \[\]/.test(src));
check('extOf 白名单未坏', /const MEDIA_EXTS = \[/.test(src));
check('Referer 修复未坏', /function refererFor/.test(src));
check('右下角按钮常驻未坏', /\.wb-card-dl\{[\s\S]{0,400}?opacity:\.(?!0\b)[\d.]+/.test(src));
check('单视频高清未坏', /async function topMediaUrlAsync/.test(src));
check('祖先兜底仍处于已移除状态', !/closest\('\[data-wb-dl-btn/.test(codeOnly));
check('落盘错峰未坏', /i \+= batchSize/.test(src));
check('GM_download 在', /@grant\s+GM_download/.test(src));
check('零 @require', !/^\/\/ @require/m.test(src));

console.log(`\n${'═'.repeat(46)}`);
console.log(`结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
