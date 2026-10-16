// v0.1.16 回归：修复同一张卡出现两个下载按钮
const fs = require('fs');
const P = '/opt/data/cache/scratch/wb-build/weibo-saver-v0.1.0.user.js';
const src = fs.readFileSync(P, 'utf8');
const codeOnly = src.split('\n').filter(l => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}${e ? ' → ' + e : ''}`); } };

console.log('\n═══ 修法一：collectCards 去嵌套 ═══');
{
    const cc = codeOnly.slice(codeOnly.indexOf('function collectCards'), codeOnly.indexOf('function cardHasMedia'));
    check('有去嵌套段', /const deduped = \[\]/.test(cc));
    // v0.1.18 起：单趟双向删除会吞卡，改为两趟 + 只跳过不删。
    // 这里断言「意图」而不是「具体写法」，写法可以再演进。
    check('被包含则跳过', /contained[\s\S]{0,80}continue;/.test(cc));
    check('包含已收录也跳过', /wraps[\s\S]{0,80}continue;/.test(cc));
    check('用 node.contains 判（不赌 className）',
        /\.contains\(c\)/.test(cc) && /c\.contains\(o\)/.test(cc));
    check('返回去重后的卡片集', /return finalCards;/.test(cc));
    check('不再返回 merged', !/return merged;/.test(cc));
    check('计数 DIAG.nested', /DIAG\.nested\+\+/.test(cc));
}

console.log('\n═══ 修法二：注入前查祖先（兜底）═══');
{
    const ic = codeOnly.slice(codeOnly.indexOf('function injectCardButtons'), codeOnly.indexOf('// ════════════════\n    // §11') > 0 ? codeOnly.indexOf('// ════════════════\n    // §11') : codeOnly.indexOf('function applyCardBtnVisibility'));
    // v0.1.19：祖先兜底已删除（它会把第一张卡以外的所有卡跳掉）
    check('祖先兜底已移除', !/closest\('\[data-wb-dl-btn/.test(codeOnly));
    check('防重复靠卡片自身标记', /card\.dataset\.wbDlBtn === '1'/.test(ic));
}

console.log('\n═══ 去嵌套逻辑行为测试（真跑）═══');
{
    // 模拟 DOM 树：outer > inner（两层都像卡片）
    const mkNode = (id, children, parent) => ({
        nodeType: 1, id, children: children || [], parent,
        contains(t) {
            if (t === this) return true;
            return this.children.some((c) => c.contains(t));
        },
    });
    const inner = mkNode('inner');
    const outer = mkNode('outer', [inner]);

    // 复刻去嵌套算法
    const dedupe = (list) => {
        const deduped = [];
        let nested = 0;
        for (const c of list) {
            if (!c || !c.nodeType) continue;
            const swallowed = deduped.some((o) => o !== c && o.contains(c));
            if (swallowed) { nested++; continue; }
            for (let i = deduped.length - 1; i >= 0; i--) {
                if (deduped[i] !== c && c.contains(deduped[i])) { nested++; deduped.splice(i, 1); }
            }
            deduped.push(c);
        }
        return { deduped, nested };
    };

    const r1 = dedupe([outer, inner]);
    check('外层+内层 → 只剩 1 张', r1.deduped.length === 1, `${r1.deduped.length} 张`);
    check('留下的是外层', r1.deduped[0] === outer);
    check('计入 1 次去嵌套', r1.nested === 1, `${r1.nested}`);

    const r2 = dedupe([inner, outer]);
    check('顺序颠倒（内层先）→ 仍只剩 1 张', r2.deduped.length === 1, `${r2.deduped.length} 张`);
    check('顺序颠倒时留下外层', r2.deduped[0] === outer);

    // 两张互不包含的卡：都保留
    const a = mkNode('a'), b = mkNode('b');
    const r3 = dedupe([a, b]);
    check('两张独立卡都保留', r3.deduped.length === 2, `${r3.deduped.length} 张`);
    check('独立卡不去嵌套', r3.nested === 0);

    // 三层嵌套
    const l3 = mkNode('l3'), l2 = mkNode('l2', [l3]), l1 = mkNode('l1', [l2]);
    const r4 = dedupe([l3, l2, l1]);
    check('三层嵌套 → 只剩最外层 1 张', r4.deduped.length === 1, `${r4.deduped.length} 张`);
    check('三层留下最外层 l1', r4.deduped[0] === l1);
    check('三层计数为 2', r4.nested === 2, `${r4.nested}`);

    // 空/无效输入
    const r5 = dedupe([null, undefined, a]);
    check('无效节点被过滤', r5.deduped.length === 1);
}

console.log('\n═══ 日志 ═══');
check('日志含去嵌套计数', /去嵌套=\$\{DIAG\.nested\}/.test(src));
check('DIAG 有 nested 字段', /DIAG\.nested = 0;/.test(src));

console.log('\n═══ 版本 & 老功能 ═══');
const vMeta = (src.match(/@version\s+([\d.]+)/) || [])[1];
const vConst = (src.match(/const VERSION = '([\d.]+)'/) || [])[1];
check('版本号两处一致', vMeta === vConst && /^\d+\.\d+\.\d+$/.test(vMeta || ''), `${vMeta}/${vConst}`);
    check('头部有 v0.1.16 历史记录', /v0\.1\.16 变更/.test(src));
check('头部有 v0.1.16 记录', /v0\.1\.16 变更/.test(src));
check('右下角常驻未坏', /\.wb-card-dl\{[\s\S]{0,400}?opacity:\.(?!0\b)[\d.]+/.test(src));
check('唯一入口未坏', !/wb-tap-label/.test(codeOnly));
check('单视频修复未坏', /async function topMediaUrlAsync/.test(src));
check('三路识别未坏', /DIAG\.href/.test(src) && /DIAG\.attr/.test(src) && /DIAG\.media/.test(src));
check('落盘错峰未坏', /i \+= batchSize/.test(src));
check('GM_download 在', /@grant\s+GM_download/.test(src));
check('零 @require', !/^\/\/ @require/m.test(src));

console.log(`\n${'═'.repeat(46)}`);
console.log(`结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
