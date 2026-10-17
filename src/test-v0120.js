// v0.1.20 回归：修「有下载失败的」+ 去掉 uid 步骤
const fs = require('fs');
const P = require('./_target.js').TARGET;
const src = fs.readFileSync(P, 'utf8');
const codeOnly = src.split('\n').filter(l => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}${e ? ' → ' + e : ''}`); } };

const get = (o, k, d) => { const p = k.split('.'); let c = o; for (const s of p) { if (c == null) return d; c = c[s]; } return c == null ? d : c; };

console.log('\n═══ 结论一：uid 那一步没必要，删干净 ═══');
console.log('  ← 用户质疑：为什么其他脚本没加也能下载');
console.log('  ← 查证：参考脚本 gf-394252 的 ajaxDownload 只用 referer: https://weibo.com/');
{
    check('weiboUid 配置项已删', !/weiboUid/.test(codeOnly));
    check('uid 设置菜单已删', !/设置我的微博 uid/.test(src));
    check('refererFor 简化为常量', /function refererFor\(\) \{\s*return 'https:\/\/weibo\.com\/';/.test(codeOnly));
    check('不再从 URL 拼 Referer', !/\/page\/.*refererFor/.test(codeOnly));
    check('Referer 仍是站点根', /referer: 'https:\/\/weibo\.com\/'/.test(codeOnly));
}

console.log('\n═══ 结论二：真凶是「CDN 返回 200 空体」+「只拉一次就判死」═══');
{
    check('fetchBlob 是 async', /async function fetchBlob\(url, opts\)/.test(codeOnly));
    check('破缓存参数 download_timestamp',
        /download_timestamp=\$\{_bustSeq\}/.test(codeOnly));
    check('先剥旧 timestamp 再拼新的',
        codeOnly.includes("replace(/[?&]?download_timestamp="));
    check('破缓存参数单调递增（同毫秒也不撞车）',
        /_bustSeq = now > _bustSeq \? now : _bustSeq \+ 1;/.test(codeOnly));
    check('不用 Math.max(now, seq)（那样 seq 恒被忽略）',
        !/Math\.max\(Date\.now\(\), \+\+_bustSeq\)/.test(codeOnly));
    check('重试 4 次', /const MAX = 4;/.test(codeOnly));
    check('重试间隔 500ms', /await sleep\(500\)/.test(codeOnly));
    check('空响应才重试（非空直接返回）', /if \(!isEmptyResult\(res\)\) return res;/.test(codeOnly));
    check('每次重试都有日志', /空响应 重试 \$\{attempt\}\/\$\{MAX\}/.test(codeOnly));
    check('耗尽后日志含状态码与体积', /拉取失败 \$\{MAX\} 次 \| status=/.test(codeOnly));
    check('耗尽后返回结构含 status', /return \{ status: lastStatus, response: \{ size: lastSize \} \};/.test(codeOnly));
    // v0.1.24：catch 块加了 isTimeout 分支（多了几行日志），
    // 但「任何失败都重试」这个意图不变。用行号断言避开长度上限。
    {
        // 必须在 fetchBlob 函数范围内找 —— 全文第一个 catch 是 gmRequest 的
        const i0 = codeOnly.indexOf('async function fetchBlob');
        const seg = codeOnly.slice(i0, i0 + 2600);
        const L = seg.split('\n');
        const c = L.findIndex(l => l.includes('} catch (e) {'));
        const s = L.findIndex((l, i) => i > c && l.includes('await sleep(500); continue;'));
        check('catch 块后走重试而非直接失败', c >= 0 && s > c && (s - c) <= 12,
            `catch@${c} 重试@${s}`);
    }
}

console.log('\n═══ 重试逻辑行为测试（模拟 CDN）═══');
{
    // 复刻 fetchBlob 的重试骨架（用可控的假 gmRequest）
    const sleep = () => Promise.resolve();
    let seq = 0;

    async function fetchBlobSim(url, responses) {
        const MAX = 4;
        let lastStatus = 0, lastSize = 0, calls = 0;
        const urls = [];
        for (let attempt = 1; attempt <= MAX; attempt++) {
            const clean = String(url).replace(/[?&]?download_timestamp=\d+/g, '');
            const sep = clean.indexOf('?') === -1 ? '?' : '&';
            const now = Date.now();
            seq = now > seq ? now : seq + 1;
            const bustUrl = `${clean}${sep}download_timestamp=${seq}`;
            urls.push(bustUrl);
            calls++;
            const res = responses[attempt - 1];
            lastStatus = res.status;
            lastSize = res.size;
            const empty = !res || res.size <= 512;
            if (!empty) return { ok: true, calls, urls, size: res.size };
            if (attempt < MAX) await sleep(500);
        }
        return { ok: false, calls, urls, status: lastStatus, size: lastSize };
    }

    const big = (size, type) => ({ status: 200, size, type: type || 'video/mp4' });
    const empty200 = { status: 200, size: 0 };
    const err403 = { status: 403, size: 0 };

    (async () => {
        // ① 第一次就成功 → 只拉 1 次
        let r = await fetchBlobSim('http://x/v.mp4', [big(5_000_000)]);
        check('首次成功只拉 1 次', r.ok && r.calls === 1, `calls=${r.calls}`);

        // ② 第一次空体，第二次成功 → 破缓存重试救回来
        r = await fetchBlobSim('http://x/v.mp4', [empty200, big(3_000_000)]);
        check('200 空体后重试成功', r.ok && r.calls === 2, `ok=${r.ok} calls=${r.calls}`);

        // ③ 空体 3 次第 4 次成功
        r = await fetchBlobSim('http://x/v.mp4', [empty200, empty200, empty200, big(2_000_000)]);
        check('连续 3 次空体后第 4 次成功', r.ok && r.calls === 4, `ok=${r.ok} calls=${r.calls}`);

        // ④ 全失败 → 报 4 次，状态码可读
        r = await fetchBlobSim('http://x/v.mp4', [err403, err403, err403, err403]);
        check('持续 403 → 试满 4 次', !r.ok && r.calls === 4, `calls=${r.calls}`);
        check('失败时状态码是 403', r.status === 403, `${r.status}`);

        // ⑤ 每次请求都带不同的 download_timestamp
        r = await fetchBlobSim('http://x/v.mp4', [empty200, big(1_000_000)]);
        const ts = r.urls.map(u => (u.match(/download_timestamp=(\d+)/) || [])[1]);
        check('每次 URL 都带 download_timestamp', ts.every(Boolean), JSON.stringify(ts));
        check('两次时间戳不同（单调递增兜底）', ts[0] !== ts[1], ts.join(' vs '));
        check('时间戳严格递增', parseInt(ts[0]) < parseInt(ts[1]), ts.join(' < '));

        // ⑥ 原 URL 已带时间戳 → 不产生双问号
        r = await fetchBlobSim('http://x/v.mp4?download_timestamp=123&a=1', [big(1_000_000)]);
        check('原 URL 带 timestamp 不重复追加',
            r.urls[0].match(/\?/g).length === 1 && !r.urls[0].includes('?download_timestamp=123&'),
            r.urls[0]);
    })();
}

console.log('\n═══ video_sources 补充来源 ═══');
check('有 pickFromVideoSourcesAttr', /function pickFromVideoSourcesAttr\(status\)/.test(codeOnly));
check('接进降级链', /if \(!url\) \{\s*url = pickFromVideoSourcesAttr\(status\);/.test(codeOnly));
check('支持对象形态', /typeof vs === 'object'/.test(codeOnly));
check('支持字符串形态', /typeof vs === 'string'/.test(codeOnly));
check('按序号取最高画质', /keys\.sort\(\(a, b\) => parseInt\(b\) - parseInt\(a\)\)/.test(codeOnly));
check('URL 合法性校验', /\/\^https\?:/.test(codeOnly));

console.log('\n═══ 版本 & 老功能 ═══');
const vMeta = (src.match(/@version\s+([\d.]+)/) || [])[1];
const vConst = (src.match(/const VERSION = '([\d.]+)'/) || [])[1];
check('版本号两处一致（动态比对，不写死版本）',
    vMeta === vConst && /^\d+\.\d+\.\d+$/.test(vMeta || ''), `${vMeta}/${vConst}`);
check('头部有 v0.1.20 历史记录', /v0\.1\.20/.test(src));
check('头部有 v0.1.20 记录', /v0\.1\.20/.test(src));
check('祖先兜底仍已删', !/closest\('\[data-wb-dl-btn/.test(codeOnly));
check('两趟去重仍在', /const deduped = \[\]/.test(src));
check('extOf 白名单未坏', /const MEDIA_EXTS = \[/.test(src));
check('右下角常驻未坏', /\.wb-card-dl\{[\s\S]{0,400}?opacity:\.(?!0\b)[\d.]+/.test(src));
check('GM_download 在', /@grant\s+GM_download/.test(src));
check('零 @require', !/^\/\/ @require/m.test(src));

console.log(`\n${'═'.repeat(46)}`);
console.log(`结果：${pass} 通过 / ${fail} 失败`);
