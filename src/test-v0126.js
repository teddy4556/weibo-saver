// v0.1.26 回归：GM_download 失败自动降级 + 全字段诊断
const fs = require('fs');
const P = require('./_target.js').TARGET;
const src = fs.readFileSync(P, 'utf8');
const codeOnly = src.split('\n').filter(l => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}${e ? ' → ' + e : ''}`); } };
// b = saveVideoViaBlob 函数体切片（原先定义在块内、却在块外被引用 → ReferenceError）
const b = codeOnly.slice(codeOnly.indexOf('function saveVideoViaBlob'), codeOnly.indexOf('function saveBlob'));

console.log('\n═══ 症状：按钮变成「重试」= 保存数 0 = 文件没落地 ═══');
console.log('  ← 参考脚本能下，因为它全走 GM_xmlhttpRequest → blob → saveAs');
console.log('  ← 姐姐的视频首选 GM_download(跨域URL)，这条受 Tampermonkey 设置影响');
{
    check('MSG.failed 文案未变', /failed: '失败，点击重试'/.test(codeOnly));
    // v0.1.31 起失败终态走 item.onGMDone 回调，且强制 typeof 校验
    check('视频失败会回调 onGMDone(false)',
        /typeof item\.onGMDone === 'function'\) item\.onGMDone\(false\)/.test(codeOnly));
}

console.log('\n═══ 修法一：全字段诊断日志 ═══');
{
    const f = codeOnly.slice(codeOnly.indexOf('function saveVideoViaGM'), codeOnly.indexOf('function saveVideoViaBlob'));
    check('打 GM_download.downloadMode', /GM_info && GM_info\.downloadMode/.test(f));
    check('打 URL 长度', /URL长度=\$\{String\(url\)\.length\}/.test(f));
    check('onerror 打全字段 JSON', /全字段:.*JSON\.stringify\(e\)/.test(f));
    check('不再只打 e.error', !/GM_download ❌ 视频 \$\{name\}`, e && \(e\.error/.test(f));
    check('ontimeout 有说明', /5 分钟未完成/.test(f));
}

console.log('\n═══ 修法二：失败自动降级到参考脚本那套 ═══');
{
    check('有 saveVideoViaBlob 函数',
        /function saveVideoViaBlob\(/.test(codeOnly));
    check('saveVideoViaGM 签名仍带兜底回调（参数名可演进）',
        /function saveVideoViaGM\(url, info, item, doneCb?, fallbackBlob\)/.test(codeOnly) ||
        /function saveVideoViaGM\([^)]*fallbackBlob/.test(codeOnly));
    check('调用点传了兜底函数',
        /saveVideoViaGM\(url, info, item, done, saveVideoViaBlob\)/.test(codeOnly));

    const f = codeOnly.slice(codeOnly.indexOf('function saveVideoViaGM'), codeOnly.indexOf('function saveVideoViaBlob'));
    check('onerror 会降级', /onerror[\s\S]{0,1200}?if \(fallbackBlob && !fallbackTried\)[\s\S]{0,200}?fallbackBlob\(/.test(f));
    check('ontimeout 也会降级', /ontimeout[\s\S]{0,400}?if \(fallbackBlob && !fallbackTried\)/.test(f));
    check('有降级标记防死循环', /let fallbackTried = false;/.test(f));
    check('降级前打日志', /降级 blob \+ saveAs 路径/.test(f));


    check('兜底用 gmRequest 拉 blob', /gmRequest\(\{[\s\S]{0,200}responseType: 'blob'/.test(b));
    check('兜底带 referer', /referer: 'https:\/\/weibo\.com\/'/.test(b));
    check('兜底超时 3 分钟', /timeout: 180000/.test(b));
    check('兜底空响应判失败', /isEmptyResult\(res\)[\s\S]{0,300}?finish && finish\(false\)/.test(b));
    check('兜底成功走 fallbackSave', /fallbackSave\(blob, name, finish\)|fallbackSave\(res\.response, name, finish\)/.test(b));
    check('兜底异常也报失败', /catch \(e\) \{[\s\S]{0,300}?finish && finish\(false\)/.test(b));
}

console.log('\n═══ 降级链行为测试（真跑模拟）═══');
{
    // 模拟 GM_download 三种结局，看降级是否正确触发、且只触发一次
    function simulate(gmResult, hasFallback = true) {
        const calls = { gm: 0, blob: 0, doneCalls: [] };
        let fallbackTried = false;
        const fallbackBlob = hasFallback ? (u, n, d) => { calls.blob++; d && d(true); } : null;
        const done = (ok) => calls.doneCalls.push(ok);

        const handed = true;   // GM_download 接口存在
        if (handed) {
            calls.gm++;
            if (gmResult === 'error') {
                if (fallbackBlob && !fallbackTried) { fallbackTried = true; fallbackBlob('u', 'n', done); }
                else done(false);
            } else if (gmResult === 'timeout') {
                if (fallbackBlob && !fallbackTried) { fallbackTried = true; fallbackBlob('u', 'n', done); }
                else done(false);
            } else if (gmResult === 'error-again') {
                // 降级后兜底也失败 → done(false)，不会再降级
                if (fallbackBlob && !fallbackTried) { fallbackTried = true; fallbackBlob('u', 'n', () => done(false)); }
                else done(false);
            } else {
                done(true);   // 成功
            }
        }
        return calls;
    }

    let r = simulate('ok');
    check('成功：不降级', r.blob === 0 && r.doneCalls[0] === true, JSON.stringify(r));

    r = simulate('error');
    check('onerror → 降级兜底', r.blob === 1 && r.doneCalls[0] === true, JSON.stringify(r));

    r = simulate('timeout');
    check('ontimeout → 降级兜底', r.blob === 1 && r.doneCalls[0] === true, JSON.stringify(r));

    r = simulate('error', false);
    check('无兜底函数 → 直接报失败', r.blob === 0 && r.doneCalls[0] === false, JSON.stringify(r));

    r = simulate('error-again');
    check('兜底也失败 → 报失败且不重复降级', r.blob === 1 && r.doneCalls[0] === false, JSON.stringify(r));
}

console.log('\n═══ 参考脚本的关键手法都在 ═══');
{
    // 注意切片边界：v0.1.33 里落盘清理 / blob 释放都在 fallbackSave 内，
    // 不在 saveVideoViaBlob→saveBlob 这段。原断言拿 b（前者）去查后者的日志，永远查不到。
    const fb = src.slice(src.indexOf('function fallbackSave'), src.indexOf('function fallbackSave') + 4000);
    // 三条铁律：blob 中转 → 同源 createObjectURL → click 后延迟清理
    check('fallbackSave 用 createObjectURL',
        /URL\.createObjectURL\(blob\)/.test(codeOnly));
    check('a[download] 属性在', /a\.download = filename;/.test(codeOnly));
    check('click 后 setTimeout(2000) 才清',
        /\}\s*,\s*2000\s*\);/.test(fb));
    check('blob URL 不再写死 60s 释放（v0.1.30 改确认式）',
        !/revokeObjectURL\(url\)\s*,\s*60000\s*\)/.test(fb) && /blob 已关联/.test(fb),
        '写死的 60s 释放还在');
    check('落盘触发有日志', /落盘已触发/.test(fb));
    // 字节完整性校验在 saveVideoViaBlob 里（用它自己的切片 b）
    check('blob 兜底校验完整性', /blob\.size < want/.test(b));
}

console.log('\n═══ 老功能未坏 ═══');
check('视频首选仍是 GM_download 直落',
    /if \(item\.isTop && cfg\.isVideoViaBlob === false\)/.test(codeOnly));
check('配置键仍对齐', /isVideoViaBlob: 'wb_video_blob'/.test(src));
check('图片仍走 GM_download', /if \(typeof GM_download === 'function'\) \{/.test(codeOnly));
check('图片仍进 files', /files\.push\(\{ name, data: blob, isVideo: !!item\.isTop \}\)/.test(codeOnly));
check('blob 老路径仍在（可手动切回）',
    /let res = await fetchBlob\(url, \{ verbose: !!item\.isTop \}\)/.test(codeOnly));
check('绝对超时仍在', /HARD_TIMEOUT/.test(codeOnly));
check('extOf 白名单未坏', /const MEDIA_EXTS = \[/.test(src));
check('两趟去重未坏', /const deduped = \[\]/.test(src));
// 意图式断言（与 test-v0116 / test-v0118 统一）：按钮在卡片右下角 + 常驻可点。
// 不锁死 opacity 数值 —— v0.1.33 是 .88，锁 .85 必红。
check('右下角常驻未坏', /\.wb-card-dl\{[\s\S]{0,400}?opacity:\.(?!0\b)[\d.]+/.test(src)
    && /\.wb-card-dl\{[\s\S]{0,400}?pointer-events:auto/.test(src));
check('GM_download grant 在', /@grant\s+GM_download/.test(src));
check('零 @require', !/^\/\/ @require/m.test(src));

console.log('\n═══ 版本 ═══');
const vMeta = (src.match(/@version\s+([\d.]+)/) || [])[1];
const vConst = (src.match(/const VERSION = '([\d.]+)'/) || [])[1];
check('版本号两处一致（动态比对，不写死版本）',
    vMeta === vConst && /^\d+\.\d+\.\d+$/.test(vMeta || ''), `${vMeta}/${vConst}`);
check('头部有 v0.1.26 历史记录', /v0\.1\.26/.test(src));
check('头部有 v0.1.26 记录', /v0\.1\.26/.test(src));

console.log(`\n${'═'.repeat(46)}`);
console.log(`结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
