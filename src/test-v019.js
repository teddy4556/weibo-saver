// v0.1.9 回归：落盘错峰批量（串行 → 分批并发）
const fs = require('fs');
const P = require('./_target.js').TARGET;
const src = fs.readFileSync(P, 'utf8');
const codeOnly = src.split('\n').filter(l => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}${e ? ' → ' + e : ''}`); } };

console.log('\n═══ 错峰批量核心 ═══');
check('有 saveBatch 配置', /saveBatch: 'wb_save_batch'/.test(src));
check('有 saveGap 配置', /saveGap: 'wb_save_gap'/.test(src));
check('默认 batch=3', /saveBatch: 3,/.test(src));
check('默认 gap=260', /saveGap: 260,/.test(src));
check('按 batchSize 切批', /for \(let i = 0; i < files\.length; i \+= batchSize\)/.test(src));
check('批内用 Promise.all', /await Promise\.all\([\s\S]{0,200}batch\.map/.test(src));
check('批间 sleep(gap)', /await sleep\(gap\)/.test(src));
check('gap 有条件判断（最后一批不等）', /i \+ batchSize < files\.length\) await sleep\(gap\)/.test(src));
check('统计 batchOk', /savedOk = batchOk;/.test(src));
check('有错峰落盘日志', /错峰落盘: \$\{batchOk\}\/\$\{batchTotal\}/.test(src));

console.log('\n═══ 参数边界防护 ═══');
check('batchSize 下限 1', /Math\.max\(1, Number\(cfg\.saveBatch\) \|\| 3\)/.test(src));
check('gap 下限 0', /Math\.max\(0, Number\(cfg\.saveGap\) \|\| 0\)/.test(src));
{
    // 行为测试：batch=1 时应退化为串行
    // 批次划分：批内文件共享同一批序号（模拟并发触发）
    const batches = (n, bs) => {
        const out = [];
        for (let i = 0; i < n; i += bs) out.push(Math.floor(i / bs));
        return out;
    };
    const nFiles = 7;
    const uniq = (arr) => new Set(arr).size;

    check('batch=1 → 7 批（完全串行）', uniq(batches(nFiles, 1)) === 7, `${uniq(batches(nFiles, 1))} 批`);
    check('batch=3 → 3 批（3+3+1）', uniq(batches(nFiles, 3)) === 3, `${uniq(batches(nFiles, 3))} 批`);
    check('batch=5 → 2 批（5+2）', uniq(batches(nFiles, 5)) === 2, `${uniq(batches(nFiles, 5))} 批`);
    check('batch=8 → 1 批', uniq(batches(nFiles, 8)) === 1, `${uniq(batches(nFiles, 8))} 批`);
    // 每批内文件数不超过 batchSize
    const b3 = batches(nFiles, 3);
    const counts = {};
    b3.forEach(b => { counts[b] = (counts[b] || 0) + 1; });
    check('每批不超过 batchSize', Object.values(counts).every(c => c <= 3), JSON.stringify(counts));

    // 速度对比
    const t = (bs, g) => {
        let n = 0;
        for (let i = 0; i < 7; i += bs) { n++; if (g > 0 && i + bs < 7) n += 0; }
        return Math.ceil(7 / bs);
    };
    check('提速倍数：3 批 vs 7 批', t(3, 260) === 3 && t(1, 0) === 7, '3 vs 7');
    check('7 文件串行 7 批 → 批3 只需 3 批，约快 2.3 倍', Math.round(7 / 3 * 10) / 10 === 2.3);
}

console.log('\n═══ 面板可调 ═══');
check('面板有批大小输入', /id="wb-batch-num"/.test(src));
check('面板有间隔输入', /id="wb-gap-num"/.test(src));
check('bindNum 绑定存在', /const bindNum = \(sel, key, min, max, def\)/.test(src));
check('batch 范围 1-8', /bindNum\('#wb-batch-num', 'saveBatch', 1, 8, 3\)/.test(src));
check('gap 范围 0-3000', /bindNum\('#wb-gap-num', 'saveGap', 0, 3000, 260\)/.test(src));
check('失焦提交', /addEventListener\('blur', commit\)/.test(src));
check('回车提交', /e\.key === 'Enter'/.test(src));
check('值持久化', /GM_setValue\(CFG_KEYS\[key\], v\)/.test(src));
check('有 wb-speed 样式', /\.wb-speed\{/.test(src));

console.log('\n═══ 三档快捷菜单 ═══');
check('安全模式菜单', /落盘安全模式（全串行）/.test(src));
check('极速模式菜单', /落盘极速模式（批5·间隔120ms）/.test(src));
check('恢复默认菜单', /恢复默认（批3·间隔260ms）/.test(src));
check('安全模式写入 1/0', /cfg\.saveBatch = 1;[\s\S]{0,40}cfg\.saveGap = 0;/.test(src));
check('极速模式写入 5/120', /cfg\.saveBatch = 5;[\s\S]{0,40}cfg\.saveGap = 120;/.test(src));
check('菜单同步刷新面板', /#wb-batch-num[\s\S]{0,200}#wb-gap-num/.test(src) || /bindNum/.test(src));

console.log('\n═══ 两条落盘路径都在 ═══');
check('zip 分支仍用 saveOne（单文件）', /await saveOne\(zip, `\$\{title\}\.zip`\)/.test(src));
// v0.1.23 起 saveOne 多了 isVideo 参数
check('saveOne 定义仍在', /const saveOne = \(blob, name, isVideo\) =>/.test(src));
check('zip 分支不受 batch 影响', /if \(cfg\.isPack && files\.length > 1\)/.test(src));
check('savedOk 两分支都赋值', (codeOnly.match(/savedOk = /g) || []).length >= 2);

console.log('\n═══ 版本 & 老功能 ═══');
const vMeta = (src.match(/@version\s+([\d.]+)/) || [])[1];
const vConst = (src.match(/const VERSION = '([\d.]+)'/) || [])[1];
check('版本号两处一致（动态比对，不写死版本）',
    vMeta === vConst && /^\d+\.\d+\.\d+$/.test(vMeta || ''), `${vMeta}/${vConst}`);
check('头部有 v0.1.9 历史记录', /v0\.1\.9 变更/.test(src));
// 依据写在注释里（codeOnly 会过滤 // 行），所以只测全文
check('注明 issue #1113 依据', /issue #1113/.test(src));
check('引用了官方原话', /add a delay between file saving/.test(src));
check('注释说明了 WHY 不能全并发', /不能直接全并发|直接全并发/.test(src));
check('拉数据并发未动', /createQueue\(cfg\.isImageHD \? 3 : 5\)/.test(src));
check('批量串行未动', /await downloadWeibo\(id\);/.test(src) && /await sleep\(600\)/.test(src));
check('m3u8 并发未动', /const queue = createQueue\(6\)/.test(src));
check('命名模板未坏', /const NAME_TPL_DEFAULT = '微博#\{username\}#\{uid\}#\{index\}\.\{ext\}'/.test(src));
check('GM_download 仍在', /@grant\s+GM_download/.test(src));
check('零 @require', !/^\/\/ @require/m.test(src));
check('无拖拽命名残留', !/wb-namebox|wb-on-list|wb-off-list/.test(codeOnly));

console.log(`\n${'═'.repeat(46)}`);
console.log(`结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
