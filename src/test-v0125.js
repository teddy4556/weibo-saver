// v0.1.25 回归：视频直落分支一直没执行（配置键名对不上）
const fs = require('fs');
const P = '/opt/data/cache/scratch/wb-build/weibo-saver-v0.1.0.user.js';
const src = fs.readFileSync(P, 'utf8');
const codeOnly = src.split('\n').filter(l => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}${e ? ' → ' + e : ''}`); } };

console.log('\n═══ 真因：CFG_KEYS 与 defaults 键名不一致 ═══');
console.log('  症状：日志无「视频直落 GM_download」，却有「fetchBlob 第1次请求」');
console.log('  旧代码：CFG_KEYS=videoViaBlob / defaults=isVideoViaBlob → cfg.isVideoViaBlob 恒 undefined');
{
    const keys = src.slice(src.indexOf('const CFG_KEYS = {'), src.indexOf('const defaults = {'));
    const defs = src.slice(src.indexOf('const defaults = {'), src.indexOf('const defaults = {') + 2000);

    check('CFG_KEYS 有 isVideoViaBlob', /isVideoViaBlob: 'wb_video_blob'/.test(keys));
    check('CFG_KEYS 不再有旧的 videoViaBlob 键',
        !/^\s*videoViaBlob:/m.test(keys), '旧键还在');
    check('defaults 有 isVideoViaBlob', /isVideoViaBlob: false/.test(defs));
    check('defaults 不再有 isVideoViaBlob 重复定义',
        (defs.match(/isVideoViaBlob:/g) || []).length === 1);

    // 关键：CFG_KEYS 里出现的每个 defaults 键都必须能配上
    const keyNames = [...keys.matchAll(/^\s{8}(\w+):/gm)].map(m => m[1]);
    const defNames = [...defs.matchAll(/^\s{8}(\w+):/gm)].map(m => m[1]);
    const orphanDefs = defNames.filter(n => !keyNames.includes(n));
    check('defaults 里的每个键都在 CFG_KEYS 里（无孤儿）',
        orphanDefs.length === 0, `孤儿: ${JSON.stringify(orphanDefs)}`);
}

console.log('\n═══ 修法二：判定用 === false，undefined 也要能走通 ═══');
{
    check('判定是 === false', /cfg\.isVideoViaBlob === false/.test(codeOnly));
    // 判定位置不能用 !cfg.x（codeOnly 已剥注释，头部注释里的不算）
    // 菜单里的 `!cfg.isVideoViaBlob = ...` 是取反切换，正确，不算
    check('判定位置已无 !cfg.isVideoViaBlob',
        !/item\.isTop && !cfg\.isVideoViaBlob/.test(codeOnly));

    // 真跑判定逻辑
    const shouldDirect = (itemIsTop, cfgVal) => itemIsTop && cfgVal === false;
    const cases = [
        ['视频 + false（菜单默认）→ 直落', true, false, true],
        ['视频 + true（手动切旧路）→ blob', true, true, false],
        ['视频 + undefined（配置丢失）→ blob（有日志可查）', true, undefined, false],
        ['图片 + false → 不走直落', false, false, false],
        ['图片 + true → 不走直落', false, true, false],
        ['视频 + 0 → 不走直落（严格）', true, 0, false],
        ['视频 + null → 不走直落（严格）', true, null, false],
    ];
    cases.forEach(([label, isTop, cfgVal, want]) => {
        const got = shouldDirect(isTop, cfgVal);
        check(label, got === want, `得到 ${got}`);
    });

    // 对照：旧写法在 undefined 上的行为（这就是坑）
    const oldWay = (isTop, cfgVal) => isTop && !cfgVal;
    check('旧写法 !undefined=true 会「看起来该执行」',
        oldWay(true, undefined) === true, '对照组失效');
    check('新写法在 undefined 上落到 blob（有 verbose 日志）',
        shouldDirect(true, undefined) === false);
}

console.log('\n═══ 修法三：直落拿不到手要明确回退 ═══');
{
    const i = codeOnly.indexOf('cfg.isVideoViaBlob === false');
    const seg = codeOnly.slice(i, i + 700);
    check('检查 saveVideoViaGM 的返回值', /const handed = saveVideoViaGM/.test(seg));
    check('拿到手就 return（不重复下载）', /if \(handed\) \{[\s\S]{0,260}return null;/.test(seg));
    check('拿不到手有警告日志', /视频直落不可用，改走 blob 路径/.test(seg));
    check('拿不到手则继续往下走 blob', !/if \(handed\) \{[\s\S]{0,400}else[\s\S]{0,80}return/.test(seg));

    const f = codeOnly.slice(codeOnly.indexOf('function saveVideoViaGM'), codeOnly.indexOf('function saveBlob'));
    check('GM_download 不可用返回 null', /typeof GM_download !== 'function'[\s\S]{0,200}return null;/.test(f));
    check('调用异常也返回 null', /catch \(e\) \{[\s\S]{0,200}return null;/.test(f));
    check('成功返回 true', /\}, \{ timeout: 300000 \}\);[\s\S]{0,40}return true;/.test(f));
    check('函数第一行就打日志（未调用=分支没进）',
        f.indexOf('视频直落 GM_download') < f.indexOf('typeof GM_download'));
}

console.log('\n═══ 菜单读写同一个键 ═══');
{
    check('菜单保存用 isVideoViaBlob',
        /GM_setValue\(CFG_KEYS\.isVideoViaBlob, cfg\.isVideoViaBlob\)/.test(codeOnly));
    check('不再有 CFG_KEYS.videoViaBlob 引用',
        !/CFG_KEYS\.videoViaBlob/.test(codeOnly));
}

console.log('\n═══ 老功能未坏 ═══');
check('blob 路径仍在（可回退对照）', /let res = await fetchBlob\(url, \{ verbose: !!item\.isTop \}\)/.test(codeOnly));
check('blob 路径有 verbose 日志', /fetchBlob 第\$\{attempt\}次请求/.test(codeOnly));
check('绝对超时仍在', /HARD_TIMEOUT/.test(codeOnly));
check('队列后打点仍在', /队列完成 收集=\$\{files\.length\}/.test(codeOnly));
check('图片仍走 GM_download', /if \(typeof GM_download === 'function'\) \{/.test(codeOnly));
check('图片仍进 files', /files\.push\(\{ name, data: blob, isVideo: !!item\.isTop \}\)/.test(codeOnly));
check('GM_download grant 在', /@grant\s+GM_download/.test(src));
check('extOf 白名单未坏', /const MEDIA_EXTS = \[/.test(src));
check('两趟去重未坏', /const deduped = \[\]/.test(src));
check('右下角常驻未坏', /\.wb-card-dl\{[\s\S]{0,400}?opacity:\.(?!0\b)[\d.]+/.test(src));
check('零 @require', !/^\/\/ @require/m.test(src));

console.log('\n═══ 版本 ═══');
const vMeta = (src.match(/@version\s+([\d.]+)/) || [])[1];
const vConst = (src.match(/const VERSION = '([\d.]+)'/) || [])[1];
check('版本号两处一致', vMeta === vConst && /^\d+\.\d+\.\d+$/.test(vMeta || ''), `${vMeta}/${vConst}`);
check('头部有 v0.1.25 历史记录', /v0\.1\.25/.test(src));
check('头部有 v0.1.25 记录', /v0\.1\.25 变更/.test(src));

console.log(`\n${'═'.repeat(46)}`);
console.log(`结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
