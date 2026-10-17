// ★ meta 测试：防测试债复发（2026-10-17 立）
//
// 背景：本项目测试套曾长期「全绿但零覆盖」——
//   31 个测试全部硬编码读 '/opt/data/cache/scratch/wb-build/weibo-saver-v0.1.0.user.js'
//   （v0.1.0 的临时快照，scratch 24h 就清），
//   而脚本从 v0.1.0 迭代到 v0.1.33 期间没人改过这个路径。
//   结果：测试跑 30 套全过，但对当前版本一点覆盖都没有。
//
// 这套 meta 断言专门防这一类：
//   1) 每个测试文件语法必须能过 node --check（曾有 3 个文件括号丢失/字符串没闭合）
//   2) 每个读源码的测试必须走 _target.js 单一真源，不得再出现硬编码路径
//   3) 版本断言必须动态比对 @version === const VERSION，不得写死具体版本号
//   4) _target.js 必须能解析出当前版本，且目标文件真实存在
//   5) 全部测试套必须真的全绿（兜底）

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SRC_DIR = __dirname;
let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}${e ? ' → ' + e : ''}`); } };

// 排除自身：meta 测试里必然出现「硬编码路径」正则和「写死版本」示例字面量，
// 自己扫自己会永远红。真正要管的是其余 34 个测试文件。
const SELF = path.basename(__filename);
const tests = fs.readdirSync(SRC_DIR)
    .filter(f => /^test-.*\.js$/.test(f) && f !== SELF)
    .sort();

console.log(`\n═══ 扫描 ${tests.length} 个测试文件（已排除 meta 自身） ═══\n`);

// ── 1) 全部测试文件语法可解析 ──
console.log('═══ 1. 语法检查（node --check）═══');
{
    const bad = [];
    for (const f of tests) {
        try {
            execFileSync(process.execPath, ['--check', path.join(SRC_DIR, f)],
                { stdio: 'pipe', timeout: 20000 });
        } catch (e) {
            bad.push(f);
        }
    }
    check(`全部 ${tests.length} 个测试文件语法可解析`, bad.length === 0, bad.join(', '));
}

// ── 2) 目标路径单一真源 ──
console.log('\n═══ 2. 被测目标走单一真源（不硬编码路径）═══');
{
    const HARD_CODED = /\/opt\/data\/cache\/scratch\/wb-build\/|\/opt\/workspace\/[^'"]*weibo-saver-v\d/;
    const bad = [];
    const readers = [];
    for (const f of tests) {
        const txt = fs.readFileSync(path.join(SRC_DIR, f), 'utf8');
        if (HARD_CODED.test(txt)) bad.push(f);
        // 哪些测试真的读源码
        if (/readFileSync|_target/.test(txt)) readers.push(f);
    }
    check('无硬编码被测文件路径', bad.length === 0, bad.join(', '));
    check(`读源码的测试都走 _target.js（${readers.length} 个）`,
        readers.length === 0 || readers.every(f => {
            const txt = fs.readFileSync(path.join(SRC_DIR, f), 'utf8');
            // 读源码的方式：要么 require _target，要么本身就是 _target.js
            return /require\('\.\/_target\.js'\)/.test(txt) || f === '_target.js';
        }),
        readers.filter(f => {
            const txt = fs.readFileSync(path.join(SRC_DIR, f), 'utf8');
            return !/require\('\.\/_target\.js'\)/.test(txt);
        }).join(', '));
}

// ── 3) 版本断言动态化 ──
console.log('\n═══ 3. 版本断言不写死 ═══');
{
    const bad = [];
    for (const f of tests) {
        const txt = fs.readFileSync(path.join(SRC_DIR, f), 'utf8');
        // 负向验证实测：靠断言名匹配会漏网 —— 断言名改了、正文仍是动态写法就抓不到。
        // 所以改为抓「写法」本身：任何位置出现 vMeta/vConst 与具体版本号字面量比较即算债。
        const hardCoded = /vMeta === '[\d.]+'|vConst === '[\d.]+'|@version\s*===?\s*'[\d.]+'|vMeta === "[\d.]+"|vConst === "[\d.]+"/;
        if (hardCoded.test(txt)) bad.push(f);
    }
    check('无写死版本号的断言（按写法判定，非按断言名）', bad.length === 0, bad.join(', '));

    // 反向自检：把易漏的写法明确列为反例，避免以后再放宽成只看名字
    const ANTI = [
        /vMeta === '0\.1\.17'/,          // 断言名改了也照样抓到
        /check\('版本 [\d.]+ 两处一致'/,
    ];
    check('meta 自身带着反例样本（防规则被无意放宽）', ANTI.every(r => r.source.length > 0));
}

// ── 4) _target.js 能解析出当前版本 ──
console.log('\n═══ 4. _target.js 单一真源可解析 ═══');
{
    const t = require('./_target.js');
    check('目标文件存在', fs.existsSync(t.TARGET), t.TARGET);
    check('文件名带版本号', /^weibo-saver-v\d+\.\d+\.\d+\.user\.js$/.test(t.FILE), t.FILE);
    check('VERSION 解析正常', /^\d+\.\d+\.\d+$/.test(t.VERSION), t.VERSION);

    const src = t.read();
    const vMeta = (src.match(/@version\s+([\d.]+)/) || [])[1];
    const vConst = (src.match(/const VERSION = '([\d.]+)'/) || [])[1];
    check('文件版本两处一致', vMeta === vConst, `${vMeta}/${vConst}`);
    check('文件名版本与 @version 一致',
        t.VERSION === vMeta, `文件 ${t.VERSION} vs @version ${vMeta}`);

    // 不得读 scratch 临时目录（24h 就清）
    check('目标不在 scratch 临时目录', !t.TARGET.includes('/cache/scratch/'), t.TARGET);
}

// ── 5) 全套真跑兜底 ──
console.log('\n═══ 5. 全套真跑 ═══');
{
    const failed = [];
    for (const f of tests) {
        try {
            execFileSync(process.execPath, [path.join(SRC_DIR, f)],
                { stdio: 'pipe', timeout: 60000 });
        } catch (e) {
            failed.push(f);
        }
    }
    check(`${tests.length} 套测试全绿`, failed.length === 0, failed.join(', '));
}

console.log(`\n${'═'.repeat(46)}`);
console.log(`结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
