// v0.1.10 回归：修复 .mp4-live.bin 假扩展名
const fs = require('fs');
const P = require('./_target.js').TARGET;
const src = fs.readFileSync(P, 'utf8');
const codeOnly = src.split('\n').filter(l => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}${e ? ' → ' + e : ''}`); } };

// 抽函数真跑
eval(src.match(/function safeDownloadName\(name\) \{[\s\S]*?\n    \}/)[0]);

console.log('\n═══ 核心修复：live 命名 ═══');
check('不再把 -live 追加到文件名末尾',
    !codeOnly.includes("renderName(info, item.index, ext) + (item.isLive ? '-live' : '')"));
check('-live 插在扩展名前', src.includes("+ `-live.${ext}`"));
check('用 base.replace 摘掉扩展名再拼', src.includes("base.replace(/\\.[A-Za-z0-9]{2,4}$/, '')"));

console.log('\n═══ safeDownloadName 行为（真跑）═══');
const cases = [
    // [输入, 期望, 说明]
    ['微博#奶油不肉#5506998232#03.mp4', '微博#奶油不肉#5506998232#03.mp4', '普通视频'],
    ['微博#奶油不肉#5506998232#03.mp4-live', '微博#奶油不肉#5506998232#03.mp4', '★ 本次 bug 的输入'],
    ['微博#a#1#02-live.mp4', '微博#a#1#02-live.mp4', '正确形态不动'],
    ['微博#a#1#03.jpg', '微博#a#1#03.jpg', '普通图片'],
    ['a.jpg', 'a.jpg', '简单名'],
    ['a.JPG', 'a.jpg', '大写扩展名转小写'],
    ['a.用户-时间', 'a.用户-时间.bin', '中文伪扩展名 → .bin'],
    ['', 'weibo.bin', '空名兜底'],
    ['#01.part', '#01.part', '.part 是合法 4 位扩展名'],
];
cases.forEach(([inp, want, note]) => {
    const got = safeDownloadName(inp);
    check(`${note}: ${JSON.stringify(inp).slice(0, 40)}`, got === want, `得到 ${got}，期望 ${want}`);
});

console.log('\n═══ 端到端命名链（真跑）═══');
{
    const INVALID = {'\\':'＼','/':'／','|':'｜','<':'＜','>':'＞',':':'：','*':'＊','?':'？','"':'＂',"'":'＇','‌':'','‍':'','⁠':'','﻿':'','\n':' ','\r':' ','\t':' '};
    const cleanName = (x) => String(x == null ? '' : x).split('').map(c => INVALID[c] !== undefined ? INVALID[c] : c).join('').replace(/\s+/g, ' ').trim();
    const renderName = (tpl, info, index, ext) => {
        const ctx = { username: info.userName, uid: info.userID, mblogid: info.mblogid, time: info.time, index, ext };
        let n = String(tpl).replace(/\{(\w+)\}/g, (m, k) => { const v = ctx[k]; return v == null || v === '' ? 'x' : String(v); });
        n = cleanName(n);
        if (!n || n === 'x') n = '微博-' + (info.mblogid || 'unknown');
        if (ext && !/\.[A-Za-z0-9]{2,4}$/.test(n)) n += '.' + ext;
        return n.slice(0, 180);
    };
    const TPL = '微博#{username}#{uid}#{index}.{ext}';
    const info = { userName: '奶油不肉', userID: '5506998232', mblogid: 'Xyz' };

    const e2e = [
        ['普通图片', false, 'jpg', '微博#奶油不肉#5506998232#03.jpg'],
        ['普通视频', false, 'mp4', '微博#奶油不肉#5506998232#03.mp4'],
        ['live视频', true, 'mp4', '微博#奶油不肉#5506998232#03-live.mp4'],
        ['live图片', true, 'jpg', '微博#奶油不肉#5506998232#03-live.jpg'],
    ];
    e2e.forEach(([label, isLive, ext, want]) => {
        const base = renderName(TPL, info, '03', ext);
        const name = isLive ? base.replace(/\.[A-Za-z0-9]{2,4}$/, '') + `-live.${ext}` : base;
        const got = safeDownloadName(name);
        check(label, got === want, `得到 ${got}，期望 ${want}`);
    });

    check('live 名字里没有 x（ext 降级问题）',
        !safeDownloadName(renderName(TPL, info, '03', 'mp4').replace(/\.[A-Za-z0-9]{2,4}$/, '') + '-live.mp4').includes('x'));
    check('所有产物扩展名合法（无 .bin 兜底）',
        e2e.every(([, , ext]) => safeDownloadName(renderName(TPL, info, '01', ext)).endsWith('.' + ext)));
}

console.log('\n═══ 版本 & 老功能 ═══');
const vMeta = (src.match(/@version\s+([\d.]+)/) || [])[1];
const vConst = (src.match(/const VERSION = '([\d.]+)'/) || [])[1];
check('版本号两处一致（动态比对，不写死版本）',
    vMeta === vConst && /^\d+\.\d+\.\d+$/.test(vMeta || ''), `${vMeta}/${vConst}`);
check('头部有 v0.1.10 历史记录', /v0\.1\.10 变更/.test(src));
check('命名模板默认值未动', /const NAME_TPL_DEFAULT = '微博#\{username\}#\{uid\}#\{index\}\.\{ext\}'/.test(src));
check('落盘错峰未动', /i \+= batchSize/.test(src));
check('三路识别未动', /DIAG\.href/.test(src) && /DIAG\.attr/.test(src) && /DIAG\.media/.test(src));
check('GM_download 在', /@grant\s+GM_download/.test(src));
check('零 @require', !/^\/\/ @require/m.test(src));

console.log(`\n${'═'.repeat(46)}`);
console.log(`结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
