// v0.1.17 回归：视频下载（依据用户实测日志）
const fs = require('fs');
const P = '/opt/data/cache/scratch/wb-build/weibo-saver-v0.1.0.user.js';
const src = fs.readFileSync(P, 'utf8');
const codeOnly = src.split('\n').filter(l => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}${e ? ' → ' + e : ''}`); } };

eval(src.match(/function extOf\(url, fallback\) \{[\s\S]*?\n    \}/)[0]);
eval(src.match(/function refererFor\(url\) \{[\s\S]*?\n    \}/)[0]);

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
check('调用点按类型兜底', /extOf\(url, item\.isTop \? 'mp4' : \(item\.ext \|\| 'jpg'\)\)/.test(codeOnly));

console.log('\n═══ 根因 2：Referer 防盗链（真跑）═══');
{
    // 未设 uid → 一律站点根（与旧行为一致，不倒退）
    check('未设 uid 时用站点根',
        refererFor('https://video.weibo.com/page/abc_00') === 'https://weibo.com/');
    check('图片 URL 也用站点根',
        refererFor('https://wx1.sinaimg.cn/large/a.jpg') === 'https://weibo.com/');
    check('非法 URL 不炸', refererFor('not-a-url') === 'https://weibo.com/');
}
check('有 refererFor 函数', /function refererFor\(url\)/.test(src));
check('视频 CDN 路径可识别', /\/page\//.test(src) && /A-Za-z0-9_-\]/.test(src));
check('fetchBlob 用它', /const referer = refererFor\(url\)/.test(codeOnly));
check('补了 accept 头', /'accept': '\*\/\*'/.test(src));
check('Referer 切换有日志', /fetchBlob Referer →/.test(src));

console.log('\n═══ 诊断增强 ═══');
check('空资源打 HTTP status', /status=\$\{res\.status\}/.test(src));
check('打 content-type', /type=\$\{res\.response && res\.response\.type/.test(src));
check('打 size', /size=\$\{res\.response && res\.response\.size/.test(src));
check('打完整 URL 前 100 字符', /url=\$\{url\.slice\(0, 100\)\}/.test(src));

console.log('\n═══ uid 设置入口 ═══');
check('cfg 有 weiboUid', /weiboUid: 'wb_uid'/.test(src));
check('默认留空', /weiboUid: '',/.test(src));
check('有设置菜单', /GM_registerMenuCommand\('🆔 设置我的微博 uid'/.test(src));
check('菜单说明作用', /视频 CDN 的防盗链 Referer/.test(src));
check('留空有解释', /留空则用站点根/.test(src));

console.log('\n═══ 版本 & 老功能 ═══');
const vMeta = (src.match(/@version\s+([\d.]+)/) || [])[1];
const vConst = (src.match(/const VERSION = '([\d.]+)'/) || [])[1];
check('版本号两处一致', vMeta === vConst && /^\d+\.\d+\.\d+$/.test(vMeta || ''), `${vMeta}/${vConst}`);
check('头部有 v0.1.17 历史记录', /v0\.1\.17 变更/.test(src));
check('头部有 v0.1.17 记录', /v0\.1\.17 变更/.test(src));
check('去嵌套修复未坏', /const deduped = \[\]/.test(src));
check('右下角常驻未坏', /\.wb-card-dl\{[^}]*opacity:\.85/.test(src));
check('单视频高清接口未坏', /async function topMediaUrlAsync/.test(src));
check('live 命名修复未坏', src.includes("+ `-live.${ext}`"));
check('落盘错峰未坏', /i \+= batchSize/.test(src));
check('GM_download 在', /@grant\s+GM_download/.test(src));
check('零 @require', !/^\/\/ @require/m.test(src));

console.log(`\n${'═'.repeat(46)}`);
console.log(`结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
