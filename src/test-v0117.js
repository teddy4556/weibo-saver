// v0.1.17 回归：视频下载（依据用户实测日志）
const fs = require('fs');
const P = require('./_target.js').TARGET;
const src = fs.readFileSync(P, 'utf8');
const codeOnly = src.split('\n').filter(l => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}${e ? ' → ' + e : ''}`); } };

eval(src.match(/function extOf\(url, fallback\) \{[\s\S]*?\n    \}/)[0]);
// v0.1.20 起 refererFor() 已无参数（Referer 固定站点根），签名匹配放宽到有/无参
eval(src.match(/function refererFor\([^)]*\) \{[\s\S]*?\n    \}/)[0]);

console.log('\n═══ 根因 1：extOf 把数字当扩展名（真跑）═══');
console.log('  ← 用户实测文件名：微博#腐团儿Ikaros#2304291523#00（.00 是假扩展名）');
{
    // 真实媒体类型必须认对
    [['https://wx1.sinaimg.cn/large/a.jpg', 'jpg'],
     ['https://wx2.sinaimg.cn/mw2000/a.png', 'png'],
     ['https://a.weibo.com/a.webp', 'webp'],
     ['https://x.com/a.mp4', 'mp4'],
     ['https://x.com/a.heic', 'heic'],
     ['https://video.weibo.com/live/x.m3u8', 'm3u8'],
    ].forEach(([u, w]) => {
        const g = extOf(u, 'bin');
        check(`${u.slice(-16)} → ${w}`, g === w, `得到 ${g}`);
    });

    // 纯数字假扩展名必须挡掉（★ 本次核心）
    ['https://v.weibo.com/page/abc_00',
     'https://t.weibo.com/a_12',
     'https://x.com/a.2024',
     'https://x.com/a.123',
     'https://x.com/a.99',
    ].forEach(u => {
        const g = extOf(u, 'mp4');
        check(`假扩展名被挡：${u.slice(-14)}`, g === 'mp4', `得到 ${g}`);
    });
}

console.log('\n═══ extOf 实现细节 ═══');
check('正则要求字母开头', src.includes("/\\.([A-Za-z][A-Za-z0-9]{1,3})$/"));
check('有媒体类型白名单', /const MEDIA_EXTS = \[/.test(src));
check('白名单含 m3u8', /'m3u8'/.test(src));
check('白名单含 mp4', /'mp4'/.test(src));
{
    // 白名单逐项检查：不能有任何纯数字项
    const wl = src.match(/const MEDIA_EXTS = \[([\s\S]*?)\];/)[1];
    const items = wl.match(/'([a-z0-9]+)'/g).map(s => s.replace(/'/g, ''));
    const pureNum = items.filter(x => /^\d+$/.test(x));
    check('白名单无纯数字项', pureNum.length === 0, `发现 ${JSON.stringify(pureNum)}`);
    check(`白名单共 ${items.length} 项`, items.length >= 20);
    check('白名单含 m3u8', items.includes('m3u8'));
}
check('不在白名单走 fallback', /if \(!MEDIA_EXTS\.includes\(ext\)\) return fb;/.test(src));
// v0.1.17 断言的是三元表达式调用点；v0.1.33 改成按资源类型分别传字面量。
// 验意图：extOf 有多个调用点，且视频传 mp4、图片传 jpg。
check('调用点按类型兜底（视频传 mp4 / 图片传 jpg）',
    /extOf\([^,]+, 'mp4'\)/.test(codeOnly) && /extOf\([^,]+, 'jpg'\)/.test(codeOnly));

// ────────────────────────────────────────────────────────────
// v0.1.17 原本在这断言「Referer 按 URL 分类 + 必须设 uid」防盗链方案。
// 该方案已于 v0.1.20 整体撤销 —— 查参考脚本 gf-394252 的 ajaxDownload 确认：
// 微博视频 CDN 从头到尾只用 `referer: 'https://weibo.com/'`，从不设 uid，
// 加 uid 纯属多余步骤。详见 src 头部「v0.1.20 变更」段。
// 所以这组改成断言「撤销后的现行形态」，保住回归价值。
// ────────────────────────────────────────────────────────────
console.log('\n═══ v0.1.20 撤销后：Referer 固定站点根，无 uid 步骤（真跑）═══');
{
    // refererFor 现为无参常量函数，v0.1.20 后任何 URL 都返回站点根
    check('refererFor 无参也返回站点根',
        refererFor() === 'https://weibo.com/');
    check('refererFor 不再有 uid 分支',
        !/weiboUid/.test(src.match(/function refererFor\([^)]*\) \{[\s\S]*?\n    \}/)[0]));
}
check('refererFor 函数在', /function refererFor\(/.test(src));
check('各处请求都带站点根 referer（不按 URL 分类）',
    (src.match(/referer: 'https:\/\/weibo\.com\/'/g) || []).length >= 3,
    `${(src.match(/referer: 'https:\/\/weibo\.com\/'/g) || []).length} 处`);
// 判 codeOnly（已剥注释）——头部变更记录写着「删掉 uid 设置」，注释字样会误命中
check('已无 uid 设置步骤（v0.1.20 撤销）', !/weiboUid/.test(codeOnly));
check('已无 uid 菜单', !/设置微博\s*uid|设置微博uid/i.test(codeOnly));
check('extOf 调用点仍按类型兜底', /extOf\(/.test(codeOnly));
check('补了 accept 头', /'accept': '\*\/\*'/.test(src));


console.log('\n═══ 诊断增强 ═══');
check('空资源打 HTTP status', /status=\$\{res\.status\}/.test(src));
check('打 content-type', /type=\$\{res\.response && res\.response\.type/.test(src));
check('打 size', /size=\$\{res\.response && res\.response\.size/.test(src));
check('打完整 URL 前 100 字符', /url=\$\{url\.slice\(0, 100\)\}/.test(src));

// v0.1.17 曾在 v0.1.20 撤销前加「设置我的微博 uid」菜单（认为视频 CDN 有防盗链）。
// 该结论查证后被推翻 —— 参考脚本从不用 uid。改成反向断言，确认整套东西确实没了。
console.log('\n═══ uid 入口已撤销（v0.1.20）═══');
check('cfg 无 weiboUid 键', !/weiboUid: 'wb_uid'/.test(src));
// 注意：源码里的 {uid} 是命名模板占位符（微博#{username}#{uid}#{index}），
// 与「设置 uid」菜单无关。所以这里只查菜单形态，不查 uid 字样。
// 判 codeOnly（已剥注释）而非 src —— 头部变更记录里写着「删掉 uid 设置」，
// 注释中的 uid 字样会让 src 上的判定永远为假。
// 注意两个易误判点：
//   1) 判 codeOnly（已剥注释）——头部变更记录含「uid」字样
//   2) 不能用 [^)]*uid/i —— [^)]* 会跨过嵌套括号吃到后面的 menuIds
//      （"menuIds" 含 "uid" 子串）→ 收紧为「菜单标题 60 字符内有 设置+uid」
check('无 uid 设置菜单', !/设置我的微博 uid/.test(codeOnly)
    && !/GM_registerMenuCommand\([^)]{0,60}设置[^)]{0,40}uid/i.test(codeOnly));
check('无「防盗链 Referer」菜单文案', !/视频 CDN 的防盗链 Referer/.test(codeOnly));
check('代码里再无 weiboUid 痕迹（注释除外）', !/weiboUid/.test(codeOnly));

console.log('\n═══ 版本 & 老功能 ═══');
const vMeta = (src.match(/@version\s+([\d.]+)/) || [])[1];
const vConst = (src.match(/const VERSION = '([\d.]+)'/) || [])[1];
check('版本号两处一致（动态比对，不写死版本）',
    vMeta === vConst && /^\d+\.\d+\.\d+$/.test(vMeta || ''), `${vMeta}/${vConst}`);
check('头部有 v0.1.17 历史记录', /v0\.1\.17 变更/.test(src));
check('头部有 v0.1.17 记录', /v0\.1\.17 变更/.test(src));
check('去嵌套修复未坏', /const deduped = \[\]/.test(src));
// 意图式断言（与 test-v0116 / test-v0118 统一）：按钮在右下角 + 常驻可点。
// 不锁死 opacity 数值 —— v0.1.33 是 .88，锁 .85 必红。
check('右下角常驻未坏', /\.wb-card-dl\{[\s\S]{0,400}?opacity:\.(?!0\b)[\d.]+/.test(src)
    && /\.wb-card-dl\{[\s\S]{0,400}?pointer-events:auto/.test(src));
check('单视频高清接口未坏', /async function topMediaUrlAsync/.test(src));
check('live 命名修复未坏', src.includes("+ `-live.${ext}`"));
check('落盘错峰未坏', /i \+= batchSize/.test(src));
check('GM_download 在', /@grant\s+GM_download/.test(src));
check('零 @require', !/^\/\/ @require/m.test(src));

console.log(`\n${'═'.repeat(46)}`);
console.log(`结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
