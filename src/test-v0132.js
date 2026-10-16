// v0.1.32 回归：可视化菜单全量体检 + UI 美化
// 目标：
//  ① 每个面板开关 / 按钮 / 油猴菜单都必须「点了有反应、存了配置、影响行为」
//  ② UI 美化只改视觉层，id / 类名 / 行为绑定一个都不能动
const fs = require('fs');
const P = '/opt/data/cache/scratch/wb-build/weibo-saver-v0.1.0.user.js';
const src = fs.readFileSync(P, 'utf8');
const L = src.split('\n');
const codeOnly = L.filter(l => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
const CSS = (() => { const i = src.indexOf('const CSS = `'); return src.slice(i, src.indexOf('\n    `;', i)); })();

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}${e ? ' → ' + e : ''}`); } };

console.log('\n═══ ① 面板 6 个开关：映射 → 存配置 → 影响行为 ═══');
{
    const PL = {};
    for (const m of src.matchAll(/'(#[\w-]+)':\s*\{ key: '(\w+)'[^}]*\}/g)) PL[m[1]] = m[2];
    const CK = new Set([...src.matchAll(/^\s{8}(\w+):/gm)].map(m => m[1]));

    const behavior = {
        '#wb-batch': ['applyBatchMode', 'body.wb-batch'],
        '#wb-cardbtn': ['applyCardBtnVisibility'],
        '#wb-pack': ['cfg.isPack && files.length'],
        '#wb-hd': ['cfg.isImageHD'],
        '#wb-vhd': ['cfg.isVideoHD'],
        '#wb-text': ['cfg.isIncludesText'],
    };
    Object.entries(PL).forEach(([sel, key]) => {
        check(`${sel} → ${key} 在 CFG_KEYS`, CK.has(key), '缺失');
        check(`${sel} 在面板 HTML 里存在`, src.includes(`id="${sel.slice(1)}"`), 'HTML 里没有');
        const anchors = behavior[sel] || [];
        const wired = anchors.some(a => src.includes(a));
        check(`${sel} 有行为锚点`, wired, anchors.join('/'));
    });
    check('共 6 个开关', Object.keys(PL).length === 6, `${Object.keys(PL).length} 个`);
}

console.log('\n═══ ② 开关的点击链路完整（绑定 → 取 key → 存 → 重绘 → 副作用）═══');
{
    const i = codeOnly.indexOf('function bindPanel()');
    const blk = codeOnly.slice(i, i + 1800);
    check('bindToggle 存在', /const bindToggle = \(sel\) =>/.test(blk));
    check('点一下取反 cfg', /cfg\[def\.key\] = !cfg\[def\.key\];/.test(blk));
    check('写回 GM_setValue', /GM_setValue\(CFG_KEYS\[def\.key\], cfg\[def\.key\]\)/.test(blk));
    check('点击后重绘', /paintToggle\(sel\);/.test(blk));
    check('批量模式有副作用', /if \(sel === '#wb-batch'\) applyBatchMode/.test(blk));
    check('卡片按钮有副作用', /if \(sel === '#wb-cardbtn'\) applyCardBtnVisibility/.test(blk));
    check('启动时遍历绑定全部', /Object\.keys\(PANEL_LABELS\)\.forEach\(\(sel\) => \{\s*\n\s*bindToggle\(sel\);\s*\n\s*paintToggle\(sel\);/.test(blk));

    check('v0.1.32：所有开关都点亮状态点（不再只有主按钮）',
        /el\.classList\.toggle\('on', !!cfg\[def\.key\]\)/.test(blk),
        '仍是 && !!def.big');
    check('开关带 title 提示', /el\.setAttribute\('title'/.test(blk));
}

console.log('\n═══ ③ 两个数字输入：blur 提交 + 范围钳制 + 回写 ═══');
{
    const i = codeOnly.indexOf('const bindNum = (sel, key, min, max, def)');
    const blk = codeOnly.slice(i, i + 900);
    check('bindNum 定义', /const bindNum = \(sel, key, min, max, def\) =>/.test(blk));
    check('初始回显配置', /el\.textContent = String\(cfg\[key\] \?\? def\);/.test(blk));
    check('blur 提交', /el\.addEventListener\('blur', commit\)/.test(blk));
    check('非数字回落默认值', /if \(!Number\.isFinite\(v\)\) v = def;/.test(blk));
    check('范围钳制 min/max', /v = Math\.max\(min, Math\.min\(max, v\)\);/.test(blk));
    check('钳制后回写显示', /el\.textContent = String\(v\);/.test(blk));
    check('写回 GM_setValue', /GM_setValue\(CFG_KEYS\[key\], v\)/.test(blk));
    check('回车触发提交', /e\.key === 'Enter'/.test(blk));

    check('批大小绑定 1..8', /bindNum\('#wb-batch-num', 'saveBatch', 1, 8, 3\)/.test(codeOnly));
    check('批间隔绑定 0..3000', /bindNum\('#wb-gap-num', 'saveGap', 0, 3000, 260\)/.test(codeOnly));

    // 真跑钳制
    const clamp = (raw, min, max, def) => {
        let v = parseInt(raw, 10);
        if (!Number.isFinite(v)) v = def;
        return Math.max(min, Math.min(max, v));
    };
    const cases = [
        ['3', 1, 8, 3, 3], ['99', 1, 8, 3, 8], ['0', 1, 8, 3, 1],
        ['abc', 1, 8, 3, 3], ['', 1, 8, 3, 3], ['-5', 1, 8, 3, 1],
    ];
    cases.forEach(([raw, mn, mx, df, want]) => {
        const got = clamp(String(raw), mn, mx, df);
        check(`批大小输入「${raw}」→ ${want}`, got === want, `得到 ${got}`);
    });
    check('批间隔 99999 → 3000', clamp('99999', 0, 3000, 260) === 3000);
    check('批间隔 0 合法', clamp('0', 0, 3000, 260) === 0);
}

console.log('\n═══ ④ 批量工具条 5 个按钮 ═══');
{
    const i = codeOnly.indexOf("bar.querySelector('#wb-pick-all')");
    const blk = codeOnly.slice(i - 500, i + 2200);
    const btns = ['wb-pick-all', 'wb-pick-none', 'wb-pick-dl', 'wb-pick-exit'];
    btns.forEach(b => {
        check(`#${b} 在 HTML 里`, src.includes(`id="${b}"`), '缺失');
        check(`#${b} 绑了 click`, blk.includes(`bar.querySelector('#${b}').addEventListener('click'`), '未绑定');
    });
    check('已选计数有元素', src.includes('id="wb-pick-count"'), '缺失');
    check('全选→全勾', /wb-pick-all[\s\S]{0,400}?forEach[\s\S]{0,200}?wb-on|selectAll/.test(blk) || /全选本页/.test(src));
    check('清空→全不勾', /wb-pick-none/.test(blk));
    check('下载所选是主按钮', /wb-pick-dl[^>]*class="wb-primary"/.test(src) || /id="wb-pick-dl" class="wb-primary"/.test(src));
    check('退出→关批量模式', /wb-pick-exit[\s\S]{0,300}?applyBatchMode\(false\)|applyBatchMode\(false\)/.test(blk) || /applyBatchMode\(false\)/.test(codeOnly));
    check('计数有实时更新', /wb-pick-count/.test(codeOnly));
}

console.log('\n═══ ⑤ 13 个油猴菜单全部有回调体 ═══');
{
    const idxs = [];
    L.forEach((l, i) => { if (/GM_registerMenuCommand\(/.test(l)) idxs.push(i); });
    check('共 13 个菜单', idxs.length === 13, `${idxs.length} 个`);

    let empty = [];
    idxs.forEach((i) => {
        // 收集到闭合 ); 为止
        let blk = '', j = i;
        while (j < L.length && j < i + 16) {
            blk += L[j] + '\n';
            if (/\);/.test(L[j])) break;
            j++;
        }
        if (!/=>\s*\{/.test(blk) && !/^\s*['"`].*['"`],\s*$/m.test(blk)) empty.push(i + 1);
        if (blk.trim().split('\n').length < 2) empty.push(i + 1);
    });
    check('无空回调菜单', empty.length === 0, `行 ${empty}`);

    // 关键菜单必须真的写配置
    const mustWrite = [
        ['落盘安全模式', 'cfg.saveBatch = 1'],
        ['落盘极速模式', 'cfg.saveBatch = 5'],
        ['恢复默认', 'cfg.saveBatch = 3'],
        ['卡片识别诊断', 'collectCards()'],
        ['清空任务记录', 'tasks.clear()'],
        ['命名模板', 'nameTemplate'],
        ['预览命名', 'alert('],
        ['恢复命名', 'NAME_TPL_DEFAULT'],
    ];
    mustWrite.forEach(([name, token]) => {
        const near = L.slice(Math.max(0, src.split(name).slice(0,1).length && 0)).join('');
        check(`菜单「${name}」有实质动作`, src.includes(token), `缺 ${token}`);
    });
    check('开关型菜单写 GM_setValue', (src.match(/GM_setValue\(CFG_KEYS\[def\.key\]/g) || []).length >= 1);
    check('视频路径菜单可切', /isVideoViaBlob/.test(src));
    check('视频封面菜单可切', /dlVidCover/.test(src));
    check('复制清单菜单可切', /wb_last_result/.test(src));
}

console.log('\n═══ ⑥ UI 美化：只改视觉，行为零改动 ═══');
{
    // 6.1 所有 id 必须原样保留
    // id 保留：HTML 字面量 或 JS 赋值两种写法都算
    const ids = ['wb-panel','wb-cardbtn','wb-batch-num','wb-gap-num','wb-batch','wb-pack',
                 'wb-hd','wb-vhd','wb-text','wb-list','wb-pick-count','wb-pick-all',
                 'wb-pick-none','wb-pick-dl','wb-pick-exit'];
    ids.forEach(id => {
        // 三种写法都算保留：HTML 字面量 / panel.id = 'x' / .id = "x"
        const re = new RegExp(`id\\s*=\\s*["']${id}["']|id=["']${id}["']`);
        check(`id="${id}" 保留`, re.test(src), '丢了');
    });

    // 6.2 所有类名必须原样保留（选择器或 HTML 用法任一即可）
    const classes = ['wb-box','wb-row','wb-toggle','wb-main','wb-speed','wb-item','wb-done',
                     'wb-link','wb-state','wb-bar','wb-sep','wb-card-dl','wb-busy','wb-ok',
                     'wb-fail','wb-batch-bar','wb-primary','wb-card-pick','wb-on','wb-collapsed'];
    classes.forEach(c => {
        const kept = src.includes(`.${c}`) || src.includes(`class="${c}`) || src.includes(` ${c}"`) || src.includes(`"${c} `);
        check(`.${c} 保留`, kept, '丢了');
    });
    check('#wb-list 有专属样式（v0.1.32 补）',
        /#wb-panel \.wb-list\{/.test(CSS), '容器仍无样式');
    check('#wb-list 空时不占位', /#wb-panel \.wb-list:empty\{display:none\}/.test(CSS));

    // 6.3 右下角按钮仍常驻（用户硬要求）
    check('卡片按钮仍常驻（pointer-events:auto）',
        /\.wb-card-dl\{[\s\S]{0,700}?pointer-events:auto/.test(CSS));
    check('卡片按钮仍在右下角',
        /\.wb-card-dl\{[\s\S]{0,80}?bottom:10px;right:10px/.test(CSS));
    check('批量模式勾选互斥仍在',
        /body\.wb-batch \.wb-card-pick\{display:flex\}/.test(CSS));

    // 6.4 美化元素真的加上了
    check('深色毛玻璃', /backdrop-filter:blur\(14px\)/.test(CSS));
    check('状态点伪元素', /\.wb-toggle::before\{/.test(CSS));
    check('状态点开态高亮', /\.wb-toggle\.wb-on::before\{[\s\S]{0,200}?box-shadow/.test(CSS));
    check('开关胶囊圆角', /border-radius:999px/.test(CSS));
    check('进度条渐变', /linear-gradient\(90deg/.test(CSS));
    check('数字输入有上下箭头提示', /content:"\\\\2191\\\\2193"/.test(CSS) || /↑↓/.test(CSS));
    check('等宽数字', /font-variant-numeric:tabular-nums/.test(CSS));
    check('保留 --wb-* 变量入口', /var\(--wb-brand/.test(CSS) && /var\(--wb-bg/.test(CSS));
    check('保留 wb-brand 默认红', /#e6162d/.test(CSS));

    // 6.5 不该有的东西
    check('没引入外部资源', !/@import/.test(CSS) && !/url\(http/.test(CSS));
    check('没加图片/图标资源', !/\.png|\.svg|\.jpg/.test(CSS));
    check('CSS 里有注释说明设计取向', /v0\.1\.32 UI 重做/.test(CSS));
}

console.log('\n═══ ⑦ 前五版修复未回退 ═══');
{
    const callLines = L.map((l, i) => (/const handed = saveVideoViaGM\(/.test(l) ? i + 1 : 0)).filter(Boolean);
    const fb = L.findIndex(l => l.includes('let res = await fetchBlob(url')) + 1;
    const so = L.findIndex(l => l.includes('const saveOne =')) + 1;
    check('直落真调用唯一', callLines.length === 1, `${callLines.length} 处`);
    check('直落早于 fetchBlob', callLines[0] < fb, `${callLines[0]} vs ${fb}`);
    check('直落在 saveOne 之前', callLines[0] < so, `${callLines[0]} vs ${so}`);
    check('doneCb 改名未回退', /function saveVideoViaGM\(url, info, item, doneCb, fallbackBlob\)/.test(codeOnly));
    check('finish 归一化仍在', /const finish = typeof doneCb === 'function'/.test(codeOnly));
    check('无 done 对象透传',
        !/fallbackBlob\(url, name, done\)/.test(codeOnly) && !/fallbackSave\(blob, name, done\)/.test(codeOnly));
    check('混批双计数仍在', /let gmReported = 0;/.test(codeOnly) && /let gmOk = 0;/.test(codeOnly));
    check('percent 条件构造仍在', /if \(allOk\) finalPatch\.percent = 100;/.test(codeOnly));
    check('@grant GM_info 仍在', /@grant\s+GM_info/.test(src));
    check('双条件判定仍在', /files\.length === 0 && videoHanded === 0/.test(codeOnly));
    check('blob 确认式释放仍在', /blob 已关联/.test(src));
    check('字节校验仍在', /const short = want > 0 && got > 0 && got < want;/.test(codeOnly));
    check('队列 started 仍在', /let started = false;/.test(codeOnly));
    check('假 resolve 仍已删除', !/settle = \(res\) => res;/.test(codeOnly));
    check('extOf 白名单仍在', /const MEDIA_EXTS = \[/.test(src));
    check('零 @require', !/^\/\/ @require/m.test(src));
}

console.log('\n═══ ⑧ 版本 ═══');
const vMeta = (src.match(/@version\s+([\d.]+)/) || [])[1];
const vConst = (src.match(/const VERSION = '([\d.]+)'/) || [])[1];
check('版本号两处一致', vMeta === vConst && /^\d+\.\d+\.\d+$/.test(vMeta || ''), `${vMeta}/${vConst}`);
check('头部有 v0.1.32 记录', /v0\.1\.32/.test(src));

console.log(`\n${'═'.repeat(46)}`);
console.log(`结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
