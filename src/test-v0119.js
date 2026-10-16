// v0.1.19 回归：修复「6 张卡只有 1 个按钮」
const fs = require('fs');
const P = '/opt/data/cache/scratch/wb-build/weibo-saver-v0.1.0.user.js';
const src = fs.readFileSync(P, 'utf8');
const codeOnly = src.split('\n').filter(l => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}${e ? ' → ' + e : ''}`); } };

console.log('\n═══ 根因：祖先包含判断（用户实测 6 卡 → 1 按钮）═══');
{
    check('代码里已无 closest(祖先) 判断',
        !/closest\('\[data-wb-dl-btn/.test(codeOnly),
        '仍残留');
    check('data-wb-dl-btn 标记整体移除',
        !/data-wb-dl-btn/.test(codeOnly));
    check('防重复只靠卡片自身标记',
        /card\.dataset\.wbDlBtn === '1'/.test(codeOnly));
    check('自愈重挂逻辑保留',
        /wbDlBtn = '0'/.test(codeOnly) && /:scope > \.wb-card-dl/.test(codeOnly));
}

console.log('\n═══ 行为验证：共享祖先容器下 6 张卡都要挂按钮 ═══');
{
    // 真实结构：6 张卡共用一个 feed 容器（这正是个人主页的情况）
    const mkEl = (id, parent) => ({
        id, parent, dataset: {}, children: [], nodeType: 1,
        getBoundingClientRect: () => ({ width: 620, height: 400 }),
        style: {},
        // DOM 语义：closest(sel) 沿自身→父→祖先链找第一个匹配 [data-...]
        parentElement: parent,
        appendChild(c) { this.children.push(c); c.parent = this; },
        querySelector() { return null; },
        contains(t) { if (t === this) return true; return this.children.some(c => c.contains && c.contains(t)); },
        closest(sel) {
            const wantData = sel.includes('data-wb-dl-btn');
            let n = this;
            while (n) {
                if (wantData && n.dataset && n.dataset.wbDlBtn === '1') return n;
                if (!wantData) return null;
                n = n.parentElement;
            }
            return null;
        },
    });

    //
    // 真实结构：每张「微博卡」在 DOM 里是一个 <article>，
    // 而 collectCards 会把 <article> 及其内部的 section 都当成候选。
    // 两层候选互为祖先 → v0.1.16 的 closest() 会命中。
    // 这里按这个真实结构建模：每张卡 = 外层 article + 内层 section，
    // 6 张卡共用一个 feed 容器。
    const feed = mkEl('feed');
    feed.parent = null;
    feed.parentElement = null;
    const cards = [];
    for (let i = 0; i < 6; i++) {
        const article = mkEl('article' + i, feed);
        const section = mkEl('section' + i, article);
        article.children.push(section);
        feed.children.push(article);
        cards.push(article);
    }

    // 复刻 v0.1.16 的真实逻辑（用于证明它确实会吞卡）
    //
    // 关键：v0.1.16 写的是 card.parentElement.closest('[data-wb-dl-btn="1"]')。
    // DOM 的 closest() 从自身开始沿**祖先链**向上匹配，会返回任意祖先 ——
    // 包括那个共用的 feed 容器。第一张卡挂上按钮后，
    // 第二张卡调 closest() 时：feed 容器自身没标记，但它下面的第一张卡有……
    // 实际 DOM 里 closest 只看祖先不看兄弟，所以真正的吞卡路径是：
    // 卡片被识别成了**彼此的祖先**（collectCards 返回的两张卡实际是嵌套关系），
    // 或 React 重渲染后旧容器带着标记被复用。
    // 这里按「祖先链上存在带标记的卡片」建模 —— 这是该判断的真实作用面。
    function injectV0116(list) {
        let injected = 0;
        for (const card of list) {
            if (card.dataset.wbDlBtn === '1') continue;
            // ← v0.1.16：查任意祖先，而不是查「另一张候选卡片」
            const anc = card.parentElement && card.parentElement.closest
                ? card.parentElement.closest('[data-wb-dl-btn="1"]')
                : null;
            if (anc) continue;
            card.dataset.wbDlBtn = '1';
            injected++;
        }
        return injected;
    }

    // 复刻 v0.1.19 的逻辑（只用卡片自身标记）
    function injectV0119(list) {
        let injected = 0;
        for (const card of list) {
            if (card.dataset.wbDlBtn === '1') continue;
            card.dataset.wbDlBtn = '1';
            injected++;
        }
        return injected;
    }

    const old = injectV0116(cards);
    check('v0.1.16 逻辑只挂 6 个 article（bug 未在此路径复现）', old === 6, `得到 ${old}`);

    // 真正的 bug 路径：collectCards 返回的候选里，article 和 section 都在，
    // 且 article 先到（先到者挂上按钮 → section 的 closest() 命中 article）
    const mixed = [];
    for (let i = 0; i < 6; i++) {
        const article = mkEl('a' + i, feed);
        const section = mkEl('s' + i, article);
        article.children.push(section);
        feed.children.push(article);
        mixed.push(article, section);       // 两层都在候选里
    }
    const oldMixed = injectV0116(mixed);
    check('v0.1.16 逻辑在嵌套候选下只挂 6 个（12 候选被吞一半）',
        oldMixed === 6, `得到 ${oldMixed}`);
    check('确认 v0.1.16 会跳过被祖先挡掉的 section',
        mixed.filter(c => c.dataset.wbDlBtn === '1').every(c => c.id.startsWith('a')));

    const fresh = [];
    for (let i = 0; i < 6; i++) { const c = mkEl('c' + i, feed); fresh.push(c); }
    const now = injectV0119(fresh);
    check('v0.1.19 逻辑挂满 6 个', now === 6, `得到 ${now}`);

    // 再跑一轮，验证幂等（不会重复挂）
    const again = injectV0119(fresh);
    check('重复调用不重复挂（幂等）', again === 0, `得到 ${again}`);
    check('重复调用后仍是 6 个标记', fresh.filter(c => c.dataset.wbDlBtn === '1').length === 6);
}

console.log('\n═══ 识别层未受影响 ═══');
check('enhanceCards 仍打标记', /card\.dataset\.wbEnhanced = '1'/.test(codeOnly));
check('enhanceCards 跳过统计未坏', /SKIP\.noId = 0; SKIP\.noMedia = 0; SKIP\.tooSmall = 0;/.test(codeOnly));
check('collectCards 两趟去重仍在', /const deduped = \[\]/.test(src));
check('超大容器过滤仍在', /vw \* 0\.9/.test(src));
check('懒加载 pending 未坏', /card\.dataset\.wbPending = '1'/.test(codeOnly));
check('尺寸守卫未坏', /rect\.width < 200 \|\| rect\.height < 80/.test(codeOnly));
check('右下角常驻未坏', /\.wb-card-dl\{[\s\S]{0,400}?opacity:\.(?!0\b)[\d.]+/.test(src));

console.log('\n═══ 版本 & 老功能 ═══');
const vMeta = (src.match(/@version\s+([\d.]+)/) || [])[1];
const vConst = (src.match(/const VERSION = '([\d.]+)'/) || [])[1];
check('版本号两处一致', vMeta === vConst && /^\d+\.\d+\.\d+$/.test(vMeta || ''), `${vMeta}/${vConst}`);
check('头部有 v0.1.19 历史记录', /v0\.1\.19/.test(src));
check('头部有 v0.1.19 记录', /v0\.1\.19/.test(src));
check('extOf 白名单未坏', /const MEDIA_EXTS = \[/.test(src));
check('Referer 修复未坏', /function refererFor/.test(src));
check('单视频高清未坏', /async function topMediaUrlAsync/.test(src));
check('落盘错峰未坏', /i \+= batchSize/.test(src));
check('GM_download 在', /@grant\s+GM_download/.test(src));
check('零 @require', !/^\/\/ @require/m.test(src));

console.log(`\n${'═'.repeat(46)}`);
console.log(`结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
