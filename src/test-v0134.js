// v0.1.34 回归：命名骨架统一到跨平台家族规范（6 段）
//   微博#{author}#{mblogid}#{date}#{time}#{index}
//   = 平台名#作者#帖子id#日期#时间#序号
//
// 加载方式：剥掉 IIFE 包裹后整体执行，让 renderName / extractInfo / stampParts
// 在同一作用域里互相可见（跟 test-v013.js 同一手法 —— 逐函数 eval 交叉引用全断）。
// 关键：**真跑真实代码**，不复制一份渲染逻辑到测试里（复制品会跟源码漂）。
const fs = require('fs');
const { execFileSync } = require('child_process');
const P = require('./_target.js').TARGET;
const src = fs.readFileSync(P, 'utf8');

// ── TZ 探针子进程模式：只渲染一次并用标记行输出，供父进程比对 ──
// （文件名不能跟机器时区漂：同一 created_at 在任何 TZ 下必须渲染出同一个名字）
if (process.argv[2] === '--tz-probe') {
    const body0 = src
        .replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/, '')
        .replace(/\(function \(\) \{/, '')
        .replace(/\}\)\(\);\s*$/, '');
    const store0 = { wb_enable: false, wb_config_stamp: 'seeded' };
    const WB0 = new Function(
        'GM_getValue', 'GM_setValue', 'GM_addStyle', 'GM_registerMenuCommand',
        'GM_unregisterMenuCommand', 'GM_xmlhttpRequest', 'GM_download', 'alert', 'window',
        body0 + ';return { renderName, extractInfo };'
    );
    const wb0 = WB0(
        (k, d) => (k in store0 ? store0[k] : d),
        (k, v) => { store0[k] = v; },
        () => {}, () => 0, () => {}, () => {}, () => {}, () => {},
        { prompt: () => null }, {}
    );
    const st = {
        created_at: 'Thu Oct 15 18:30:00 +0800 2026',
        mblogid: '5054321987654321',
        user: { screen_name: '腐团儿Ikaros', idstr: '5054321987654321' },
    };
    console.log('PROBE::' + wb0.renderName(wb0.extractInfo(st), '01', 'jpg'));
    process.exit(0);
}

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}${e ? ' → ' + e : ''}`); } };

// ── 载入真实脚本（剥 IIFE + 桩掉 GM/DOM 副作用）──
const body = src
  .replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/, '')
  .replace(/\(function \(\) \{/, '')
  .replace(/\}\)\(\);\s*$/, '');

function loadScript(seed) {
    // 种子 wb_enable=false（不触发 boot()，无 DOM 会报错）+ wb_config_stamp=当前版本
    // （不触发配置迁移日志）→ 测试输出干净，失败行一眼看得懂
    const ver = (src.match(/const VERSION = '([\d.]+)'/) || [])[1] || 'x';
    const store = Object.assign({ wb_enable: false, wb_config_stamp: ver }, seed || {});
    const WB = new Function(
        'GM_getValue', 'GM_setValue', 'GM_addStyle', 'GM_registerMenuCommand',
        'GM_unregisterMenuCommand', 'GM_xmlhttpRequest', 'GM_download', 'alert', 'window',
        body + ';return { renderName, extractInfo, cleanName, stampParts, NAME_TPL_DEFAULT, NAME_TPL_FIELDS, nameTemplate };'
    );
    return WB(
        (k, d) => (k in store ? store[k] : d),
        (k, v) => { store[k] = v; },
        () => {}, () => 0, () => {}, () => {}, () => {}, () => {},
        { prompt: () => null }, {}
    );
}
const wb = loadScript();

console.log('\n═══ ① 默认模板（6 段骨架）═══');
check('默认模板 = 微博#{author}#{mblogid}#{date}#{time}#{index}',
    wb.NAME_TPL_DEFAULT === '微博#{author}#{mblogid}#{date}#{time}#{index}',
    wb.NAME_TPL_DEFAULT);
check('源码里同步', /const NAME_TPL_DEFAULT = '微博#\{author\}#\{mblogid\}#\{date\}#\{time\}#\{index\}'/.test(src));
check('骨架顺序：作者 → id → 日期 → 时间 → 序号',
    /\{author\}#\{mblogid\}#\{date\}#\{time\}#\{index\}/.test(wb.NAME_TPL_DEFAULT),
    wb.NAME_TPL_DEFAULT);
check('id 段在作者之后、日期之前',
    wb.NAME_TPL_DEFAULT.indexOf('{author}') < wb.NAME_TPL_DEFAULT.indexOf('{mblogid}') &&
    wb.NAME_TPL_DEFAULT.indexOf('{mblogid}') < wb.NAME_TPL_DEFAULT.indexOf('{date}'),
    wb.NAME_TPL_DEFAULT);
check('模板里不写扩展名（落盘层自动补）', !wb.NAME_TPL_DEFAULT.includes('{ext}'), wb.NAME_TPL_DEFAULT);

console.log('\n═══ ② 占位符清单 ═══');
['author', 'username', 'mblogid', 'date', 'time', 'datetime', 'uid', 'index', 'ext'].forEach((f) => {
    check(`{${f}} 已登记`, wb.NAME_TPL_FIELDS.includes(f), JSON.stringify(wb.NAME_TPL_FIELDS));
});

console.log('\n═══ ③ 真跑：渲染出目标文件名 ═══');
const STATUS = {
    created_at: 'Thu Oct 15 18:30:00 +0800 2026',
    mblogid: '5054321987654321',
    user: { screen_name: '腐团儿Ikaros', idstr: '5054321987654321' },
};
const info = wb.extractInfo(STATUS);
check('date = YYYYMMDD', info.date === '20261015', info.date);
check('time = HHMMSS', info.time === '183000', info.time);
check('datetime 保留老格式', info.datetime === '2026-10-15 18:30', info.datetime);
check('mblogid 取到', info.mblogid === '5054321987654321', info.mblogid);

const rendered = wb.renderName(info, '01', 'jpg');
check('渲染 = 微博#腐团儿Ikaros#5054321987654321#20261015#183000#01.jpg',
    rendered === '微博#腐团儿Ikaros#5054321987654321#20261015#183000#01.jpg', rendered);
check('id 段在作者后面、日期前面（位置断言）',
    rendered.indexOf('#腐团儿Ikaros#') === rendered.indexOf('#') &&
    rendered.indexOf('#腐团儿Ikaros#5054321987654321#') >= 0 &&
    rendered.indexOf('#5054321987654321#20261015#') >= 0, rendered);
check('序号两位补零', wb.renderName(info, '01', 'jpg').endsWith('#01.jpg'), rendered);
check('序号 10 不补成 010', wb.renderName(info, '10', 'jpg').endsWith('#10.jpg'),
    wb.renderName(info, '10', 'jpg'));

console.log('\n═══ ④ 扩展名兜底（模板没写 {ext}，落盘层必须补上）═══');
check('jpg 自动补', wb.renderName(info, '01', 'jpg').endsWith('.jpg'));
check('mp4 自动补', wb.renderName(info, '01', 'mp4').endsWith('.mp4'));
check('gif 自动补', wb.renderName(info, '02', 'gif').endsWith('.gif'));
check('不会出「没扩展名」的名字',
    /\.[A-Za-z0-9]{2,4}$/.test(wb.renderName(info, '01', 'jpg')), wb.renderName(info, '01', 'jpg'));
check('扩展名只出现一次', (wb.renderName(info, '01', 'jpg').match(/\./g) || []).length === 1,
    wb.renderName(info, '01', 'jpg'));

console.log('\n═══ ⑤ -live 后缀必须在扩展名之前 ═══');
{
    const base = wb.renderName(info, '01', 'mp4');
    const live = base.replace(/\.[A-Za-z0-9]{2,4}$/, '') + '-live.mp4';
    check('live 名 = …#01-live.mp4', live === '微博#腐团儿Ikaros#5054321987654321#20261015#183000#01-live.mp4', live);
    check('不是 .mp4-live', !live.includes('.mp4-live'), live);
    check('live 在扩展名之前', live.indexOf('-live.') < live.indexOf('.mp4'), live);
    check('源码落盘层逻辑一致',
        src.includes("base.replace(/\\.[A-Za-z0-9]{2,4}$/, '') + `-live.${ext}`"));
}

console.log('\n═══ ⑥ 转发微博：id / 日期 / 时间 全部取原博 ═══');
{
    const rt = {
        created_at: 'Mon Oct 12 10:00:00 +0800 2026',
        mblogid: '9999999999999999',
        user: { screen_name: '转发者', idstr: '111' },
        retweeted_status: {
            created_at: 'Thu Oct 15 18:30:00 +0800 2026',
            mblogid: '5054321987654321',
            user: { screen_name: '腐团儿Ikaros', idstr: '5054321987654321' },
        },
    };
    const ri = wb.extractInfo(rt);
    check('昵称取原博主', ri.userName === '腐团儿Ikaros', ri.userName);
    check('id 取原博主', ri.mblogid === '5054321987654321', ri.mblogid);
    check('日期取原博主', ri.date === '20261015', ri.date);
    check('时间取原博主', ri.time === '183000', ri.time);
    const r = wb.renderName(ri, '01', 'jpg');
    check('转发命名整串一致',
        r === '微博#腐团儿Ikaros#5054321987654321#20261015#183000#01.jpg', r);
}

console.log('\n═══ ⑦ {author} 与 {username} 等价（老模板不失效）═══');
{
    // 用户**自己改过**的模板（≠ 旧默认串）必须原样保留、不被迁移
    const CUSTOM = '微博#{username}-{uid}#{index}';
    const custom = loadScript({ wb_name_template: CUSTOM });
    check('ctx 里 author 与 username 两个 key 都在',
        /author: info\.userName,/.test(src) && /username: info\.userName,/.test(src));
    check('{author} 与 {username} 指向同一字段（同值）',
        info.userName === '腐团儿Ikaros', info.userName);
    check('自定义老模板原样保留（不被迁移）',
        custom.renderName(info, '01', 'jpg') === '微博#腐团儿Ikaros-5054321987654321#01.jpg',
        custom.renderName(info, '01', 'jpg'));
    check('老模板里的 {username} 仍取到用户名',
        custom.renderName(info, '01', 'jpg').includes('腐团儿Ikaros'),
        custom.renderName(info, '01', 'jpg'));
}

console.log('\n═══ ⑧ 时区无关（文件名不跟机器时区漂）═══');
{
    // 同一份 created_at（+0800），在 UTC 与 Asia/Shanghai 两种 TZ 下必须渲染出同一个名字
    const run = (tz) => {
        const out = execFileSync(process.execPath, [__filename, '--tz-probe', tz], {
            encoding: 'utf8', env: Object.assign({}, process.env, { TZ: tz }),
        });
        const line = out.split('\n').find((l) => l.startsWith('PROBE::'));
        return line ? line.slice('PROBE::'.length).trim() : `NO_PROBE_OUTPUT:${out.trim()}`;
    };
    const utc = run('UTC');
    const sh = run('Asia/Shanghai');
    const ny = run('America/New_York');
    check('TZ=UTC 渲染正确',
        utc === '微博#腐团儿Ikaros#5054321987654321#20261015#183000#01.jpg', utc);
    check('TZ=Asia/Shanghai 渲染相同', sh === utc, `${sh} ≠ ${utc}`);
    check('TZ=America/New_York 渲染相同', ny === utc, `${ny} ≠ ${utc}`);
}

console.log('\n═══ ⑨ cleanName 不吃掉分隔符 # ═══');
{
    check('模板字面量 # 保留', wb.cleanName('微博#作者#id#01.jpg') === '微博#作者#id#01.jpg',
        wb.cleanName('微博#作者#id#01.jpg'));
    check('数据字段里的 # 也保留（无害）', wb.cleanName('a#b') === 'a#b', wb.cleanName('a#b'));
    check('非法字符仍被清洗', wb.cleanName('a/b:c') === 'a／b：c', wb.cleanName('a/b:c'));
}

console.log('\n═══ ⑩ 老默认模板迁移（真跑）═══');
{
    // 场景：旧版用户点过「恢复默认命名模板」→ GM 里存的是旧默认串
    const legacy = loadScript({ wb_name_template: '微博#{username}#{uid}#{index}.{ext}' });
    const out = legacy.renderName(info, '01', 'jpg');
    check('旧默认串渲染出的是**新骨架**（迁移生效）',
        out === '微博#腐团儿Ikaros#5054321987654321#20261015#183000#01.jpg', out);
    check('源码有迁移分支', /NAME_TPL_LEGACY_DEFAULT/.test(src));
    check('迁移只针对旧默认串（自定义模板不动）',
        /if \(nameTemplate === NAME_TPL_LEGACY_DEFAULT\)/.test(src));
    check('迁移后写回 GM（持久化）', /GM_setValue\(NAME_TPL_KEY, nameTemplate\)/.test(src));
}

console.log('\n═══ ⑪ 版本 & 静态 ═══');
const vMeta = (src.match(/@version\s+([\d.]+)/) || [])[1];
const vConst = (src.match(/const VERSION = '([\d.]+)'/) || [])[1];
check('版本号两处一致（动态比对，不写死版本）',
    vMeta === vConst && /^[\d.]+$/.test(vMeta || ''), `${vMeta}/${vConst}`);
check('文件名版本与 @version 一致',
    require('./_target.js').VERSION === vMeta,
    `${require('./_target.js').VERSION} vs ${vMeta}`);
check('头部有 v0.1.34 记录', /v0\.1\.34 变更/.test(src));
check('零 @require', !/^\/\/ @require/m.test(src));
check('GM_download grant 仍在', /@grant\s+GM_download/.test(src));
check('live 后缀逻辑未回退',
    src.includes("+ `-live.${ext}`") && !/renderName\(info, item\.index, ext\) \+ \(item\.isLive \? '-live' : ''\)/.test(src));
check('extOf 白名单仍在（既有逻辑未动）', /const MEDIA_EXTS = \[/.test(src));

console.log(`\n${'═'.repeat(46)}`);
console.log(`结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
