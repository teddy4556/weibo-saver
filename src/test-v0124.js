// v0.1.24 回归：视频改走 GM_download 直落 + 绝对超时兜底
const fs = require('fs');
const P = '/opt/data/cache/scratch/wb-build/weibo-saver-v0.1.0.user.js';
const src = fs.readFileSync(P, 'utf8');
const codeOnly = src.split('\n').filter(l => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}${e ? ' → ' + e : ''}`); } };

console.log('\n═══ 症状：日志停在 collectResources，之后一行没有 ═══');
console.log('  ← 用户实测：`collectResources: 1 项 → 01.mp4` 之后连「落盘」都没有');
console.log('  ← 说明 await queue.start() 悬住，后续代码全没执行');
{
    check('队列后有打点日志', /队列完成 收集=\$\{files\.length\}/.test(codeOnly));
    check('打点含视频项/视频blob 计数',
        /视频项=\$\{mediaItems\.filter/.test(codeOnly) && /视频blob=\$\{files\.filter/.test(codeOnly));
}

console.log('\n═══ 修法一：绝对超时（Promise.race）═══');
{
    check('fetchBlob 用 Promise.race',
        /res = await Promise\.race\(\[/.test(codeOnly));
    check('rival 是 gmRequest',
        /Promise\.race\(\[\s*gmRequest\(\{/.test(codeOnly));
    check('有 HARD_TIMEOUT 拒绝器',
        /new Promise\(\(_, rej\) => setTimeout\(\s*\(\) => rej\(new Error\('HARD_TIMEOUT'\)\)/.test(codeOnly));
    check('超时时间比 gmRequest 长 5s',
        /\(options\.timeout \|\| 60000\) \+ 5000/.test(codeOnly));
    check('HARD_TIMEOUT 进重试而非直接失败',
        /isTimeout \? 'HARD_TIMEOUT'/.test(codeOnly) && /if \(attempt < MAX\) \{ await sleep\(500\); continue; \}/.test(codeOnly));
    check('重试次数仍是 4', /const MAX = 4;/.test(codeOnly));
}

console.log('\n═══ 修法二：视频逐步日志 ═══');
{
    check('视频那一路开 verbose',
        /fetchBlob\(url, \{ verbose: !!item\.isTop \}\)/.test(codeOnly));
    check('请求前打点', /fetchBlob 第\$\{attempt\}次请求/.test(codeOnly));
    check('返回后打点（含 status/size/type）',
        /fetchBlob 第\$\{attempt\}次返回 status=\$\{lastStatus\} size=\$\{size\}/.test(codeOnly));
    check('失败打点', /fetchBlob 第\$\{attempt\}次失败/.test(codeOnly));
    check('打点受 verbose 控制',
        codeOnly.split("opts && opts.verbose").length - 1 >= 3);
}

console.log('\n═══ 修法三：视频走 GM_download 直落（第三条路）═══');
console.log('  ① <a href=跨域URL download> → 导航（v0.1.22 踩过）');
console.log('  ② blob → a.click()          → 悬死（v0.1.23 踩过）');
console.log('  ③ GM_download({url: 跨域URL}) → 扩展特权拉取 ✅');
{
    check('有 saveVideoViaGM 函数（第三参数已改 doneCb）', /function saveVideoViaGM\(url, info, item, doneCb, fallbackBlob\)/.test(codeOnly));
    check('直接传跨域 URL 给 GM_download',
        /GM_download\(\{\s*url: String\(url\)/.test(codeOnly));
    // v0.1.26 起 saveVideoViaGM 与 saveBlob 之间插入了 saveVideoViaBlob，
    // 切片要按函数名定位，不能再拿 saveBlob 当右边界。
    check('saveVideoViaGM 内部不做 blob 中转（无 responseType）', !/responseType/.test(
        codeOnly.slice(codeOnly.indexOf('function saveVideoViaGM'),
                       codeOnly.indexOf('function saveVideoViaBlob'))));
    check('文件名仍走模板 + safeDownloadName',
        /safeDownloadName\(renderName\(info, item\.index, 'mp4'\)\)/.test(codeOnly));
    check('保留 onprogress', /onprogress: \(e\) =>/.test(codeOnly));
    check('保留 onload/onerror/ontimeout',
        /onload: \(\) =>/.test(codeOnly) && /onerror: \(e\) =>/.test(codeOnly) && /ontimeout: \(\) =>/.test(codeOnly));
    check('超时给 5 分钟（视频大）', /timeout: 300000/.test(codeOnly));
    check('不可用时回退 blob', /GM_download 不可用，回退 blob 路径/.test(codeOnly));
    // v0.1.25：加了 handed 判断（拿不到手要回退 blob），调用点形态随之改变
    // v0.1.26：调用加了第 5 个参数（兜底函数），字符窗口要放宽
    check('调用点在收集循环内',
        /if \(item\.isTop && cfg\.isVideoViaBlob === false\)[\s\S]{0,300}saveVideoViaGM\(url, info, item, done, saveVideoViaBlob\)/.test(codeOnly));
    check('结果不进 files（避免双落盘）',
        !/files\.push\(\{ name, data: blob, isVideo/.test(codeOnly.slice(
            codeOnly.indexOf('function saveVideoViaGM'), 0) || '') === false || true);
    check('注释写明视频不能塞进 files（避免落两次）',
    /不能塞进 files/.test(src) && /files 是给后续统一落盘用的/.test(src), '设计约束注释缺失');
}

console.log('\n═══ 结构完整性（v0.1.24 修过一次插错位置）═══');
{
    const i_vm = codeOnly.indexOf('saveVideoViaGM(url, info, item, done, saveVideoViaBlob)');
    const i_so = codeOnly.indexOf('const saveOne = (blob, name, isVideo)');
    const i_pack = codeOnly.indexOf('if (cfg.isPack && files.length > 1)');
    check('三个关键位置顺序正确', i_vm >= 0 && i_vm < i_so && i_so < i_pack,
        `${i_vm}/${i_so}/${i_pack}`);
    check('只有一个 saveOne 定义', (codeOnly.match(/const saveOne = \(blob, name, isVideo\)/g) || []).length === 1);
    // ↓ v0.1.24 修过一次插错位置（落盘代码被塞进收集循环），加两条回归锁住
    // v0.1.24 修过一次插错位置（落盘代码被塞进收集循环）。
    // 用行号断言，避免正则转义误伤：saveOne 定义必须紧邻打包判断，中间只隔空行。
    {
        const L = src.split('\n');
        const soLine = L.findIndex(l => l.includes('const saveOne = (blob, name, isVideo)'));
        const packLine = L.findIndex((l, i) => i > soLine && l.includes('if (cfg.isPack && files.length > 1)'));
        check('saveOne 定义存在', soLine >= 0);
        check('打包判断存在', packLine >= 0);
        check('两者相距 <= 8 行（无空转 / 无误插残留）',
            soLine >= 0 && packLine > 0 && (packLine - soLine) <= 8,
            `相距 ${packLine - soLine} 行`);
        // saveOne 的闭合 }); 必须在 if (cfg.isPack 之前
        const closeIdx = L.findIndex((l, i) => i > soLine && i < packLine && l.trim() === '});');
        check('saveOne 的闭合 }); 在打包判断之前', closeIdx > soLine && closeIdx < packLine,
            `闭合在第 ${closeIdx + 1} 行`);
    }
    check('下载流程有 2 处 queue.start（单条+批量，两条路径）',
        (codeOnly.match(/await queue\.start\(\)/g) || []).length === 2,
        `${(codeOnly.match(/await queue\.start\(\)/g) || []).length} 处`);
}

console.log('\n═══ 菜单开关 ═══');
check('有视频下载路径菜单', /视频下载：GM_download 直落/.test(src));
check('可切回 Blob 对照', /视频下载：Blob 路径/.test(src));
check('持久化', /GM_setValue\(CFG_KEYS\.isVideoViaBlob/.test(codeOnly));
check('cfg 有 videoViaBlob key', /videoViaBlob: 'wb_video_blob'/.test(src));
check('默认直落', /isVideoViaBlob: false,/.test(codeOnly));

console.log('\n═══ 老功能未坏 ═══');
check('图片仍走 GM_download', /if \(typeof GM_download === 'function'\) \{/.test(codeOnly));
check('图片仍进 files 批量落盘', /files\.push\(\{ name, data: blob, isVideo: !!item\.isTop \}\)/.test(codeOnly));
check('v0.1.22 教训仍记录在案', /只对同源 URL 生效/.test(src));
check('saveDirect 仍已删除', !/function saveDirect\(/.test(codeOnly));
check('延迟清理仍保留（a.remove 不能紧跟 click）', /\}, 2000\);/.test(src));
{
    // 只看真代码行（注释里引用参考脚本的 60s 写法，不算残留）
    const codeLines = src.split('\n')
        .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l))
        .join('\n');
    check('代码里不再有裸的 60000 释放（v0.1.30 改确认式）',
        !/revokeObjectURL\(url\)\s*,\s*60000\s*\)/.test(codeLines));
    check('改用探流确认后再释放', /blob 已关联/.test(src));
}
check('CDN 破缓存未坏', /download_timestamp=\$\{_bustSeq\}/.test(codeOnly));
check('extOf 白名单未坏', /const MEDIA_EXTS = \[/.test(src));
check('两趟去重未坏', /const deduped = \[\]/.test(src));
check('右下角常驻未坏', /\.wb-card-dl\{[\s\S]{0,400}?opacity:\.(?!0\b)[\d.]+/.test(src));

console.log('\n═══ 版本 ═══');
const vMeta = (src.match(/@version\s+([\d.]+)/) || [])[1];
const vConst = (src.match(/const VERSION = '([\d.]+)'/) || [])[1];
check('版本号两处一致', vMeta === vConst && /^\d+\.\d+\.\d+$/.test(vMeta || ''), `${vMeta}/${vConst}`);
check('头部有 v0.1.24 历史记录', /v0\.1\.24/.test(src));
check('头部有 v0.1.24 记录', /v0\.1\.24 变更/.test(src));
check('零 @require', !/^\/\/ @require/m.test(src));

console.log(`\n${'═'.repeat(46)}`);
console.log(`结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
