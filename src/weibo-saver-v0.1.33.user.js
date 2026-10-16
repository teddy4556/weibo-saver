// ==UserScript==
// @name         微博助手 Weibo Saver
// @name:zh      微博助手（无损下载 + 去广告 + 大图浏览）
// @namespace    https://github.com/teddy4556/weibo-saver
// @version      0.1.33
// @description  微博无损下载助手：卡片右下角一键下载，支持九宫格/视频/livephoto/长文/直播 m3u8。超清图走 ajax 下载接口，高清视频走 tv 组件接口并校验字节完整性。附带去广告、大图浏览、批量选择下载。
// @author       teddy4556
// @license      MIT
// @homepage     https://github.com/teddy4556/weibo-saver
// @supportURL   https://github.com/teddy4556/weibo-saver/issues
// @icon         data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCIgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0Ij48cmVjdCB4PSIyIiB5PSIyIiB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHJ4PSIxNCIgZmlsbD0iI2U2MTYyZCIvPjxwYXRoIGQ9Ik0zMiAxNCBMMzIgMzgiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSI2IiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48cGF0aCBkPSJNMjEgMzAgTDMyIDQxIEw0MyAzMCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjYiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjxyZWN0IHg9IjE4IiB5PSI0NyIgd2lkdGg9IjI4IiBoZWlnaHQ9IjUiIHJ4PSIyLjUiIGZpbGw9IiNmZmYiLz48L3N2Zz4K
// @match        *://weibo.com/*
// @match        *://*.weibo.com/*
// @connect      weibo.com
// @connect      sinaimg.cn
// @connect      sina.cn
// @connect      weibocdn.com
// @connect      miaopai.com
// @connect      *
// @noframes     true
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_info
// ==/UserScript==

/*
 * 微博助手 Weibo Saver v0.1.0
 *
 * 设计铁律（改任何一处前先读，别踩）：
 *  1. 零 @require —— 参考脚本 wah0713 依赖 jQuery 1.12.4 + jszip + m3u8-parser 三个 CDN，
 *     任一 CDN 挂掉整个脚本就死。本脚本 zip / m3u8 解析 / DOM 全部自实现。
 *  2. 零 CSS Module 哈希类名 —— 微博是 CSS Modules（._info_1tpft_10 这种），哈希随改版变。
 *     参考脚本在三套哈希间来回切，本身就是被打脸的证据。本脚本用 ARIA 语义 + href 特征识别。
 *  3. 每个 flush 入口必包 try-catch —— 微博是 SPA，任何 DOM 操作都可能 throw。
 *  4. 不用持续 setTimeout 循环 —— 走 MutationObserver + requestIdleCallback。
 *  5. 日志前缀用反引号 —— 单引号会让 ${VERSION} 打成字面量，整条 debug 链路建在假数据上。
 *
 * v0.1.1 变更：
 *  - 修复「未下载原图」：降级路径误过 toLargeUrl，把 mw2000 降成了 large
 *  - 打包下载默认关闭（用户反馈不需要）
 *
 * v0.1.33 变更：历史限最近 6 条（三层收口）+ 收起抓手改双色
 *
 *  ── ① 历史条数：三处收口到 HISTORY_MAX = 6 ──
 *  用户原话：「历史能不能仅显示最近的 6 条」
 *
 *  改之前三处各写各的，而且**互相对不上**：
 *    · renderPanel  显示层  slice(-n)，n = clamp(cfg.messagesNumber, 3, 40)
 *    · tasks        内存层  只增不减 —— 下载 200 条就是 200 个 Map 项
 *    · setInterval  持久层  slice(-20)  ← 与显示层的 n 毫无关系
 *  结果：用户拖过 messagesNumber 之后，
 *  显示 6 条、磁盘存 20 条、内存留着 200 条，三个数各说各话。
 *  而且 Map 只增不减，微博往下滚一天就能把内存吃到几百条 ——
 *  内存涨，renderPanel 每次遍历也变慢。
 *
 *  修法：
 *    · 新增 HISTORY_MAX = 6，三处统一走它
 *    · 新增 trimTasks()：内存层超限主动淘汰
 *      —— 进行中的任务**永不淘汰**（正在下/保存中必须留着），
 *         只淘汰已完成的，且只留最新 6 条
 *    · 加载历史时也裁一次（防止旧版存的 20 条全灌进来）
 *
 *  ── ② 收起抓手改双色（用户反馈「左下的红和黑差别不明显」）──
 *  之前是纯红方块 16px + opacity:.5，压在深色面板（rgba(28,28,32,.92)）上。
 *  半透明红叠深底 = 暗红，跟面板的黑几乎融成一片，
 *  根本看不出「这里有个能点回来的东西」—— 自动隐藏一开就找不到面板。
 *
 *  修法：换成**微博品牌黄底 + 红色描边**：
 *    · 黄（#ffc300→#ff8200）跟微博页头 logo 同源，白底深底都跳得出来
 *    · 红只做描边 → 双色对比，暗背景上辨识度最高
 *    · 也不会跟卡片上的红色下载按钮混淆（黄 ≠ 红）
 *    · 尺寸 16→22px、加圆角 + 橙色投影、hover 放大 8%
 *
 * v0.1.32 变更：可视化菜单全量体检 + UI 重做
 *
 *  ── 体检结论（24 个可视化元素逐个验）──
 *  面板开关 6 个（批量 / 卡片按钮 / 打包 / 超清图 / 超清视频 / 正文）：
 *    映射 → 存配置 → 影响行为 的链路全部完整，无孤儿键。
 *    ⚠ 但发现一个真问题：paintToggle 里写的是
 *      `el.classList.toggle('on', !!cfg[def.key] && !!def.big)`
 *      —— `&& !!def.big` 意味着**只有批量下载那一个**会点亮状态点，
 *      其余 5 个开关永远是无点状态，视觉上分不出开/关。
 *      v0.1.32 改成全量点亮。
 *  数字输入 2 个（批大小 / 批间隔）：blur 提交 + 范围钳制 + 回写完整。
 *  批量工具条 5 个按钮：全选 / 清空 / 下载所选 / 退出 / 计数，全部有绑定。
 *  油猴菜单 13 个：全部有实质回调，无空菜单。
 *
 *  另清理：落盘阶段残留 24 行搬家注释（v0.1.29 修作用域时留下的），
 *  内容早已不适用（还在讲 v0.1.24 的 blob 悬死），留着只会误导后来人。
 *
 *  ── UI 重做（只改视觉层，id / 类名 / 行为一个没动）──
 *  设计取向：
 *  · 深色毛玻璃卡片
 *    微博是白底亮色，浅色面板贴在页面上像贴纸；
 *    深色 + 毛玻璃能压住页面又不突兀（真插件都长这样）。
 *  · 开关改成「胶囊 + 状态点」，一眼分清开/关
 *    旧版靠 ✔️❌ emoji 表达状态，不同系统渲染差异大且不够清晰；
 *    改成状态点后：关=灰点低透明、开=品牌红点带光晕。
 *  · 视觉层级：主操作（批量下载，实心红）> 常用开关（幽灵按钮）> 数字微调
 *  · 进度条改渐变，数字输入加上下箭头提示可调 + 等宽数字防跳动
 *  · 保留 --wb-* 变量入口，用户可自行换配色
 *
 *  卡住用户硬要求的部分一个没动：
 *    · 卡片按钮仍在右下角、仍常驻（pointer-events:auto）
 *    · 批量模式与勾选入口仍互斥（body.wb-batch .wb-card-pick）
 *    · 顶部/头像侧入口仍然不存在（v0.1.15 起删除，不恢复）
 *
 * v0.1.31 变更：自查发现的四个隐藏 bug（用户实测触发不到，靠静态分析）
 *
 *  这四个都属于「看起来能用但状态永远不对」——
 *  不报错、不影响下载结果，只污染状态机，所以用户实测发现不了。
 *
 *  bug①：done 是对象却当函数调（TypeError 静默半死）★最严重
 *   调用方传进来的第三参数是 downloadWeibo 里的进度计数器
 *   `const done = { q: 0, total: mediaItems.length }` —— 一个对象。
 *   函数体里却写 `done && done(true)`。
 *   对象是 truthy，所以 `done && ` 这道保护形同虚设，
 *   `done(true)` 必然抛 TypeError。
 *
 *   为何一直没人发现：
 *     GM_download 是扩展在后台独立下载的，文件照样落盘 —— 肉眼看着没问题。
 *     但脚本侧回调链全断：onload 抛错后续收尾不执行、
 *     onerror 抛错会吞掉降级逻辑、进度条永远停在中间态。
 *
 *   修法：第三参数改名 doneCb + 归一化成 finish，
 *        非函数输入打警告并降级为 no-op，让传错时立刻暴露而不是静默半死。
 *
 *  bug②：混批计数初始值就等于阈值
 *   旧逻辑 `let handedCount = videoHanded` + 回调里 `if (ok) handedCount++`
 *   初始值已经等于终态阈值 —— **第一个视频回调就满足 >= videoHanded**，
 *   会立刻 setTask 定终态，此时图集可能才落了一半，
 *   进度文案被视频回调覆盖；而且 `ok` 只取最后一个视频的成败，
 *   前面的失败会被静默吞掉。
 *
 *   修法：拆成 gmReported（已回报数）和 gmOk（成功数）两个计数，
 *        全部视频都回报了才定终态，且终态看整体而非最后一个。
 *
 *  bug③：percent: undefined 会污染任务状态
 *   setTask 用的是 Object.assign(cur, patch) ——
 *   传 percent: undefined 会把已有 percent 覆盖掉，渲染时变成 NaN%。
 *   修法：条件构造 patch，只在成功时才带 percent。
 *
 *  bug④：GM_info 用了但没声明 @grant
 *   v0.1.26 加诊断日志时用了 GM_info.downloadMode，
 *   但 metadata 里没写 @grant GM_info —— Tampermonkey 需要显式声明，
 *   拿不到就一直是「未知」，诊断日志失去意义。已补。
 *
 *  附带加固：savedOk 的声明提到闭包之前，
 *   永久封掉 TDZ 隐患（异步路径本来没事，但以后有人在同步路径调用就会炸）。
 *
 * v0.1.30 变更：修「停下载了」—— 下载中途被腰斩
 *  用户实测：浏览器下载条走到一半停住，文件残缺。
 *  两条独立根因，都会造成「下到一半停」。
 *
 *  根因①：blob URL 在 60 秒后被无条件 revoke
 *   fallbackSave 里原本写着 `setTimeout(() => URL.revokeObjectURL(url), 60000)`。
 *   revokeObjectURL 一执行，Chrome 正在读的那个流**立刻断掉** ——
 *   下载停在中途。写死 60 秒意味着「60 秒后不管下完没下完都抽走」，
 *   慢一点的视频（几十 MB）那时还在下 → 必现腰斩。
 *
 *   修法：不猜时间，改成**确认 Chrome 已认下这个 blob 才释放**。
 *     fetch(blobURL) 是读同一 blob 的无损手段 —— 它拿到响应头，
 *     说明 Chrome 已经把 blob 关联上，之后释放不会影响正在跑的下载任务。
 *     2 秒内没关联上（极小文件已下完 / 浏览器拒收）退回 5 分钟兜底，
 *     避免 blob 无限占内存把标签页撑爆。
 *
 *  根因②：GM_download 的 onload 被当成了「下载成功」
 *   onload 的语义是「任务结束」，**不是「字节完整」**。
 *   浏览器下载条中途停掉时（网络抖动 / 扩展被拦 / 服务端断流），
 *   它照样调 onload —— 于是脚本报「✅ 完成」而磁盘上是残缺文件。
 *   用户看着就是「停下载了」，而且界面上还是绿的。
 *
 *   修法：onload 里比对 onprogress 记下的 loaded / total。
 *     字节不全 → 不报成功，转 blob + saveAs 路径重下，拿完整字节。
 *     blob 兜底路径同样加了 Content-Length 校验，双保险。
 *
 *  修完后：
 *    · blob 释放时机不再写死，先探流确认
 *    · GM 直落会报出「字节不全 X MB / Y MB（Z%）」并自动重下
 *    · blob 兜底也会报「字节不全」并判失败，不再假成功
 *
 * v0.1.29 变更：修「卡在保存中 / 图片也下不了 / 文件名又变 #00」——三处根因
 *
 *  用户实测：进度条停在「保存中」不动，且图片也下不了。截图文件名是
 *  「微博 #上虞万妮达#RkVMuatrQ#00」—— 又出现了 v0.1.17 修掉的「#00」。
 *
 *  根因①（致命）：视频直落块**被误置到落盘阶段**
 *    v0.1.24/v0.1.28 那几次 patch 在找「落盘」上下文时命中了第一个匹配点，
 *    把整块 `if (item.isTop && cfg.isVideoViaBlob === false) {...}`
 *    插到了 saveOne 前面 —— 那是**落盘阶段**，item / url / info / done
 *    全都已在 forEach 作用域之外，这段永远拿不到有效变量，等于死代码。
 *    后果：视频从来没真正走进过直落分支，
 *          只能退回 fetchBlob + saveBlob，而大 blob 路径正是 v0.1.24 悬死的那条
 *          → 进度条卡在「保存中」，图片跟着一起被拖死（同一条 await 链）。
 *
 *  根因②：直落判定排在 `await fetchBlob(url)` **之后**
 *    即便挪对了位置，顺序也还是错的：先把几 MB 拉成 blob，
 *    再交给 GM_download 重新拉一遍 —— 纯浪费，还容易在 blob 阶段先卡死。
 *    修法：直落判定前移到 fetchBlob 之前，命中就 return null，根本不拉 blob。
 *
 *  根因③：`extOf(url, ...)` 在落盘阶段二次推导，覆盖了 item.ext
 *    收集阶段已经用**干净 URL** 判过一次扩展名并挂到 item.ext，
 *    落盘阶段却拿「加过缓存参数 / 破缓存参数」的 URL 又推一遍 ——
 *    破缓存参数是纯数字时间戳，正则从尾部捞到数字段当成扩展名，
 *    文件名就退回「微博#xxx#00」。
 *    （v0.1.17 堵的是 extOf 本身，漏了这处「二次推导」，等于前门堵了后门没堵。）
 *    修法：落盘阶段直接用 item.ext，不再推导。
 *
 *  修完后：
 *    直落真调用唯一，位置在 queue.add 任务内、fetchBlob 之前、files.push 之前
 *    落盘阶段无直落残留
 *    落盘命名不再有 extOf 调用
 *
 * v0.1.28 变更：修「保存的媒体不落盘」—— files=0 被误判成无资源
 *  - 用户实测反馈：视频实际下载完成了（文件在磁盘上），但进度条一直显示「重试」。
 *    这是 v0.1.27 修好队列之后才暴露出来的下一层问题 ——
 *    在那之前，队列提前 settle，代码根本走不到落盘阶段。
 *  - 真因：视频走 saveVideoViaGM（GM_download 直落）时**故意不 push 进 files**
 *    （避免二次落盘），所以纯视频场景 files 长度必然是 0。
 *    而落盘阶段还写着老判定 `if (files.length === 0) { 报失败; return false; }`
 *    —— 于是「没有任何 blob 要落盘」被当成「一个资源都没拿到」，
 *    **在 GM_download 还在后台下载时就宣告失败**。
 *  - 修法（判定分离，不再混为一谈）：
 *      · 直落的视频在 item 上打 `__handedToGM` 标记
 *      · 落盘阶段算 videoHanded，判定改为 `files.length === 0 && videoHanded === 0`
 *        才算真失败
 *      · files=0 但有直落 → 不在此处判定成功/失败，
 *        改挂 `item.onGMDone` 回调，由 GM_download 的 onload/onerror/ontimeout 定终态
 *      · GM_download 是**异步**的，落盘阶段 return 后进度条会停在「已交给浏览器下载」，
 *        挂上回调后 onload 回来才改成「完成」—— 不再假成功也不再假失败
 *      · 混批（图 + 视频）同样挂回调，用 handedCount 计数等所有视频出结果再定终态
 *  - 三分支判定行为测试覆盖 6 种组合（纯图 / 纯视频直落 / 真无资源 / 混批 /
 *    多视频直落 / 视频走 blob），并与旧判定做对照。
 *
 * v0.1.27 变更：修队列提前 settle（视频收集=0 → 按钮变「重试」）
 *  - 用户实测日志的顺序错位暴露了真凶（连续两次日志都是同一形态）：
 *      fetchBlob 第1次请求 341 字节 URL
 *      队列完成 收集=0/1 视频项=1 视频blob=0     ← 队列说「做完了」
 *      fetchBlob 第1次返回 status=200 size=4253400 空=false   ← blob 后到，没人接
 *    地址没问题、拉取没问题（4.2MB 到手），是**队列提前宣布完成**，
 *    files 收不到任何东西 → 落盘 0 个 → 显示 MSG.failed「失败，点击重试」。
 *  - 真因在 createQueue 的两处设计错误（不是 v0.1.24 的 Promise.race）：
 *      ① add() 里 `if (!settle) settle = (res) => res;` 放了个**假 resolve**。
 *         start() 里 `new Promise(resolve => { settle = resolve; })` 建的**真 resolve**
 *         会覆盖它 —— 但覆盖发生在 Promise 构造**之后**，而 add() 早已调过 next()。
 *         单任务场景（正是视频：只有 1 个资源）下，next() 命中
 *         `active===0 && tasks.length===0`，用假 settle 提前 resolve，
 *         真 Promise 永远等不到 → await queue.start() 立刻返回空 results。
 *      ② next() 的完成判定没区分「还没 start」和「已全部完成」，
 *         于是 add 阶段的中间态被误判成终态。
 *  - 修法：
 *      · add() 只入队，不启动（启动统一交给 start）
 *      · settle 只在 start() 里建，且**先建 Promise 再调 next()**
 *      · 加 started 标记，next() 的完成判定要求 started === true
 *      · 空队列走早退分支，不建半截 settle
 *  - 测试用旧/新两套实现真跑对比：
 *      旧实现单慢任务 → Promise.race 超时（队列已坏，印证日志现象）
 *      新实现单慢任务 → 正常等到 blob 结果
 *      并覆盖 3 任务并发 / 串行顺序 / start 后追加 / 空队列 / 任务抛异常
 *
 * v0.1.26 变更：GM_download 失败自动降级（用户反馈「变成重试」）
 *  - 用户反馈：参考脚本点下载就出文件，姐姐这个点下去变成「重试」。
 *    「重试」= MSG.failed = 保存数 0 = 文件确实没落地，不是显示问题。
 *  - 两版脚本的根本差别在落盘通道：
 *      参考脚本：GM_xmlhttpRequest → blob → createObjectURL → a[download]
 *               全程在页面内，**不碰 GM_download**
 *      姐姐的：GM_download({ url: 跨域URL })  ← 受 Tampermonkey「下载方式」设置影响
 *    GM_download 是「锦上添花」，失败了就该降级，不该让整个下载停摆。
 *  - 修法一：GM_download 失败（onerror/ontimeout）自动降级到参考脚本那套
 *    （saveVideoViaBlob：自己拉 blob → fallbackSave → a[download]）。
 *    用 fallbackTried 标记保证只降级一次，避免 onerror/onload 互踩死循环。
 *  - 修法二：onerror 打 GM_download 返回对象的**全字段 JSON**。
 *    之前只打 e.error，很多情况那个字段是 undefined，导致「失败了看不出为什么」。
 *    全字段后能直接分清 not_enabled / not_whitelisted / not_permitted /
 *    not_supported / not_succeeded 五种完全不同的情况。
 *  - 修法三：开跑前打 GM_info.downloadMode，一眼看出当前 Tampermonkey
 *    的下载方式设置（浏览器 API / 扩展下载器 / 本地服务）。
 *
 * v0.1.25 变更：视频直落分支一直没执行（用户实测日志定位）
 *  - 用户实测日志里**没有** `视频直落 GM_download` 这一行，
 *    却有 `fetchBlob 第1次请求` —— 说明直落分支根本没进，视频走了 blob 路径。
 *  - 真因是配置键名对不上：
 *      CFG_KEYS  里写的是  videoViaBlob: 'wb_video_blob'
 *      defaults  里写的是  isVideoViaBlob: false
 *    loadCfg 遍历的是 CFG_KEYS，所以 cfg.isVideoViaBlob 永远是 undefined；
 *    菜单保存写的是 wb_video_blob。两边不是同一个 key，
 *    导致「改开关」和「读开关」走的是两条互不相干的路径。
 *  - 修法一：CFG_KEYS 统一成 isVideoViaBlob，菜单保存也用同一个键。
 *  - 修法二：判定从 `!cfg.isVideoViaBlob` 改成 `cfg.isVideoViaBlob === false`。
 *    WHY 要这么写：cfg 靠遍历 CFG_KEYS 填充，一旦 key 缺失就是 undefined，
 *    而 `!undefined === true`，看起来等价、实则把「配置丢失」静默当成
 *    「用户选了旧路径」，分支永不执行且日志无痕 —— 这就是本次难查的原因。
 *    写成 `=== false` 后，undefined 会落到 blob 分支（有 verbose 日志可查），
 *    而不是「安静地什么都不做」。
 *  - 修法三：直落拿不到手时（GM_download 不可用/抛异常）明确回退 blob，
 *    并打一行警告，不再静默结束。
 *
 * v0.1.24 变更：让「视频卡住」变成「视频报错」（用户实测日志的断点定位）
 *  - 用户实测日志停在 `collectResources: 1 项 → 01.mp4`，之后**一行都没有**。
 *    既没有「落盘走原生下载」，也没有「空资源」，也没有「错峰落盘」。
 *    → 说明 await queue.start() 永远不返回，后面所有代码都没执行。
 *  - 根因方向：GM_xmlhttpRequest 拉几 MB 的 blob 时，扩展的 timeout
 *    对「还在下载 body」的情况不生效，Promise 永远悬着。
 *    （姐姐沙箱 curl 实测该视频 URL 是 200 + 8.5MB 完整字节，
 *      加不加 Referer、download_timestamp 都一样 —— 所以不是地址或破缓存的问题。）
 *  - 修法一：fetchBlob 用 Promise.race 兜一层绝对超时，不依赖浏览器计时，
 *    超时当失败处理并进入重试（4 次），不再无限悬着。
 *  - 修法二：视频那一路开启 verbose，请求前 / 返回后 / 失败 各打一行，
 *    状态码、字节数、content-type 全部可见。
 *  - 修法三：queue.start() 之后立刻打印「收集 N/M、视频项 X、视频blob Y」，
 *    哪怕卡住也能知道卡在哪一步。
 *
 * v0.1.23 变更：撤销 v0.1.22 的「视频直连」（用户一句话点破的硬伤）
 *  - 用户反馈：「我用其他脚本下载视频的时候 没有跳出新链接」。
 *    这正是 v0.1.22 的致命 bug：姐姐让 <a href="f.video.weibocdn.com/..."
 *    download="x.mp4"> 直接导航，Chrome 把整个微博页面跳走到了视频 CDN。
 *  - WHY（浏览器硬规则，不是配置问题）：
 *    **<a download> 属性只对同源 URL 生效。** 视频地址在 f.video.weibocdn.com，
 *    与页面 weibo.com 跨域 → Chrome 忽略 download 属性，改为直接导航到该 URL。
 *    结果不是「下载文件」，而是「当前页被视频流替换」。
 *  - 参考脚本为什么不会跳：它**先 GM_xmlhttpRequest 拉成 blob**，再用
 *    createObjectURL(blob) —— blob: 是同源，download 生效、文件名可控、不导航。
 *    v0.1.22 只抄了「不绕 GM_download」这一半，漏了「必须先变 blob」那一半。
 *  - 正确链路（v0.1.23）：URL → GM_xmlhttpRequest(blob) → createObjectURL
 *    → <a download>（同源，download 生效）→ 延迟 2s 清理。
 *    视频强制走这条路（forceNative），不按体积分流。
 *  - 图片维持原样：图片链路一直是 blob → GM_download，用户确认过「有下载产物」。
 *  - 删掉 saveDirect()—— 那是个基于错误前提写的函数。
 *
 * v0.1.22 变更：修视频下载失败（依据实测 + 参考脚本 OWENDSWANG v1.5.3）
 *  - 姐姐沙箱实测：视频 URL 裸请求即 200 + 完整字节（8,553,226 B / video/mp4），
 *    加不加 Referer、UA，字节数完全一致 → 微博视频 CDN 不校验 Referer。
 *    所以拉取层从来没坏过，问题一直在落盘层。
 *  - 修法一（治本）：视频不再 fetch 成 Blob，直接把 URL 交给浏览器原生下载。
 *    绕开「拉成 Blob → 转 objectURL → 再落盘」整条内存中转链，
 *    大文件在任何一环都可能断。新增 saveDirect()。
 *  - 修法二：a.click() 之后不能立刻 a.remove() —— 节点必须多活一会儿，
 *    Chrome 才会真的把下载任务建起来。参考脚本也是 setTimeout(1000) 才清。
 *    姐姐原来紧跟 click() 就删，是「脚本报成功但下载列表为空」的真因之一。
 *    改成 2000ms 后再清，blob URL 延后 60s 才 revoke。
 *  - 修法三（兜底）：saveBlob 对 >2MB 的 Blob 直接走原生下载，不绕 GM_download。
 *    参考脚本整段注释掉了 GM_download，理由是「不会被油猴设置里的下载选项影响」。
 *  - 新增油猴菜单「🎬 视频下载」可在 直连 / Blob 中转 之间切换，便于对照排障。
 *
 * v0.1.21 变更：修「卡片=24 但只挂 1 个按钮」诊断不到原因
 *  - 跳过原因此前只在手动「显示诊断信息」菜单里打印，flush 每秒自动扫描时
 *    完全静默 —— 用户看到 24 张候选只挂 1 个按钮时，无法判断另外 23 张
 *    卡在「认不出 id」「判为纯文字」「尺寸太小」哪一关。
 *  - enhanceCards / injectCardButtons 各自把候选数 + 新增数 + 三类跳过数
 *    打进常规日志，三者之和可与候选数对账，一眼看出丢在哪一关。
 *  - injectCardButtons 此前完全没有跳过统计，补上 nNoId / nNoMedia / nTooSmall。
 *  - collectCards 日志把「卡片」改成「候选」，并打出去重前后对照。
 *  - 顺带记录：属性路（data-oid/data-mid）在新版 DOM 上命中恒为 0，
 *    识别主力其实是 href 路 + 媒体反查。
 *
 * v0.1.20 变更：修「有下载失败的」+ 去掉 uid 步骤（用户质疑后的查证结论）
 *  - 删掉 uid 设置：姐姐 v0.1.17 加「必须设置微博 uid」是推断视频 CDN 有防盗链。
 *    查参考脚本 gf-394252 的 ajaxDownload 确认 —— 它从头到尾只用
 *    `referer: 'https://weibo.com/'`，从没设过 uid，却是微博圈最稳的脚本之一。
 *    多加一个必做步骤只添堵。Referer 固定站点根。
 *  - 补 download_timestamp 破缓存：微博 CDN 对同一 URL 会返回 200 但 body 0 字节
 *    （命中负缓存）。参考脚本的解法是 URL 拼时间戳强制回源，姐姐原来直接
 *    判「空了就失败」，等于放弃这条路。
 *  - 补失败重试 4 次 × 间隔 500ms：CDN 抖动是常态。参考脚本 tryTimes 到 3 才放弃，
 *    姐姐原来只拉一次就判死 —— 这是「有下载失败的」的直接原因。
 *  - 补 video_sources 字段：参考脚本还从 [video-sources] 属性取地址，
 *    部分 dash 流视频只有这个来源有，ajax 接口反而拿不到。
 *
 * v0.1.19 变更：修复「6 张卡只有 1 个按钮」
 *  - 真因（用户实测 Console）：面板在、6 张卡已标记增强、但页面只有 1 个按钮。
 *    说明识别层完全正常，问题在注入层。
 *  - 病灶：v0.1.16 加的「祖先里已挂按钮就跳过」判断。它用 parentElement
 *    .closest(...) 往上找，而个人主页 / 信息流的卡片共用一个 feed 容器 ——
 *    第一张卡挂上按钮后，后面每张卡的父节点链上都能查到那个标记，全被跳过。
 *    它防的不是重复挂，是「除了第一张卡以外的每一张卡」。
 *  - 为什么当初想加：为了防双按钮。但双按钮的根因是「同一张卡被识别两次」，
 *    那是 collectCards 的问题，v0.1.18 已用顺序无关的两趟去重解决。
 *    祖先判断只剩副作用，没有收益，直接删。
 *  - 防重复的唯一依据改回卡片自身的 wbDlBtn 标记（含 React 清节点后的自愈重挂）。
 *
 * v0.1.18 变更：修复 v0.1.16 引入的「卡片按钮全部消失」
 *  - v0.1.16 的去嵌套是「双向删除」，且单趟遍历 —— 微博信息流的 DOM 里有个
 *    包住整个 feed 的巨型容器，它排在候选前面时会把后面每张真卡当成
 *    「内层」全删光，最后只剩一个，按钮自然不见了。
 *  - 修法一：第一趟先剔除「宽度 > 视口 90%」的巨型容器 —— 治本，
 *    容器不在池子里，后面的包含关系就不会误伤真卡。
 *  - 修法二：第二趟只做「跳过」，永不删除。既是内层就跳过（重复），
 *    既是外层也跳过（同样重复，已收录那张已覆盖这条微博）。
 *    两者都只跳过当前候选，已收录的保持不动 —— 结果与顺序无关。
 *  - 8 组顺序测试覆盖：巨型在前/正常/双层两种顺序/只有容器/
 *    三张独立/容器混排/顺序全乱
 *
 * v0.1.17 变更：视频下载（依据用户实测日志）
 *  - 修 extOf 把数字当扩展名：\w 会匹配数字，于是 URL 末尾 "/abc_00" 被判成 ".00"，
 *    文件名变成「微博#腐团儿Ikaros#2304291523#00」这种鬼样子。
 *    改为 [A-Za-z]{2,4} + 媒体类型白名单，不在表里的一律走 fallback。
 *  - Referer 按 URL 构造：视频 CDN 有防盗链，只带站点根会 403。
 *    （该 Referer 方案已于 v0.1.20 撤回 —— 查参考脚本确认不需要 uid。）
 *  - 空资源日志打印 HTTP status / content-type / size —— 403 与 200空体
 *    是两类完全不同的故障，之前日志看不出区别。
 *
 * v0.1.16 变更：修复「同一张卡出现两个下载按钮」
 *  - 真因：微博一条动态在 DOM 里常有两层「像卡片」的节点 —— 外层容器
 *    （头像+正文+九宫格+互动栏）与内层 section（正文+图）。两层尺寸都过
 *    240×120 门槛，collectCards 同时留着它们，injectCardButtons 各注入一个按钮。
 *  - 修法一：collectCards 增加去嵌套（node.contains 判包含，只留外层）
 *  - 修法二：injectCardButtons 注入前检查祖先是否已挂按钮（兜底，防绕过）
 *  - 日志新增「去嵌套」计数
 *
 * v0.1.15 变更：下载入口收敛为一个
 *  - 删除卡片顶部的两个入口：独立标签 .wb-tap-label（头像右侧）
 *    与时间戳标签 .wb-tap（时间戳后面）。用户反馈「头像右侧那个不要」。
 *  - 右下角按钮 .wb-card-dl 改为常驻（v0.1.5 起是 hover 才出现，
 *    滚动时一闪一闪、找不到入口）。现在常驻半透明，hover 加深。
 *  - injectTapLabel / findCardLink / looksLikeTimestamp 等相关代码一并清除
 *  - enhanceCards 退化为「只打标记」，按钮注入统一交给 injectCardButtons
 *
 * v0.1.14 变更：修复「单视频下载失败」
 *  - 顶层视频（page_info）原本没调 fetchVideoHD —— 只有 mix_media 分支调了，
 *    于是单视频永远拿不到 tv 组件接口的最高画质。现在顶层视频也走。
 *  - 降级链补全。media_info 里实际可用字段（查证 m.weibo.cn 返回结构）：
 *    stream_url_hd / mp4_hd_url / mp4_sd_url / h5_url / download_url / urls{}
 *    原链只覆盖 5 个，其余全没认 → 单视频直接判空 → 下载失败
 *  - 新增 pickVideoByUrlMap：urls 对象形态兜底，按键名画质标记排序取最优
 *  - object_id 四级兜底（page_info → media_info → page_id → status）
 *  - object_type 不止 live/video，也有 stream_url 本身就是 m3u8 的情况
 *  - topMediaUrl 变 async，调用处已加 await
 *
 * v0.1.13 变更：根治「同页里部分卡片没有下载入口」
 *  - 主入口改为「独立注入的 <span class="wb-tap-label">」，用 CSS 绝对定位到卡片顶部。
 *    老做法是「先找到时间戳那个 <a>，再挂 .wb-tap」—— 这条链路三处依赖未知
 *    （是不是 a / 有没有 href / 文本什么格式），微博改任一处就静默丢入口。
 *    新做法不找任何东西：只要卡片被识别到，标签必然出现。
 *  - 时间戳「下载」标签降级为增强项，找不到也不影响主入口
 *  - collectCards 合并过小的候选卡：微博把一张卡拆成多个 section 时，
 *    每段会被误当一张卡，而真正承载整条内容的容器反而漏掉
 *  - cardHasMedia 放宽：除 <img>/<video> 外，也认 background-image /
 *    图床链接（微博新版部分图不用 <img>）
 *  - cardHasMedia 加 WeakMap 缓存（getComputedStyle 在三轮调用里重复算会拖慢 flush）
 *  - 诊断新增：合并小卡数、下载标签数/实际可见数
 *
 * v0.1.12 变更：修复「同页里有的卡片有下载入口、有的没有」
 *  - 真因：findCardLink 的时间戳兜底正则只认「10-1 / 今天 / 刚刚 / 18:30」，
 *    漏了「10小时前 / X分钟前 / X天前 / 10月1日」等写法。
 *    用户实测同页两条九宫格，「10-1 21:48」的有、「10小时前」的没有。
 *  - 正则改为「包含即命中」，宁可多挂也不漏挂
 *  - findCardLink 增加两级兜底：① href 像 mblog 的无文本链接
 *    ② 时间戳可能是 <span>/<time>（无 href），之前只查 a[href] 会整条落空
 *  - 兜底造标签时不再复用 card.querySelector('a[href]')（可能是头像/话题链接，
 *    挂上去会跟着作者主页跳），改为造独立 span 只作载体
 *  - 诊断菜单新增「未挂入口的原因」三项计数，定位到具体是哪一关挡的
 *
 * v0.1.11 变更：修复「卡片按钮显示不稳定」的 6 个根因
 *  1. applyBatchMode 退出批量时无条件 display=''，忽略 isCardBtn 开关
 *     → 开关关着却把按钮亮回来（两处 inline display 控制打架）
 *  2. 批量模式硬编码 display:none，未走统一函数
 *  3. 新注入的卡片不按开关决定初始状态 → 开关关着时新卡片仍带可见按钮
 *  4. 尺寸守卫把懒加载卡片（rect=0）当"太小"永久放弃
 *     → 表现为「有的卡有按钮有的没有，滚动后还不出现」
 *  5. wbPending 标记的卡片不会触发新 mutation，flush 不主动清理
 *  6. React 复用节点清掉注入的 button，但 wbDlBtn 标记还在 → 永远不重挂
 *     → 表现为「滚动来回后某些卡片的按钮突然消失」
 *  诊断菜单新增：未隐藏/待布局/尺寸太小 三类计数
 *
 * v0.1.10 变更：
 *  - 修复 livephoto 视频文件名：曾落盘成「xx#03.mp4-live.bin」
 *    真因：'-live' 被追加到整个文件名末尾（扩展名之后），再进 safeDownloadName
 *    时末尾已无合法扩展名 → 兜底压成 .bin。MP4 内容套了个假扩展名。
 *    修法：'-live' 插在扩展名之前；safeDownloadName 另加一层兜底，
 *    能识别「扩展名被修饰片段甩到前面」的情况并归位。
 *
 * v0.1.9 变更：
 *  - 落盘从「全串行」改为「错峰批量」：批内并发 + 批间让路
 *  - WHY 不直接全并发：浏览器同一瞬间只接收一个下载任务，多余的静默丢弃
 *    （Tampermonkey issue #1113 实锤要求 "add a delay between file saving"）。
 *    全串行虽稳但慢——每张图都要等 onload 才下一个，被网络往返卡死。
 *  - 面板可调批大小(1-8) / 批间隔(0-3000ms)，默认 3 / 260ms
 *  - 油猴菜单新增：安全模式（全串行）/ 极速模式（批5·120ms）/ 恢复默认
 *
 * v0.1.8 变更：
 *  - 删除面板里的「命名选项」区（7 字段拖拽 + 显示条数输入框）
 *    命名已由 v0.1.3 的模板系统接管（油猴菜单「🏷 设置命名模板」），
 *    两套 UI 并存只会让人不知道该改哪个
 *  - 一并清掉旧命名体系（NAME_FIELDS / nameOrder / buildFilename）
 *  - 顺带修一个不一致：面板标题此前用旧 buildFilename，与真实文件名不同源
 *  - 自绘脚本图标（@icon 内联 SVG data URI）
 *    原 weibo.com/favicon.ico 实测返回 200 但 size=0（空响应，图标不显示）
 *
 * v0.1.7 变更：
 *  - 面板从左上角挪到左下角（原先跟微博左侧导航栏打架）
 *  - 面板内容顺序不变（主按钮仍在顶部），只是整个盒子贴底
 *  - 卡片下载按钮从左上挪到右下（原先压住头像）

 *  - 修复下载按钮出现在头像旁：按钮从左上挪到右下（微博卡片唯一稳定留白位）
 *  - 修复「媒体反查」无最小尺寸门槛 —— 头像/表情/认证徽章这些 sinaimg 小图
 *    会让上溯停在小容器上，按钮被塞到头像边。closestCard + 两个注入点
 *    统一加尺寸守卫（宽 ≥200px 且 高 ≥80px）
 *
 * v0.1.6 变更：
 *  - 修复话题聚合页（/hot/weibo/xxx）卡片识别 0 命中：
 *    v0.1.5 只认 href 正则一种入口，话题页链接格式不同 → 整条链路失守
 *  - 卡片识别改三路并用：href 正则 / data-oid·mid 属性 / 媒体元素反查
 *  - mblog id 提取改多来源（data-oid → href → data-mid → innerHTML 兜底）
 *  - 上溯深度 12 → 16，新增「含媒体即候选」终止条件
 *  - 每次 collectCards 打一行诊断日志；油猴菜单新增「卡片识别诊断」
 *
 * v0.1.5 变更：
 *  - 新增卡片级下载按钮：鼠标移到卡片上，左上角浮现「⬇ 下载」
 *  - 时间戳入口保留，两者等价（都下载整条微博的所有媒体）
 *  - 批量模式下自动隐藏卡片按钮，避免误触；勾选圈挪到右上角分居
 *  - 面板加「卡片按钮」开关，可整体关掉
 *
 * v0.1.4 变更：
 *  - 批量下载提到面板第一行，做成常驻主按钮（原来挤在开关堆里，
 *    用户反馈「批量关掉怎么下载」= 语义不清、入口太隐蔽）
 *  - 按钮文案改显式 label，不再靠 textContent.slice(2) 切前缀
 *    （批量文案变长后 slice 会把文字切坏）
 *  - 批量关闭后下载入口不受影响，已在代码层面确认
 *
 * v0.1.3 变更：
 *  - 命名模板改为用户指定格式：微博#{username}#{uid}#{index}.{ext}
 *  - index 两位补零，单图也带 #01；livephoto 同序号 + -live 后缀
 *  - 修复转发微博命名张冠李戴：媒体属原博主，取原博的昵称+uid
 *  - collectResources 改返回结构化资源清单（序号在收集阶段分配，
 *    不再从 suffix 字符串反解 —— 反解是最容易出错的地方）
 *
 * v0.1.2 变更：
 *  - 修复「有流量但浏览器不提示下载成功」：a.click() 落盘被 Chrome 自动下载
 *    权限拦截（数据由 GM_xmlhttpRequest 拉到，浏览器却不接收下载任务）。
 *    改走 GM_download —— 由扩展直接写磁盘，不受页面下载闸限制。
 *  - 落盘加 onload/onerror/onprogress 回调，状态可见，失败不静默。
 *  - 保留 a.click() 作为兜底（GM_download 不可用时自动切回）。
 */

(function () {
    'use strict';

    const VERSION = '0.1.33';

    // v0.1.33：历史条数上限 —— 面板显示 / 内存 Map / 持久化三处必须一致。
    //
    // WHY 要收口成一个常量（用户反馈「历史能不能仅显示最近的 6 条」）：
    //   改之前三处各写各的，而且**互相对不上**：
    //     · renderPanel  显示层  slice(-n)，n = clamp(cfg.messagesNumber, 3, 40)
    //     · tasks        内存层  只增不减 —— 下载 200 条就是 200 个 Map 项
    //     · setInterval  持久层  slice(-20)  ← 与显示层的 n 毫无关系
    //   结果：用户拖过 messagesNumber 之后，
    //   显示 6 条、磁盘存 20 条、内存留着 200 条，三个数各说各话。
    //   而且 Map 只增不减，滚动一天微博就能把内存吃到几百条。
    //
    // 修法：HISTORY_MAX = 6，三处统一走它。
    const HISTORY_MAX = 6;
    const TAG = `[WeiboSaver-v${VERSION}]`;

    // ══════════════════════════════════════════════════════════════
    // §1  工具层
    // ══════════════════════════════════════════════════════════════

    /** 安全路径取值 */
    function get(obj, path, def) {
        if (!obj) return def;
        const keys = Array.isArray(path)
            ? path
            : String(path).replace(/\[/g, '.').replace(/\]/g, '').split('.');
        const out = keys.reduce((o, k) => (o == null ? undefined : o[k]), obj);
        return out === undefined ? def : out;
    }

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const pad = (n, w) => String(n).padStart(w || 2, '0');
    const fmt = (n) => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(n);

    /** 文件名清洗：跨平台非法字符 + 零宽字符 */
    const INVALID_CHARS = {
        '\\': '＼', '/': '／', '|': '｜', '<': '＜', '>': '＞',
        ':': '：', '*': '＊', '?': '？', '"': '＂', "'": '＇',
        '‌': '', '‍': '', '⁠': '', '﻿': '',
        '\n': ' ', '\r': ' ', '\t': ' ',
    };
    function cleanName(s) {
        return String(s == null ? '' : s)
            .split('')
            .map((c) => (INVALID_CHARS[c] !== undefined ? INVALID_CHARS[c] : c))
            .join('')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /** 微博 CDN 尺寸段 → /large/ */
    const IMAGE_SIZE_PATTERNS = [
        'thumb180', 'thumb300', 'square', 'bmiddle', 'mw690',
        'mw1024', 'orj360', 'orj480', 'webp720', 'crop',
    ];

    /**
     * 头像图必须在换档前排除 —— /avatar/ /crop. 换档后会指向不存在的图。
     * 这是 §10.12「改一个 URL 参数必须覆盖所有取值」的单测暴露：测出 avatar 被误换成 large。
     */
    function toLargeUrl(url) {
        if (typeof url !== 'string' || !url) return null;
        if (!url.includes('sinaimg.cn') && !url.includes('sina.cn')) return null;
        if (isAvatarImage(url)) return null;   // ← BUG 修复：头像不换档
        for (const size of IMAGE_SIZE_PATTERNS) {
            if (url.includes(`/${size}/`)) return url.replace(`/${size}/`, '/large/');
        }
        const m = url.match(/(\.sinaimg\.cn\/)([a-z0-9]+\/)/);
        return m ? url.replace(m[2], 'large/') : url;
    }

    /** 头像图排除 —— 否则批量下载会混进一堆 50px 头像 */
    function isAvatarImage(url) {
        if (typeof url !== 'string') return true;
        return url.includes('/avatar') || url.includes('/crop.') ||
            url.includes('_cute') || url.includes('_online') ||
            url.includes('/profile/');
    }

    /** 从 URL 推导扩展名；无扩展名按 fallback 猜 */
    function extOf(url, fallback) {
        const fb = fallback || 'jpg';
        if (typeof url !== 'string' || !url) return fb;
        // v0.1.17：字母开头 + 白名单双条件。
        // 白名单里含 m3u8 / mp4-720 这类带数字的，所以不能只靠 [A-Za-z]{2,4}
        // （那样会漏掉 m3u8）。真正的把关是 MEDIA_EXTS 白名单 ——
        // 纯数字后缀（_00 / _12 / .2024）不在表里，一律挡掉走 fallback。
        const m = url.split('?')[0].match(/\.([A-Za-z][A-Za-z0-9]{1,3})$/);
        if (!m) return fb;
        const ext = m[1].toLowerCase();
        if (ext === 'json' || ext === 'php' || ext === 'html') return fb;
        // v0.1.17：加媒体类型白名单。
        //
        // 真因（用户实测）：\w 会把数字当字母，于是 URL 末尾的 "/abc_00"
        // 被判成 ".00" 扩展名 —— 文件名就变成「微博#xxx#00.00」这种鬼样子。
        // 白名单只收已知媒体类型，其余一律走 fallback（调用方传的 item.ext）。
        const MEDIA_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'avif',
            'mp4', 'm4v', 'mov', 'mkv', 'avi', 'flv', 'ts', 'm3u8', 'webm', '3gp',
            'mp3', 'm4a', 'aac', 'wav', 'bin', 'part', 'txt'];
        if (!MEDIA_EXTS.includes(ext)) return fb;
        return ext;
    }

    /** 微博 href → mblog id：/1234567890/ABCdefGHI → ABCdefGHI */
    function idFromHref(href) {
        if (typeof href !== 'string') return null;
        const m = href.match(/\/(\d{6,})\/([A-Za-z0-9]+)/);
        return m ? m[2] : null;
    }

    /**
     * GM_download 的 name 有扩展名白名单限制（Tampermonkey 选项页可配）。
     * 微博文件名是用户拼的，可能出现 `.用户-时间` 这种"扩展名"，
     * 直接传会被 GM 拒掉。统一压成安全扩展名。
     */
    function safeDownloadName(name) {
        let s = String(name).trim() || 'weibo';

        // 情况 1：末尾本来就是合法扩展名 → 直接用
        const hasExt = /\.[A-Za-z0-9]{2,4}$/.test(s);
        // 情况 2：末尾是 "-live" / "-part01" 这类修饰片段，扩展名被甩到了它前面
        //   （旧版 bug：拼接顺序错了，得到 "xx#03.mp4-live" 被压成 .bin）
        if (!hasExt) {
            const fixed = s.match(/^(.*\.[A-Za-z0-9]{2,4})[-_][A-Za-z0-9]{1,8}$/);
            if (fixed) s = fixed[1];
        }

        const m = s.match(/^(.*?)(\.[A-Za-z0-9]{2,4})$/);
        if (m) return `${m[1].trim() || 'weibo'}${m[2].toLowerCase()}`;
        return `${s}.bin`;
    }

    /**
     * 落盘：GM_download 优先，a.click() 兜底。
     *
     * v0.1.2 修复：a.click() 触发的下载受 Chrome「自动下载多个文件」权限限制。
     * GM_xmlhttpRequest 拉数据走扩展特权（流量正常），但 a.click() 是页面级下载，
     * 连续多个文件会被浏览器静默拦截 —— 表现是「有流量但下载列表里什么都没有」。
     * GM_download 由扩展直接写磁盘，绕开页面下载闸。
     */
    /**
     * 大文件阈值（字节）。超过这个体积就走原生下载，不用 GM_download。
     *
     * WHY（v0.1.22 实测推论 + 参考脚本佐证）：
     * GM_download 对 blob: URL + 大文件这个组合有已知问题 —— 要么超时，
     * 要么被油猴「下载」设置里的权限策略拦掉，表现为「有流量但没有文件」。
     * OWENDSWANG 参考脚本（GreasyFork 430877）干脆把整个 GM_download 分支
     * 注释掉了，代码里留了一句：「这个方法也可以，而且不是走 GM_download，
     * 不会被油猴设置里的下载选项影响」。
     *
     * 小文件走 GM_download —— 那条路已经真实验证过能落盘（v0.1.2 用户确认
     * 「有下载产物」），不用动。
     */
    const BIG_FILE_BYTES = 2 * 1024 * 1024;   // 2MB

    /**
     * v0.1.23：视频强制走原生落盘，不看体积。
     *
     * WHY 不按体积分（v0.1.22 那版按 2MB 分是错的）：
     *   视频必须经过「拉成 blob → createObjectURL → a[download]」这条路，
     *   因为 URL 跨域，download 属性不生效（详见 v0.1.23 头部注释）。
     *   既然已经拿到 blob 了，落盘方式只剩一个选择问题，
     *   而参考脚本用原生落盘是验证过的（GreasyFork 4000+ 用户在用）。
     *   GM_download 对 blob: URL 有油猴「下载」设置层面的干扰，反而不稳。
     *
     *   图片则相反：图片 URL（sinaimg.cn）虽然也跨域，但姐姐的图片链路
     *   一直是 fetchBlob → GM_download，用户确认过「有下载产物」，
     *   那条路已验证能用，不动。
     */
    function isBigBlob(blob, forceNative) {
        if (forceNative) return true;                 // 视频：无条件原生
        if (!blob) return false;
        if (typeof blob === 'string') return false;
        const size = typeof blob.size === 'number' ? blob.size : 0;
        return size > BIG_FILE_BYTES;
    }

    /**
     * 视频直落：把跨域 URL 交给 GM_download，扩展自己去拉。
     *
     * v0.1.24 新增。这是视频的第三条路，也是最稳的一条。
     *
     * 对比三条路：
     *   ① <a href=跨域URL download>   → download 属性失效，页面导航（v0.1.22 踩过）
     *   ② GM_xmlhttpRequest → blob → a.click()
     *      → blob 几 MB 时扩展 timeout 可能不触发，Promise 悬死（v0.1.23 踩过）
     *   ③ GM_download({url: 跨域URL})  → 扩展特权拉取，不受上面两个问题影响 ✅
     *
     * GM_download 不是浏览器原生 <a>，它是 Tampermonkey 的 API：
     *   - 不受同源限制，跨域 URL 照下
     *   - 不需要 blob 中转，零内存拷贝
     *   - 保留 onprogress 进度回调和自定义文件名
     *
     * 参考脚本（OWENDSWANG）注释掉 GM_download 是因为它下发 blob；
     * 我们这里下发的是 URL，场景不同，不能照搬结论。
     */
    /**
     * v0.1.31 参数纠正：第三个参数名叫 `doneCb`，不是 `done`。
     *
     * 隐藏 bug（姐姐自查发现，用户实测无法触发）：
     *   调用方传进来的第三个参数是 downloadWeibo 里的进度计数器
     *   `const done = { q: 0, total: mediaItems.length }` —— **一个对象**。
     *   而函数体里写的是 `done && done(true)` —— 当函数调。
     *   对象是 truthy，所以 `done && ` 这道保护形同虚设，
     *   `done(true)` 必然抛 `TypeError: done is not a function`。
     *
     * 为何之前还能「下载成功」：
     *   GM_download 是扩展在后台独立下载的，文件照样落盘 —— 肉眼看着没问题。
     *   但脚本侧回调链全断：onload 抛错后后续收尾不执行、
     *   onerror 抛错会吞掉降级逻辑、进度条永远停在中间态。
     *   这类「看起来能用但状态永远不对」的 bug 最难发现 ——
     *   因为它不报错、不影响下载结果，只污染状态机。
     *
     * 修法：改名 doneCb + 加函数类型校验，让传错时立刻暴露而不是静默半死。
     */
    function saveVideoViaGM(url, info, item, doneCb, fallbackBlob) {
        const finish = typeof doneCb === 'function'
            ? doneCb
            : (ok) => console.warn(
                `${TAG} saveVideoViaGM: doneCb 不是函数（收到 ${typeof doneCb}），已忽略回调`);
        if (typeof doneCb !== 'function') {
            console.warn(`${TAG} saveVideoViaGM: doneCb 类型异常 ${typeof doneCb}（应为 function）`);
        }
        let fallbackTried = false;   // 只降级一次，避免 onerror/onload 互踩导致死循环
        // v0.1.30：记录 onprogress 的字节数，onload 时校验完整性。
        // WHY：GM_download 的 onload 语义是「任务结束」而非「下载成功」，
        //   浏览器下载条中途停掉（网络抖动 / 扩展被拦）时它照样调 onload，
        //   于是脚本报「✅ 完成」而磁盘上是残缺文件 —— 用户看着就是「停下载了」。
        let lastLoaded = 0, lastTotal = 0;
        const name = safeDownloadName(renderName(info, item.index, 'mp4'));
        console.log(`${TAG} 视频直落 GM_download ${name}`);
        console.log(`${TAG}   → ${String(url).slice(0, 110)}`);

        // v0.1.26：GM_download 拿跨域 URL 时，Tampermonkey 的「下载方式」设置
        // 会决定行为：设为「浏览器 API」时跨域 URL 会被扩展的下载器拒收，
        // 表现为「点了没反应 / 立刻失败」。这里把 settings 里的相关线索打出来，
        // 下次不用再猜到底是哪一层拒的。
        console.log(
            `${TAG} GM_download 直落 | 下载方式=${GM_info && GM_info.downloadMode || '未知'} ` +
            `| 名称安全=${safeDownloadName(renderName(info, item.index, 'mp4')).length <= 120 ? 'OK' : '过长'} ` +
            `| URL长度=${String(url).length}`
        );

        if (typeof GM_download !== 'function') {
            console.warn(`${TAG} GM_download 不可用，回退 blob 路径`);
            return null;   // 交回调用方走 blob 分支
        }

        try {
            GM_download({
                url: String(url),
                name,
                headers: { referer: 'https://weibo.com/' },
                onprogress: (e) => {
                    if (e && typeof e.loaded === 'number' && e.total) {
                        lastLoaded = e.loaded;
                        lastTotal = e.total || 0;
                        // 只在整 10% 打一次，避免刷屏
                        const pct = Math.floor((e.loaded / e.total) * 10) * 10;
                        if (pct > 0 && pct % 20 === 0) {
                            console.log(`${TAG}   下载中 ${pct}%`);
                        }
                    }
                },
                onload: () => {
                    // v0.1.30 关键校验：onload 只代表「任务结束」，不代表字节完整。
                    // 用户实测「停下载了」—— 浏览器下载条走到一半就停，
                    // 但 GM_download 照样会调 onload（它是「结束」不是「成功」）。
                    // 唯一可靠的判据：收到的字节数是否等于 Content-Length。
                    const got = lastLoaded;
                    const want = lastTotal;
                    const short = want > 0 && got > 0 && got < want;
                    if (short) {
                        console.warn(
                            `${TAG} GM_download ⚠ 字节不全 ${name} ` +
                            `${(got / 1048576).toFixed(2)}MB / ${(want / 1048576).toFixed(2)}MB ` +
                            `（${Math.round(got / want * 100)}%）— 转 blob 路径重下`
                        );
                        // 不报成功，转 blob 路径拿完整字节
                        if (fallbackBlob && !fallbackTried) {
                            fallbackTried = true;
                            console.warn(`${TAG} 转 blob + saveAs 路径重下（确保字节完整）`);
                            fallbackBlob(url, name, finish);
                            return;
                        }
                    }
                    console.log(
                        `${TAG} GM_download ✅ 视频 ${name}` +
                        (want > 0 ? `（${(got / 1048576).toFixed(2)}MB 完整）` : '')
                    );
                    // v0.1.28：直落的视频在落盘阶段返回前就已经在后台下载了，
                    // 所以这里要把任务状态改成「完成」，否则进度条会一直停在
                    // 「已交给浏览器下载」不动。
                    if (item && typeof item.onGMDone === 'function') {
                        item.onGMDone(true);
                    }
                    finish && finish(true);
                },
                onerror: (e) => {
                    // v0.1.26：把 GM_download 返回对象的每个字段都打出来。
                    // WHY：之前只打 e.error，很多情况下那个字段是 undefined，
                    // 导致「失败了但看不出为什么」。全字段 JSON 化后一眼能分清
                    // not_enabled / not_whitelisted / not_permitted /
                    // not_supported / not_succeeded 这五种完全不同的原因。
                    console.warn(`${TAG} GM_download ❌ 视频 ${name} 全字段:`, JSON.stringify(e));
                    // ⚠ 不只报错 —— 自动降级到参考脚本那套（blob + saveAs）。
                    // 理由：GM_download 是「锦上添花」，失败了不该让整个下载停摆。
                    // 参考脚本（OWENDSWANG v1.5.3）注释掉 GM_download 用
                    // GM_xmlhttpRequest + createObjectURL，一样能下 ——
                    // 这条路已经被 4000+ 用户验证过。
                    if (fallbackBlob && !fallbackTried) {
                        fallbackTried = true;
                        console.warn(`${TAG} GM_download 失败，降级 blob + saveAs 路径`);
                        fallbackBlob(url, name, finish);
                        return;
                    }
                    if (item && typeof item.onGMDone === 'function') item.onGMDone(false);
                    finish && finish(false);
                },
                ontimeout: () => {
                    console.warn(`${TAG} GM_download ⏱ 视频 ${name}（5 分钟未完成）`);
                    if (fallbackBlob && !fallbackTried) {
                        fallbackTried = true;
                        fallbackBlob(url, name, finish);
                        return;
                    }
                    if (item && typeof item.onGMDone === 'function') item.onGMDone(false);
                    finish && finish(false);
                },
            }, { timeout: 300000 });   // 视频给 5 分钟
            return true;
        } catch (e) {
            console.warn(`${TAG} GM_download 调用异常，回退 blob`, e && e.message);
            return null;   // ← 交回调用方，让它落回 blob 路径
        }
    }

    /**
     * 视频兜底路径：GM_xmlhttpRequest 拉成 blob → saveAs 落盘。
     *
     * v0.1.26 新增。抄自参考脚本（OWENDSWANG v1.5.3）的 downloadWrapper 非 zip 分支，
     * 那套在 GreasyFork 上有 4000+ 用户在用，验证过能下微博视频。
     *
     * 关键点（与姐姐早前几版的区别）：
     *   ① 先拉成 blob（跨域 URL 直接给 <a download> 会导航，v0.1.22 踩过）
     *   ② createObjectURL(blob) 变成同源，download 属性才生效
     *   ③ a.click() 之后 setTimeout(1000) 才清节点（v0.1.22 修对的那条）
     *   ④ 失败会走 downloadError 那一侧，可点重试 —— 不静默
     *
     * 与 saveBlob 的区别：saveBlob 的 blob 是上游已经拉好的，
     * 这里自己拉一遍；且不受 GM_download 的任何设置影响。
     */
    function saveVideoViaBlob(url, name, doneCb) {
        // v0.1.31：同样加类型校验（此前这里是裸 done(...)）
        const finish = typeof doneCb === 'function'
            ? doneCb
            : (ok) => console.warn(
                `${TAG} saveVideoViaBlob: doneCb 不是函数（收到 ${typeof doneCb}），已忽略回调`);
        try {
            gmRequest({
                method: 'get',
                url: String(url),
                responseType: 'blob',
                headers: {
                    referer: 'https://weibo.com/',
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                },
                timeout: 180000,   // 视频给 3 分钟
            }).then((res) => {
                if (isEmptyResult(res)) {
                    console.warn(`${TAG} 视频 blob 兜底也空 status=${res.status} size=${res.response && res.response.size}`);
                    finish && finish(false);
                    return;
                }
                // v0.1.30：blob 兜底也要确认字节完整 ——
                // Content-Length 与实际 Blob 大小对不上说明中途被截断，
                // 直接落盘就是残缺文件（用户看着就是「停下载了」）。
                const blob = res.response;
                const want = Number(res.headers && (
                    res.headers['content-length'] || res.headers['Content-Length']
                )) || 0;
                if (want > 0 && blob.size > 0 && blob.size < want) {
                    console.warn(
                        `${TAG} blob 兜底字节不全 ${name} ` +
                        `${(blob.size / 1048576).toFixed(2)}MB / ${(want / 1048576).toFixed(2)}MB — 判定失败`
                    );
                    finish && finish(false);
                    return;
                }
                console.log(`${TAG} blob 兜底完整 ${name}（${(blob.size / 1048576).toFixed(2)}MB）`);
                fallbackSave(blob, name, finish);
            }).catch((e) => {
                console.warn(`${TAG} 视频 blob 兜底失败`, e && e.message);
                finish && finish(false);
            });
        } catch (e) {
            console.warn(`${TAG} saveVideoViaBlob 调用异常`, e && e.message);
            finish && finish(false);
        }
    }

    function saveBlob(blob, filename, onProgress, onDone, forceNative) {
        // v0.1.23：视频（forceNative）无条件走原生；其他大文件按体积分
        if (isBigBlob(blob, forceNative)) {
            const size = blob.size;
            console.log(
                forceNative
                    ? `${TAG} 落盘：视频走原生（blob → 同源 download，跨域 URL 不能直接下载）`
                    : `${TAG} 落盘走原生下载（大文件 ${(size / 1048576).toFixed(1)}MB）` +
                      ` — GM_download 对 blob: URL + 大文件易超时/被拦`
            );
            fallbackSave(blob, filename, onDone);
            return;
        }
        // GM_download 5.4.6226+ 支持传 Blob；老版本只吃 URL
        if (typeof GM_download === 'function') {
            try {
                GM_download({
                    url: typeof blob === 'string' ? blob : URL.createObjectURL(blob),
                    name: safeDownloadName(filename),
                    onprogress: (e) => {
                        if (onProgress && e && typeof e.loaded === 'number') {
                            onProgress(e.loaded, e.total || 0);
                        }
                    },
                    onload: () => { console.log(`${TAG} GM_download ✅ ${filename}`); onDone && onDone(true); },
                    onerror: (e) => {
                        console.warn(`${TAG} GM_download ❌ ${filename}`, e && (e.error || e.details || e));
                        // GM_download 失败不静默 —— 兜底走 a.click()
                        fallbackSave(blob, filename, onDone);
                    },
                    ontimeout: () => { console.warn(`${TAG} GM_download ⏱ ${filename}`); fallbackSave(blob, filename, onDone); },
                }, { timeout: 120000 });
                return;
            } catch (e) {
                console.warn(`${TAG} GM_download 调用异常，转 a.click()`, e.message);
            }
        }
        fallbackSave(blob, filename, onDone);
    }

    /** a.click() 兜底（GM_download 不可用或失败时） */
    function fallbackSave(blob, filename, onDone) {
        try {
            const url = typeof blob === 'string' ? blob : URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            // ⚠ v0.1.22 真因修复：a.remove() 不能紧跟 click()。
            //
            // WHY：a.click() 只是「通知」浏览器发起下载，节点必须在 DOM 里
            // 再活一会儿，Chrome 才真的把下载任务建起来。立刻 remove 的话，
            // 下载请求可能压根没发出 —— 表现是「脚本报成功，下载列表里什么都没有」。
            // 图片小、并发少时侥幸能成；视频动辄几 MB 到几十 MB，翻车率极高。
            //
            // 参考脚本（OWENDSWANG v1.5.3 saveAs）也是 setTimeout(1000) 才清：
            //   link.click();
            //   setTimeout(() => { URL.revokeObjectURL(link.href);
            //                        link.parentNode.removeChild(link); }, 1000);
            //
            // 这里给 2000ms —— 视频更大，留足建任务的时间。
            setTimeout(() => {
                if (a.parentNode) a.parentNode.removeChild(a);
                if (typeof blob !== 'string') {
                    // v0.1.30 真因（用户实测「停下载了」）：
                    //   revokeObjectURL 一执行，Chrome 正在读的那个流立刻断掉 ——
                    //   下载停在中途（几 MB 到几十 MB 的视频必现）。
                    //   之前写死 60000ms，意思是「60 秒后无条件抽走」，
                    //   慢一点的视频那时还没下完 → 下载被腰斩。
                    //
                    //   为什么不能简单改成一个大数字：
                    //     1. blob 一直占着内存，批量下几十张图会把标签页撑爆
                    //     2. 到底多久合适取决于网速和文件大小，没法一次写死
                    //
                    //   修法：**不猜时间，改成确认下载真的开始读流了再释放**。
                    //     fetch(blobURL) 是读同一个 blob 的无损手段 ——
                    //     它拿到 headers 说明 Chrome 已经把 blob 关联上，
                    //     之后释放不会影响正在跑的下载任务。
                    //     若 2 秒内还没关联上（极小文件已下完 / 浏览器拒收），
                    //     退回 5 分钟兜底，避免无限占内存。
                    const releaseLater = (delay) => {
                        setTimeout(() => {
                            try { URL.revokeObjectURL(url); } catch (e) { /* 已释放 */ }
                        }, delay);
                    };
                    const probe = setTimeout(() => releaseLater(300000), 2000);
                    try {
                        fetch(url, { method: 'GET' }).then((res) => {
                            clearTimeout(probe);
                            // 拿到响应头 = Chrome 已认下这个 blob，可安全释放
                            console.log(`${TAG} blob 已关联（${res.status}），释放 URL；大文件继续由浏览器写盘`);
                            releaseLater(60000);
                            if (res.body && res.body.cancel) res.body.cancel().catch(() => {});
                        }).catch(() => {
                            clearTimeout(probe);
                            releaseLater(300000);
                        });
                    } catch (e) {
                        clearTimeout(probe);
                        releaseLater(300000);
                    }
                }
            }, 2000);
            console.log(`${TAG} 落盘已触发 ${filename}${typeof blob === 'string' ? '' : `（blob ${(blob.size / 1048576).toFixed(2)}MB）`}`);
            onDone && onDone(true);
        } catch (e) {
            console.error(`${TAG} 落盘失败 ${filename}`, e);
            onDone && onDone(false);
        }
    }

    // ══════════════════════════════════════════════════════════════
    // §2  配置层
    // ══════════════════════════════════════════════════════════════

    const CFG_KEYS = {
        isEnable: 'wb_enable',
        isEnhance: 'wb_enhance',
        isHideAd: 'wb_hide_ad',
        isHideHot: 'wb_hide_hot',
        isHideVip: 'wb_hide_vip',
        isBigImage: 'wb_big_image',
        isBatch: 'wb_batch',
        isCardBtn: 'wb_card_btn',   // v0.1.5 卡片级下载按钮
        saveBatch: 'wb_save_batch',   // v0.1.9 落盘错峰批大小
        saveGap: 'wb_save_gap',       // v0.1.9 批间隔(ms)
        isImageHD: 'wb_image_hd',
        isVideoHD: 'wb_video_hd',
        isPack: 'wb_pack',
        isIncludesText: 'wb_includes_text',
        isSaveHistory: 'wb_save_history',
        isAutoHide: 'wb_auto_hide',
        messagesNumber: 'wb_messages_number',
        vidCover: 'wb_video_cover',
        isVideoViaBlob: 'wb_video_blob',
    };

    const defaults = {
        isEnable: true,
        isEnhance: true,
        isHideAd: true,
        isHideHot: false,
        isHideVip: false,
        isBigImage: true,
        isBatch: false,
        isCardBtn: true,
        // 落盘错峰：浏览器同一瞬间只接一个下载（TM issue #1113 实锤），
        // 完全并发必丢文件。折中方案——批内紧邻、批间留缝。
        saveBatch: 3,
        saveGap: 260,
        // 原图是摄影刚需，默认开（参考脚本默认关）
        isImageHD: true,
        isVideoHD: true,
        isPack: false,
        isIncludesText: false,
        isSaveHistory: true,
        isAutoHide: false,
        messagesNumber: 6,
        isVideoViaBlob: false,   // v0.1.24 默认直落；勾上则回退 blob

    };

    const cfg = {};
    function loadCfg() {
        for (const name of Object.keys(CFG_KEYS)) {
            cfg[name] = GM_getValue(CFG_KEYS[name], defaults[name]);
        }
        // v0.1.1 迁移：打包默认从 true 改 false。已存过 true 的用户需要重置一次。
        // 不做这个迁移的话，用户升级后行为不变，等于修复没生效。
        const stamp = GM_getValue('wb_config_stamp', '');
        if (stamp !== VERSION) {
            cfg.isPack = defaults.isPack;
            GM_setValue(CFG_KEYS.isPack, cfg.isPack);
            GM_setValue('wb_config_stamp', VERSION);
            console.log(`${TAG} 配置已迁移到 v${VERSION}（打包默认已改为「关」）`);
        }
    }
    loadCfg();

    /** 命名模板 7 字段 —— 沿用 wah0713 字段集 */
    /**
     * 面板按钮定义（v0.1.4 提到模块级）
     * —— 必须在模块级：syncPanelToggles 是独立函数，引不到 bindPanel 里的局部常量。
     * 显式 label 而非 textContent.slice(2)：批量按钮文案变长后 slice 会切坏文字。
     */
    const PANEL_LABELS = {
        '#wb-batch': { key: 'isBatch', on: '✅ 退出批量', off: '📦 批量下载', big: true },
        '#wb-cardbtn': { key: 'isCardBtn', on: '✔️卡片按钮', off: '❌卡片按钮' },
        '#wb-pack': { key: 'isPack', on: '✔️打包', off: '❌打包' },
        '#wb-hd': { key: 'isImageHD', on: '✔️超清图', off: '❌超清图' },
        '#wb-vhd': { key: 'isVideoHD', on: '✔️超清视频', off: '❌超清视频' },
        '#wb-text': { key: 'isIncludesText', on: '✔️正文', off: '❌正文' },
    };

    /**
     * v0.1.3 新命名模板（用户指定）
     *   微博#{username}#{uid}#{index}.{ext}
     *
     * - `#` 是分隔符：字段边界一眼可辨，排序后能看出是谁的哪张图
     * - index 两位补零：保证按文件名排序时 10 排在 2 前面
     * - 单图也带 #01：同一作者的图命名格式统一
     * - livephoto 同序号 + -live 后缀：图和视频成对能对上
     *
     * 占位符：{username} {uid} {mblogid} {time} {index} {ext}
     */
    const NAME_TPL_KEY = 'wb_name_template';
    const NAME_TPL_DEFAULT = '微博#{username}#{uid}#{index}.{ext}';
    let nameTemplate = GM_getValue(NAME_TPL_KEY, NAME_TPL_DEFAULT);

    /** 支持的占位符（油猴菜单提示用） */
    const NAME_TPL_FIELDS = ['username', 'uid', 'mblogid', 'time', 'index', 'ext'];

    /**
     * 超清 URL → mw2000 降级地址映射。
     * ⚠ 必须定义在所有使用点之前（JS 的 TDZ：const 不会 hoisting）。
     *   v0.1.1 首次放在 §8，但 §4 的 collectResources 更早执行 → ReferenceError。
     */
    const fallbackUrls = new Map();

    // v0.1.12：卡片被跳过的原因分布（诊断用）
    const SKIP = { noId: 0, noMedia: 0, tooSmall: 0 };

    const MSG = {
        init: '',
        ready: '准备中',
        empty: '未找到资源',
        failed: '失败，点击重试',
        done: '完成',
    };

    // ══════════════════════════════════════════════════════════════
    // §3  API 层
    // ══════════════════════════════════════════════════════════════

    function gmRequest(opts) {
        return new Promise((resolve, reject) => {
            try {
                GM_xmlhttpRequest(Object.assign({}, opts, {
                    onload: (res) => resolve(res),
                    onerror: (res) => reject(res || new Error('network error')),
                    ontimeout: (res) => reject(res || new Error('timeout')),
                }));
            } catch (e) {
                reject(e);
            }
        });
    }

    /** 单条微博完整数据 */
    async function fetchStatus(id) {
        const res = await gmRequest({
            method: 'get',
            url: `https://weibo.com/ajax/statuses/show?id=${encodeURIComponent(id)}&locale=zh-CN&isGetLongText=true`,
            responseType: 'json',
            headers: { referer: 'https://weibo.com/' },
            timeout: 15000,
        });
        const data = res && res.response;
        if (!data || typeof data !== 'object') {
            throw new Error(`fetchStatus: 空响应 id=${id}`);
        }
        console.log(`${TAG} fetchStatus ✅ id=${id} pic_infos=${!!data.pic_infos} mix=${!!data.mix_media_info} page_info=${!!data.page_info}`);
        return data;
    }

    /** 长文正文 */
    async function fetchLongText(id) {
        try {
            const res = await gmRequest({
                method: 'get',
                url: `https://weibo.com/ajax/statuses/longtext?id=${encodeURIComponent(id)}`,
                responseType: 'json',
                headers: { referer: 'https://weibo.com/' },
                timeout: 15000,
            });
            return get(res, 'response.data.longTextContent', '');
        } catch (e) {
            console.warn(`${TAG} fetchLongText ⚠️ id=${id}`, e.message);
            return '';
        }
    }

    /** 最高画质视频：走 tv 组件接口，按 template 里的 WxH 面积排序 */
    async function fetchVideoHD(oid) {
        if (!oid) return null;
        try {
            const fd = new FormData();
            fd.append('data', JSON.stringify({ Component_Play_Playinfo: { oid: String(oid) } }));
            const res = await gmRequest({
                method: 'post',
                url: `https://weibo.com/tv/api/component?page=/tv/show/${oid}`,
                data: fd,
                responseType: 'json',
                headers: { referer: 'https://weibo.com/' },
                timeout: 15000,
            });
            const urls = get(res, 'response.data.Component_Play_Playinfo.urls', null);
            if (!urls || typeof urls !== 'object') {
                console.log(`${TAG} fetchVideoHD ❌ 无 urls oid=${oid}`);
                return null;
            }
            const list = Object.values(urls)
                .map((u) => (typeof u === 'string' ? (u.startsWith('//') ? 'https:' + u : u) : null))
                .filter(Boolean);
            list.sort((a, b) => {
                const area = (s) => {
                    const m = new URLSearchParams(s).get('template');
                    const mm = m && m.match(/(\d+)x(\d+)/);
                    return mm ? Number(mm[1]) * Number(mm[2]) : 0;
                };
                return area(b) - area(a);
            });
            console.log(`${TAG} fetchVideoHD ✅ oid=${oid} 候选=${list.length} 选中=${list[0] ? 'yes' : 'no'}`);
            return list[0] || null;
        } catch (e) {
            console.warn(`${TAG} fetchVideoHD ⚠️ oid=${oid}`, e.message);
            return null;
        }
    }

    /** 从 media_info 挑最高画质：quality_index → 像素面积 → 码率 */
    function pickBestVideo(mediaInfo) {
        if (!mediaInfo || typeof mediaInfo !== 'object') return null;
        const list = Array.isArray(mediaInfo.playback_list) ? mediaInfo.playback_list : [];
        const scored = list
            .map((item) => {
                const url = get(item, 'play_info.url', '');
                if (!url) return null;
                const q = Number(get(item, 'meta.quality_index', 0)) || 0;
                const br = Number(get(item, 'play_info.bitrate', 0)) || 0;
                const px = (Number(get(item, 'play_info.width', 0)) || 0) *
                    (Number(get(item, 'play_info.height', 0)) || 0);
                return { url, score: q * 1e9 + px * 1e3 + br };
            })
            .filter(Boolean)
            .sort((a, b) => b.score - a.score);
        if (scored.length) return scored[0].url;
        const keys = ['mp4_1080p_mp4', 'mp4_720p_mp4', 'stream_url_hd', 'stream_url'];
        for (const k of keys) {
            if (typeof mediaInfo[k] === 'string' && mediaInfo[k]) return mediaInfo[k];
        }
        return null;
    }

    /**
     * 顶层视频（page_info）
     *
     * v0.1.14 修复「单视频下载失败」：
     * ① 顶层视频原本没调 fetchVideoHD（只有 mix_media 分支调），
     *    于是单视频永远拿不到 tv 组件接口的最高画质，只剩 media_info 里那几个档
     * ② 降级链太短。media_info 里实际可用的字段（已查证 m.weibo.cn 返回结构）：
     *    stream_url_hd / stream_url / mp4_720p_mp4 / mp4_hd_url / mp4_sd_url /
     *    h5_url / urls{...} / download_url
     *    原链只覆盖前两个 + 三个 mp4_xxx，urls/download_url/h5_url 全没认
     * ③ object_id 取值兜底：顶层视频的 object_id 有时在 page_info 下，
     *    有时在 media_info 下，有时整条缺失
     * ④ object_type 不止 'live'/'video'，还有 'livephoto' / 'story' 等
     */
    function topMediaUrl(status) {
        // v0.1.14：转发的视频在 retweeted_status.page_info 里，跟图片一个道理
        const pageInfo = get(status, 'page_info', null)
            || get(status, 'retweeted_status.page_info', null);
        if (!pageInfo) return null;
        const objectType = get(pageInfo, 'object_type', '') || get(status, 'object_type', '');
        const mediaInfo = get(pageInfo, 'media_info', null);

        // 直播（含回放）—— replay_hd / stream_url_hd / stream_url
        if (objectType === 'live' || get(mediaInfo, 'stream_url', '').endsWith('.m3u8')) {
            const live = get(mediaInfo, 'replay_hd', '')
                || get(mediaInfo, 'stream_url_hd', '')
                || get(mediaInfo, 'stream_url', '');
            console.log(`${TAG} topMedia: live → ${live ? 'ok' : 'null'} (replay_hd=${!!get(mediaInfo, 'replay_hd', '')})`);
            if (live) return live;
        }

        // 普通视频：先走 tv 组件接口拿最高画质（顶层视频此前漏了这一步）
        return topMediaUrlAsync(status, pageInfo, mediaInfo, objectType);
    }

    /** 顶层视频的异步部分（要调 tv 组件接口） */
    /**
     * 从 status 里的 video_sources 字段挑最高画质地址。
     *
     * 结构： { "1": "url_360p", "2": "url_720p", "3": "url_1080p" }
     * 也可能拍平成 "1=url1&2=url2" 字符串，两种都收。
     *
     * 来源：参考脚本 gf-394252 从 DOM 的 [video-sources] 属性取，
     * 这里从接口返回的 status 对象取，等价但不用碰 DOM。
     */
    function pickFromVideoSourcesAttr(status) {
        const vs = get(status, 'video_sources', null)
            || get(status, 'page_info.video_sources', null)
            || get(status, 'media_info.video_sources', null);
        if (!vs) return null;

        if (typeof vs === 'string') {
            // "1=url1&2=url2"
            const parts = vs.split('&').filter(x => /^\d+=.+/.test(x.trim()));
            if (!parts.length) return null;
            parts.sort((a, b) => parseInt(b.match(/^(\d+)=/)[1]) - parseInt(a.match(/^(\d+)=/)[1]));
            const u = decodeURIComponent(parts[0].replace(/^\d+=/, ''));
            return /^https?:/i.test(u) ? u : null;
        }

        if (typeof vs === 'object') {
            const keys = Object.keys(vs).filter(k => /^\d+$/.test(k));
            if (!keys.length) return null;
            keys.sort((a, b) => parseInt(b) - parseInt(a));
            const u = vs[keys[0]];
            const s = typeof u === 'string' ? u : (u && u.url) || '';
            return /^https?:/i.test(s) ? s : null;
        }
        return null;
    }

    /** 该 item 是否已交给 GM_download 直落（视频路径专用） */
    function handedToGM(item) {
        return !!(item && item.__handedToGM);
    }

    async function topMediaUrlAsync(status, pageInfo, mediaInfo, objectType) {
        // oid 取值兜底：page_info → media_info → 整条 status
        const oid = get(pageInfo, 'object_id', '')
            || get(mediaInfo, 'object_id', '')
            || get(pageInfo, 'page_id', '')
            || get(status, 'object_id', '');

        let url = null;
        if (cfg.isVideoHD && oid) {
            url = await fetchVideoHD(oid);
        }

        // tv 接口没成 → media_info 降级链（已查证 m.weibo.cn 的真实字段）
        if (!url) {
            url = pickBestVideo(mediaInfo) || pickVideoByUrlMap(mediaInfo);
        }
        // 再降级：page_url（秒拍/第三方视频）、老字段
        if (!url) {
            url = get(pageInfo, 'page_url', '')
                || get(mediaInfo, 'download_url', '')
                || get(mediaInfo, 'h5_url', '');
        }
        // v0.1.20 补 video_sources：参考脚本（gf-394252）除了 ajax 接口，
        // 还从 DOM 的 [video-sources] 属性直接取视频地址。
        // 该属性格式： "1=<url1>&2=<url2>&3=<url3>"，序号越大画质越高。
        // 有些视频（尤其新版的 dash 流）只有这个属性里有地址，
        // 走 ajax 接口反而拿不到 —— 这是「有下载失败的」的另一条来源。
        if (!url) {
            url = pickFromVideoSourcesAttr(status);
        }

        console.log(
            `${TAG} topMedia: ${objectType || 'video'} | oid=${oid || 'none'} | ` +
            `tv接口=${url ? (oid ? '命中' : '未调用') : '未命中'} → ${url ? 'ok' : 'null'}`
        );
        return url || null;
    }

    /**
     * media_info.urls 形态兜底：
     * 部分微博把清晰度放在 urls 对象里（键名形如 hd / sd / mp4_1080p_mp4），
     * 值可能是字符串也可能是对象（含 url 字段）。按键名里的画质标记排序取最优。
     */
    function pickVideoByUrlMap(mediaInfo) {
        const urls = get(mediaInfo, 'urls', null);
        if (!urls || typeof urls !== 'object') return null;
        const entries = Object.entries(urls);
        if (entries.length === 0) return null;

        // 画质打分：名字里的 hd/1080/720/4k 等标记
        const score = (k) => {
            const s = String(k).toLowerCase();
            let n = 0;
            if (/4k|2160|uhd/.test(s)) n += 1000;
            if (/1080/.test(s)) n += 900;
            if (/720/.test(s)) n += 700;
            if (/\bhd\b/.test(s)) n += 600;
            if (/480/.test(s)) n += 400;
            if (/\bsd\b/.test(s)) n += 200;
            // 键里带 WxH 的按面积
            const m = s.match(/(\d+)x(\d+)/);
            if (m) n += Number(m[1]) * Number(m[2]) / 1000;
            return n;
        };

        entries.sort((a, b) => score(b[0]) - score(a[0]));
        for (const [k, v] of entries) {
            const url = typeof v === 'string' ? v : get(v, 'url', '');
            if (url) {
                console.log(`${TAG} pickVideoByUrlMap: 键=${k} 得分=${score(k)}`);
                return url;
            }
        }
        return null;
    }

    /** 超高清图下载接口 —— 真高清通道，比换档强 */
    function hdImageUrl(pid) {
        return pid ? `https://weibo.com/ajax/common/download?pid=${pid}` : null;
    }

    /** 是否是 ajax 超清下载端点（决定要不要走降级兜底） */
    function isHdEndpoint(url) {
        return typeof url === 'string' && url.includes('/ajax/common/download?pid=');
    }

    /** 从图片 URL 里抠出 pid（ajax 下载接口的入参） */
    function pidFromUrl(url) {
        if (typeof url !== 'string') return null;
        const m = url.match(/\/([A-Za-z0-9]{6,})(?:\.\w+)?$/);
        return m ? m[1] : null;
    }

    // ══════════════════════════════════════════════════════════════
    // §4  资源解析（核心：把一条微博变成 urlData 映射）
    // ══════════════════════════════════════════════════════════════

    /**
     * urlData 结构（下载层唯一入口的 ctx）：
     *   { [文件名后缀]: url, ..., media?: url }
     * 约定：键以 '.' 开头（如 ".jpg"）= 媒体；键 = 'media' = 顶层视频。
     * ⚠ §10.14：新增下载入口时，每个入口的 ctx 必须独立核对字段名。
     *    当前只有 collectResources 一个出口，新增入口照着它抄。
     */
    async function collectResources(status) {
        const urlData = {};
        // v0.1.3：结构化资源清单。index 在收集阶段分配，
        // 避免在下载层再从 suffix 字符串里反解序号（那是最容易错的地方）。
        const mediaItems = [];   // 结构化资源清单（勿与 mixMedia.items 混淆）
        let seq = 0;
        const nextIndex = () => pad(++seq, 2);
        const vipOnly = Number(status.mblog_vip_type) === 1;

        // ── 转发微博：媒体在 retweeted_status 里 ──
        const rt = get(status, 'retweeted_status', null);
        const picInfos = get(status, 'pic_infos', null) || get(rt, 'pic_infos', null);
        const mixMedia = get(status, 'mix_media_info', null) || get(rt, 'mix_media_info', null);

        // ── 1. pic_infos：九宫格 / 单图 / livephoto ──
        if (picInfos && typeof picInfos === 'object') {
            const pids = Object.keys(picInfos);
            pids.forEach((pid, index) => {
                const info = picInfos[pid] || {};
                const mw2000 = get(info, 'mw2000.url', '') || get(info, 'large.url', '');
                if (!mw2000) return;

                const ext = extOf(mw2000, 'jpg');
                const itemIndex = nextIndex();
                const suffix = `.${ext}`;

                // gif 不走 ajax 接口（会失败），粉丝专属降级 mw2000
                // ⚠ v0.1.1 修复：降级路径不能过 toLargeUrl。
                // mw2000 本身就是高清档，过 toLargeUrl 会被降成 large（清晰度反而变小）。
                // toLargeUrl 只用于"页面上的缩略图"换档，不用于已是高清的 mw2000。
                let url;
                if (vipOnly || !cfg.isImageHD || ext === 'gif') {
                    url = mw2000;
                } else {
                    url = hdImageUrl(pid);
                    fallbackUrls.set(url, mw2000);   // 超清失败时降级
                }
                urlData[suffix] = url;
                mediaItems.push({ url, index: itemIndex, ext, isLive: false });

                // livephoto：静态图 + 短视频成对（同序号，-live 区分）
                if (info.type === 'livephoto') {
                    const video = get(info, 'video', '') || get(info, 'video.url', '');
                    if (video) {
                        const vExt = extOf(video, 'mp4');
                        urlData[`${suffix}-live.${vExt}`] = video;
                        mediaItems.push({ url: video, index: itemIndex, ext: vExt, isLive: true });
                    }
                }
            });
        }

        // ── 2. mix_media_info：图 / 视频混排 ──
        if (mixMedia && Array.isArray(mixMedia.items)) {
            const items = mixMedia.items;
            for (let i = 0; i < items.length; i++) {
                const el = items[i] || {};
                const data = el.data || {};
                const suffix = '.bin';
                const itemIndex = nextIndex();

                if (el.type === 'video') {
                    const oid = get(data, 'object_id', '');
                    const hd = cfg.isVideoHD && oid ? await fetchVideoHD(oid) : null;
                    const fallback = get(data, 'media_info.stream_url_hd',
                        get(data, 'media_info.stream_url', '')) ||
                        pickBestVideo(get(data, 'media_info', null));
                    const mediaUrl = hd || fallback;
                    if (mediaUrl) {
                        const vExt = extOf(mediaUrl, 'mp4');
                        urlData[`${suffix}${itemIndex}.${vExt}`] = mediaUrl;
                        mediaItems.push({ url: mediaUrl, index: itemIndex, ext: vExt, isLive: false });
                    }
                } else {
                    const imgUrl = get(data, 'mw2000.url', '');
                    if (imgUrl) {
                        const ext = extOf(imgUrl, 'jpg');
                        const sfx = `${suffix.replace('.bin', '')}${itemIndex}.${ext}`;
                        let real = imgUrl;
                        if (cfg.isImageHD && !vipOnly && ext !== 'gif') {
                            const pid = get(data, 'pid', '') || pidFromUrl(imgUrl);
                            if (pid) {
                                real = hdImageUrl(pid);
                                fallbackUrls.set(real, imgUrl);
                            }
                        }
                        urlData[sfx] = real;
                        mediaItems.push({ url: real, index: itemIndex, ext, isLive: false });
                    }
                    if (get(data, 'type', '') === 'livephoto') {
                        const live = get(data, 'video', '');
                        if (live) {
                            const lExt = extOf(live, 'mp4');
                            urlData[`${suffix.replace('.bin', '')}${itemIndex}-live.${lExt}`] = live;
                            mediaItems.push({ url: live, index: itemIndex, ext: lExt, isLive: true });
                        }
                    }
                }
            }
        }

        // ── 3. page_info：顶层视频（含直播） ──
        const top = await topMediaUrl(status);   // v0.1.14：内部调 tv 接口，已变 async
        if (top) {
            const tExt = extOf(top, 'mp4');
            urlData.media = top;
            // v0.1.14：登记降级地址 —— tv 接口给的 url 可能 403/过期，
            // 失败时要能退回 media_info 里的普通档位，而不是整个下载失败。
            const fallbackVideo = get(status, 'page_info.media_info.stream_url_hd', '')
                || get(status, 'page_info.media_info.stream_url', '')
                || get(status, 'retweeted_status.page_info.media_info.stream_url_hd', '')
                || get(status, 'retweeted_status.page_info.media_info.stream_url', '');
            if (fallbackVideo && fallbackVideo !== top) {
                fallbackUrls.set(top, fallbackVideo);
            }
            mediaItems.push({ url: top, index: nextIndex(), ext: tExt, isLive: false, isTop: true });
        }

        console.log(`${TAG} collectResources: ${mediaItems.length} 项 →`,
            mediaItems.map((m) => `${m.index}${m.isLive ? '-live' : ''}.${m.ext}`).join(', '));
        return mediaItems;
    }

    /** 命名：按用户拖拽的字段顺序拼接 */
    /**
     * 渲染文件名（v0.1.3 模板驱动）
     *
     * @param info  extractInfo 的结果
     * @param index 序号，两位补零；单图也传 01
     * @param ext   扩展名（不含点）
     *
     * 未取到的占位符按 §6 约定降级成 x（显式降级，不静默留空 ——
     * 静默留空会让 "微博##01.jpg" 这种残缺文件名混进图库）。
     */
    function renderName(info, index, ext) {
        const ctx = {
            username: info.userName,
            uid: info.userID,
            mblogid: info.mblogid,
            time: info.time,
            index: index,
            ext: ext,
        };
        let name = String(nameTemplate).replace(/\{(\w+)\}/g, (m, key) => {
            const v = ctx[key];
            return v === undefined || v === null || v === '' ? 'x' : String(v);
        });
        name = cleanName(name);
        if (!name || name === 'x') name = `微博-${info.mblogid || 'unknown'}`;
        // 扩展名兜底：模板没写 {ext} 就补上
        if (ext && !/\.[A-Za-z0-9]{2,4}$/.test(name)) name += `.${ext}`;
        return name.slice(0, 180);
    }

    function extractInfo(status) {
        const created = get(status, 'retweeted_status.created_at', status.created_at)
            ? new Date(get(status, 'retweeted_status.created_at', status.created_at))
            : new Date();
        const isValid = !isNaN(created.getTime());
        const d = isValid ? created : new Date();
        const region = (status.region_name || '').replace(/^\s*来自/, '').trim();

        // ⚠ v0.1.3 修复：转发微博的媒体在 retweeted_status 里，属原博主。
        // 取 status.user 会拿到「转发者」的昵称+uid，命名张冠李戴。
        // 规则：媒体归属谁，名字就归谁 —— 有原博就取原博。
        const owner = get(status, 'retweeted_status', null) || status;

        return {
            userName: get(owner, 'user.screen_name', ''),
            userID: get(owner, 'user.idstr', ''),
            mblogid: status.mblogid || status.id || '',
            time: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`,
            geoName: get(status, 'geo.detail.title', ''),
            region: region,
            text: (status.text_raw || '').slice(0, 20),
            fullText: status.text_raw || '',
            isLongText: !!status.isLongText,
        };
    }

    // ══════════════════════════════════════════════════════════════
    // §5  下载层
    // ══════════════════════════════════════════════════════════════

    /** 并发队列：限制同时在跑的请求数（参考 TaskQueue，改写为更易读的实现） */
    /**
     * 并发队列。
     *
     * v0.1.27 修复（用户实测日志定位）：
     *   症状顺序是「fetchBlob 请求 → 队列完成 → fetchBlob 返回」，
     *   队列在 blob 还在下载时就宣布全部完成，files 收不到任何东西，
     *   于是「收集=0/1」→ 落盘 0 个 → 按钮显示「重试」。
     *
     * 旧实现的两个错：
     *   ① add() 里 `if (!settle) settle = (res) => res;` 放了个**假 resolve**。
     *      start() 里 `new Promise(resolve => { settle = resolve; })` 建的**真 resolve**
     *      会覆盖它 —— 但覆盖发生在 Promise 构造**之后**，而 add() 早已调过 next()。
     *      单任务场景下，next() 命中 `active===0 && tasks.length===0`
     *      （此刻任务还没被 active++ 计入，microtask 尚未跑），
     *      用假 settle 提前 resolve，真 Promise 永远等不到。
     *   ② 就算没有①，`next()` 的启动判定也没区分「还没 start」和「已全部完成」。
     *
     * 修法：settle 只在 start() 里建；add() 只入队不启动；
     *      启动统一交给 start()，且 next() 里用 started 标记把关。
     */
    function createQueue(concurrency) {
        const tasks = [];
        let active = 0;
        let settle = null;
        let started = false;
        const results = [];

        const next = () => {
            if (active >= concurrency || tasks.length === 0) {
                if (started && active === 0 && tasks.length === 0 && settle) {
                    const s = settle;
                    settle = null;
                    s(results);
                }
                return;
            }
            const { fn, index } = tasks.shift();
            active++;
            Promise.resolve()
                .then(fn)
                .then(
                    (r) => { results[index] = r; },
                    (e) => { results[index] = { __error: true, message: e && e.message }; }
                )
                .finally(() => {
                    active--;
                    next();
                });
        };

        return {
            add(fn) {
                // ⚠ 只入队，不启动。启动统一由 start() 负责 ——
                // 旧版在这里就 next()，导致真 settle 还没建立就可能提前 resolve。
                tasks.push({ fn, index: results.length });
                results.length += 1;
                if (started) next();   // 已 start 过又追加任务才续跑
            },
            start() {
                // ⚠ 必须先建 settle 再 next()，否则「第一个任务同步跑完」
                //   会撞上 settle 还是 null 的空档。
                const p = new Promise((resolve) => { settle = resolve; });
                if (tasks.length === 0) { settle(null); settle = null; return Promise.resolve([]); }
                started = true;
                next();
                return p;
            },
        };
    }

    /** 拉单个资源为 Blob */
    /**
     * 拉媒体为 Blob。
     *
     * v0.1.17：按域名前缀切换 Referer。
     *
     * 真因（用户实测日志「topMedia → ok」但下载失败）：
     * 微博不同 CDN 的防盗链规则不一样 ——
     *   weibocdn.com / miaopai.com / tbcache.com 等视频域要求 Referer
     *   与视频真实所在页面一致，只带 https://weibo.com/ 会被判 403。
     *   而图片域（sinaimg.cn）反而对 Referer 更宽松。
     *
     * 策略：从 URL 里解出视频真实页面路径，构出对应 Referer；
     *       解不出就退回站点根 Referer（跟旧行为一致，不倒退）。
     */
    /**
     * v0.1.20：Referer 固定站点根，uid 那套删掉。
     *
     * 为什么删：姐姐 v0.1.17 加 uid 是推断「视频 CDN 有防盗链」。
     * 查参考脚本（wah0713 / gf-394252）的 ajaxDownload 后确认 ——
     * 它从头到尾只用 `referer: 'https://weibo.com/'`，从来没设过 uid，
     * 而它是微博圈下载脚本里最稳的一个之一。
     * 说明 403 不是主要病因，多加一个「必须先设置」的步骤反而添堵。
     */
    function refererFor() {
        return 'https://weibo.com/';
    }

    let _lastReferer = '';
    /**
     * 拉媒体为 Blob —— 带破缓存重试。
     *
     * v0.1.20：抄参考脚本（gf-394252 ajaxDownload）的两个关键手段：
     *
     * ① download_timestamp 破缓存
     *    微博 CDN 对同一 URL 会返回 **200 但 body 为 0 字节**（命中负缓存）。
     *    参考脚本的解法：URL 拼一个 `download_timestamp=<当前毫秒>`，
     *    强制 CDN 回源。姐姐原来只判「空了就记失败」，等于直接放弃了这条路。
     *
     * ② 失败重试 4 次，每次间隔 500ms
     *    参考脚本 tryTimes 到 3 才放弃。CDN 抖动是常态，一次失败不代表真失败。
     *    姐姐原来只拉一次就判死，这是「有下载失败的」的直接原因。
     *
     * 两次都失败才报空，并且日志里写清楚第几次、状态码、体积。
     */
    let _bustSeq = 0;

    async function fetchBlob(url, opts) {
        const options = opts || {};
        const MAX = 4;
        let lastStatus = 0;
        let lastSize = 0;

        for (let attempt = 1; attempt <= MAX; attempt++) {
            // ① 破缓存：先剥掉旧的 timestamp，再拼一个新的
            const clean = String(url).replace(/[?&]?download_timestamp=\d+/g, '');
            const sep = clean.indexOf('?') === -1 ? '?' : '&';
            // 单调递增保证同一毫秒内的多次重试也拿到不同参数 ——
            // 破缓存靠的就是 URL 不同，时间戳撞车等于没破。
            //
            // ⚠ 别写成 Math.max(Date.now(), ++seq)：seq 是 1,2,3 这种小整数，
            //   永远小于毫秒时间戳，max 恒等于 now，同毫秒重试就撞车了。
            //   正确做法：以时间戳为基准，重复时在末尾递增。
            const now = Date.now();
            _bustSeq = now > _bustSeq ? now : _bustSeq + 1;
            const bustUrl = `${clean}${sep}download_timestamp=${_bustSeq}`;

            let res;
            try {
                if (opts && opts.verbose) {
                    console.log(`${TAG} fetchBlob 第${attempt}次请求 ${(bustUrl.length)} 字节 URL`);
                }
                // v0.1.24 绝对超时：GM_xmlhttpRequest 的 timeout 对 blob 响应
                // 大文件可能不触发（浏览器在等 body，扩展认为还没超时），
                // 结果 Promise 永远悬着 —— 表现就是「日志到 collectResources 就断了，
                // 后面一行都没有」。用 Promise.race 兜一层，不依赖浏览器计时。
                res = await Promise.race([
                    gmRequest({
                    method: 'get',
                    url: bustUrl,
                    responseType: 'blob',
                    headers: {
                        referer: 'https://weibo.com/',
                        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'accept': '*/*',
                        'accept-language': 'zh-CN,zh;q=0.9',
                    },
                    timeout: options.timeout || 60000,
                    }),
                    new Promise((_, rej) => setTimeout(
                        () => rej(new Error('HARD_TIMEOUT')),
                        (options.timeout || 60000) + 5000
                    )),
                ]);
            } catch (e) {
                const isTimeout = e && e.message === 'HARD_TIMEOUT';
                lastStatus = isTimeout ? 'HARD_TIMEOUT' : 'ERR:' + (e && e.message ? e.message : 'unknown');
                if (opts && opts.verbose) {
                    console.warn(`${TAG} fetchBlob 第${attempt}次失败 ${lastStatus}`);
                }
                if (attempt < MAX) { await sleep(500); continue; }
                return { status: lastStatus, response: null };
            }

            lastStatus = res.status;
            const size = res.response && res.response.size || 0;
            lastSize = size;

            if (opts && opts.verbose) {
                console.log(
                    `${TAG} fetchBlob 第${attempt}次返回 status=${lastStatus} size=${size} ` +
                    `type=${res.response && res.response.type || 'n/a'} 空=${isEmptyResult(res)}`
                );
            }

            if (!isEmptyResult(res)) return res;

            if (attempt < MAX) {
                console.log(`${TAG} 空响应 重试 ${attempt}/${MAX} status=${lastStatus} size=${size}`);
                await sleep(500);
            }
        }

        console.warn(`${TAG} 拉取失败 ${MAX} 次 | status=${lastStatus} size=${lastSize} url=${String(url).slice(0, 90)}`);
        return { status: lastStatus, response: { size: lastSize } };
    }

    /** 空文件 / 错误页判定（微博返 404 时给的是 HTML，不是媒体） */
    function isEmptyResult(res) {
        if (!res) return true;
        const blob = res.response;
        if (!blob || typeof blob.size !== 'number') return true;
        if (blob.size <= 512) return true;
        const type = blob.type || '';
        if (type.includes('text/html') || type.includes('application/json')) return true;
        return false;
    }

    /** m3u8 解析（自实现，不依赖 CDN） */
    function parseM3u8(text, baseUrl) {
        const lines = String(text).split(/\r?\n/);
        const segs = [];
        for (const raw of lines) {
            const line = raw.trim();
            if (!line || line.startsWith('#')) continue;
            if (!/\.(ts|m4s|mp4|aac)(\?|$)/i.test(line)) continue;
            try {
                segs.push(new URL(line, baseUrl).href);
            } catch (e) {
                segs.push(line);
            }
        }
        return segs;
    }

    // ══════════════════════════════════════════════════════════════
    // §6  ZIP 打包（store 模式，零依赖）
    // ══════════════════════════════════════════════════════════════

    const CRC_TABLE = (() => {
        const t = new Uint32Array(256);
        for (let i = 0; i < 256; i++) {
            let c = i;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            t[i] = c >>> 0;
        }
        return t;
    })();

    function crc32(bytes) {
        let c = 0xffffffff;
        for (let i = 0; i < bytes.length; i++) {
            c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
        }
        return (c ^ 0xffffffff) >>> 0;
    }

    function dosDateTime(d) {
        const time = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() / 2) & 31);
        const date = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
        return { time, date };
    }

    /**
     * 打包成 zip（store，不压缩）。
     * 媒体文件本身已压缩（jpg/mp4），store 模式体积几乎无损，速度快一个数量级。
     */
    function buildZip(files) {
        const encoder = new TextEncoder();
        const chunks = [];
        const central = [];
        let offset = 0;

        files.forEach((f) => {
            const nameBytes = encoder.encode(f.name);
            const data = f.data instanceof Uint8Array
                ? f.data
                : new Uint8Array(f.data);
            const crc = crc32(data);
            const { time, date } = dosDateTime(f.date || new Date());

            const local = new Uint8Array(30 + nameBytes.length);
            const lv = new DataView(local.buffer);
            lv.setUint32(0, 0x04034b50, true);
            lv.setUint16(4, 20, true);
            lv.setUint16(6, 0x0800, true);   // UTF-8 文件名
            lv.setUint16(8, 0, true);        // store
            lv.setUint16(10, time, true);
            lv.setUint16(12, date, true);
            lv.setUint32(14, crc, true);
            lv.setUint32(18, data.length, true);
            lv.setUint32(22, data.length, true);
            lv.setUint16(26, nameBytes.length, true);
            lv.setUint16(28, 0, true);
            local.set(nameBytes, 30);

            chunks.push(local, data);

            const cd = new Uint8Array(46 + nameBytes.length);
            const cv = new DataView(cd.buffer);
            cv.setUint32(0, 0x02014b50, true);
            cv.setUint16(4, 20, true);
            cv.setUint16(6, 20, true);
            cv.setUint16(8, 0x0800, true);
            cv.setUint16(10, 0, true);
            cv.setUint16(12, time, true);
            cv.setUint16(14, date, true);
            cv.setUint32(16, crc, true);
            cv.setUint32(20, data.length, true);
            cv.setUint32(24, data.length, true);
            cv.setUint16(28, nameBytes.length, true);
            cv.setUint32(42, offset, true);
            cd.set(nameBytes, 46);
            central.push(cd);

            offset += local.length + data.length;
        });

        const centralSize = central.reduce((s, c) => s + c.length, 0);
        const end = new Uint8Array(22);
        const ev = new DataView(end.buffer);
        ev.setUint32(0, 0x06054b50, true);
        ev.setUint16(8, files.length, true);
        ev.setUint16(10, files.length, true);
        ev.setUint32(12, centralSize, true);
        ev.setUint32(16, offset, true);

        return new Blob([...chunks, ...central, end], { type: 'application/zip' });
    }

    // ══════════════════════════════════════════════════════════════
    // §7  卡片识别（不赌 CSS Module 哈希）
    // ══════════════════════════════════════════════════════════════

    /**
     * 卡片识别 —— v0.1.6 改多策略
     *
     * v0.1.5 只认 href 正则 /\d{6,}\/\w+/ 一种入口。
     * 话题聚合页（/hot/weibo/xxx）实测 0 命中：面板在、按钮 0、连老时间戳入口也是 0
     * → 不是新功能的 CSS 问题，是整条识别链路在该页面上失守。
     *
     * v0.1.6 三路并用，谁先命中用谁：
     *   A. href 正则（个人主页 / 信息流 —— 已验证有效）
     *   B. data-oid / data-mid 属性（微博部分版块用这俩标记卡片）
     *   C. 从媒体元素反查（有 sinaimg 图或 video，就从它上溯找卡片根）
     *
     * 埋诊断：每路命中数 + 图片数 + 视频数全部打 console，
     * 用户下一次反馈就能直接看出卡在哪一环，不用再跑诊断代码。
     */
    const MBLINK_RE = /\/(\d{6,})\/([A-Za-z0-9]+)/;
    const DIAG = { href: 0, attr: 0, media: 0, imgs: 0, videos: 0, cards: 0 };

    function findMblogLink(root) {
        const anchors = root.querySelectorAll('a[href*="/"]');
        for (const a of anchors) {
            const href = a.getAttribute('href') || '';
            if (!MBLINK_RE.test(href)) continue;
            // 排除"用户主页"链接（只有 uid，没有 /uid/mblogid 两段）
            if (href.replace(/\?.*$/, '').split('/').filter(Boolean).length < 2) continue;
            return a;
        }
        return null;
    }

    /**
     * 从卡片里挖 mblog id —— 多来源（对应 §10.14：每个入口独立核对，别只认一个）
     * 顺序：data-oid → href 正则 → data-mid
     */
    function extractId(card) {
        // A. data 属性
        const oid = card.getAttribute && (card.getAttribute('data-oid') || card.getAttribute('data-blogid'));
        if (oid && /^[A-Za-z0-9]{6,}$/.test(oid)) return oid;
        // B. href 正则
        const link = findMblogLink(card);
        if (link) {
            const id = idFromHref(link.getAttribute('href'));
            if (id) return id;
        }
        // C. data-mid
        const mid = card.getAttribute && card.getAttribute('data-mid');
        if (mid && /^[A-Za-z0-9]{6,}$/.test(mid)) return mid;
        // D. 整卡文本里的 href 兜底（有些页面链接包在多层里）
        try {
            const m = (card.innerHTML || '').match(/\/\d{6,}\/([A-Za-z0-9]{6,})/);
            if (m) return m[1];
        } catch (e) { /* innerHTML 可能抛（超大节点），忽略 */ }
        return null;
    }

    /** 卡片内任意可点击的 mblog 链接（找不到专属链接时返回 null，调用方兜底） */
    /**
     * 从任意元素上溯到最近的微博卡片根节点。
     * v0.1.6：不再依赖「上溯路径上必须先遇到 findMblogLink」——
     * 话题页可能整张卡都没标准链接，所以增加两条终止条件：
     *   - 遇到含媒体的 DIV（图片/视频）就停
     *   - 深度上限从 12 放宽到 16（话题页嵌套更深）
     */
    function closestCard(el, opts) {
        const o = opts || {};
        let node = el;
        let depth = 0;
        while (node && node.nodeType === 1 && depth < 16) {
            const tag = node.tagName;
            if (tag === 'SECTION' || tag === 'ARTICLE' || node.getAttribute('data-v2type')) {
                return node;
            }
            if (tag === 'DIV' || tag === 'LI') {
                if (findMblogLink(node)) return node;
                // 话题页兜底：含媒体就当卡片
                if (o.allowMedia && cardHasMedia(node)) {
                    // ⚠ v0.1.6 修复：必须有最小尺寸门槛。
                    // 无门槛时，头像 / 表情 / 认证徽章这些 sinaimg 小图也会
                    // 让上溯停在小容器上 → 下载按钮被塞到头像旁边。
                    const rect = node.getBoundingClientRect();
                    const bigEnough = rect.width >= 200 && rect.height >= 80;
                    if (!bigEnough) {
                        node = node.parentElement;
                        depth++;
                        continue;
                    }
                    // 尺寸够了，再看有没有更高层的卡片标记
                    if (node.getAttribute('data-oid') || node.getAttribute('data-mid')) return node;
                    if (node.querySelector('a[href*="/"]')) return node;
                }
            }
            node = node.parentElement;
            depth++;
        }
        return null;
    }

    /**
     * 遍历页面上所有微博卡片（去重）
     * v0.1.6：三路并用，命中数打进 console 供诊断
     */
    function collectCards() {
        const cards = new Set();
        DIAG.href = 0; DIAG.attr = 0; DIAG.media = 0;
        DIAG.tooSmall = 0;
        DIAG.nested = 0;
        DIAG.oversized = 0;

        // ── 路 A：href 正则 ──
        const links = document.querySelectorAll('a[href*="/"]');
        for (const a of links) {
            const href = a.getAttribute('href') || '';
            if (!MBLINK_RE.test(href)) continue;
            DIAG.href++;
            const card = closestCard(a);
            if (card) cards.add(card);
        }

        // ── 路 B：data-oid / data-mid 属性标记 ──
        // v0.1.21 实测：微博新版 DOM 上这条路径命中数恒为 0（属性路=0），
        // 卡片节点不带这几个属性。逻辑留着无害（老版页面/超话页可能用），
        // 但识别主力其实是 href 路 + 媒体反查。
        document.querySelectorAll('[data-oid], [data-mid], [data-blogid]').forEach((el) => {
            DIAG.attr++;
            cards.add(el);
        });

        // ── 路 C：从媒体元素反查（话题页主力路径）──
        // v0.1.21：这条路是当前主力（实测 媒体路=46 vs href路=6），
        // 但它也是「候选 24 张只挂 1 个」的来源 ——
        // 单张图片的父容器也会被当成卡片候选，体积小、认不出 id，被静默跳过。
        const medias = document.querySelectorAll('img[src*="sinaimg"], img[src*="sina.cn"], video');
        for (const m of medias) {
            if (m.tagName === 'IMG' && isAvatarImage(m.src)) continue;
            DIAG.media++;
            const card = closestCard(m, { allowMedia: true });
            if (card) cards.add(card);
        }

        // v0.1.13：合并过小的候选卡
        //
        // WHY：微博把一张卡拆成多个 section（头像段 / 正文段 / 图片段）时，
        // 每个 section 都可能被误当成一张「卡」，于是同一条微博被算成多张，
        // 而真正承载整条内容的容器反而因为没被识别而漏掉。
        // 修法：尺寸不达标的候选卡往上并到父容器，直到达到门槛或到顶。
        const merged = [];
        const consumed = new Set();
        for (const c of Array.from(cards)) {
            if (consumed.has(c)) continue;
            let node = c;
            let guard = 0;
            // 太小的往上并
            while (node && guard < 8) {
                const rc = node.getBoundingClientRect();
                if (rc.width >= 240 && rc.height >= 120) break;
                DIAG.tooSmall++;
                const parent = node.parentElement;
                if (!parent) break;
                consumed.add(node);
                node = parent;
                guard++;
            }
            merged.push(node);
        }
        // v0.1.16：去嵌套
        //
        // WHY：微博一条动态在 DOM 里常有两层「像卡片」的节点 —— 外层容器
        // （含头像+正文+九宫格+互动栏）和内层 section（只含正文+图）。
        // 两层尺寸都过 240×120 门槛，于是 merged 里同时留着它们，
        // injectCardButtons 各注入一个按钮 → 用户看到「同��张卡两个下载按钮」。
        //
        // 修法：若 A 包含 B，则只保留 A（外层）。
        // 判据用 node.contains()，不看 className / 结构名。
        //
        // ⚠ v0.1.18 修正 v0.1.16 的方向性错误。
        //
        // v0.1.16 写的是「双向」：内层被包含则跳过，外层进来则删掉已收录的内层。
        // 单看两处都对，但顺序一变就塌：merged 里若先出现包住整个 feed 的
        // 巨型容器，它会把后面每张真卡都当成「内层」删掉 —— 最后只剩一个，
        // 于是「卡片按钮全部消失」。微博信息流的 DOM 恰好就是这种结构。
        //
        // 正确方向：只往上吞，永不往下删。
        //   · 内层被已收录的外层包含 → 跳过（这是要去掉的重复）
        //   · 自己包含已收录的 → 说明自己是更大的外层，跳过自己，
        //     但**不动已收录的**（它们可能是正常的独立卡片）
        // 这样无论顺序如何，已收录的都是「最小可用卡片」，结果稳定。
        //
        // ⚠ v0.1.18 三修：前两版都被「顺序依赖」打败。
        //   v0.1.16 双向删 → 巨型容器在前时把真卡全删光
        //   v0.1.18一 「只往上吞」→ 仍是单趟遍历，同一批次里
        //     先到的 feed 容器会把后到的真卡全判成 inside 而跳过
        //
        // 正确做法：两趟，顺序无关。
        //   第一趟：先把「宽度超过视口 90%」的巨型容器剔掉 —— 它们不是卡片。
        //           这一步是治本：容器没了，后面的包含关系就不会误伤真卡。
        //   第二趟：只判断「是否被别的候选包含」，永远不主动删除。
        //           若 A contains B 且两者都在，保留 A（外层），丢 B；
        //           反过来 B 先到就先收 B，收 A 时见 A 包着 B 就不再收 A ——
        //           结果是「先到者胜」，而第一趟已保证先到者不可能是巨型容器。
        const vw = (typeof window !== 'undefined' && window.innerWidth) || 0;

        let pool = merged.filter(Boolean);
        if (vw) {
            const before = pool.length;
            pool = pool.filter((c) => {
                if (!c.nodeType) return false;
                const w = c.getBoundingClientRect().width;
                if (w > vw * 0.9) { DIAG.oversized++; return false; }
                return true;
            });
            DIAG.oversized = before - pool.length;
        }

        const deduped = [];
        for (const c of pool) {
            if (!c.nodeType) continue;
            // 两种「重复」都要拦：
            //   ① c 被已收录的包着 → c 是内层，跳过（重复）
            //   ② c 包着已收录的     → c 是外层，也跳过（同样重复，
            //      因为已收录的那张已经能覆盖这一条微博）
            // 两者都只跳过当前候选，不删除已收录的 —— 保证「先到者胜」，
            // 而第一趟已确保先到者不可能是巨型容器。
            const contained = deduped.some((o) => o !== c && o.contains(c));
            const wraps = deduped.some((o) => o !== c && c.contains(o));
            if (contained || wraps) { DIAG.nested++; continue; }
            deduped.push(c);
        }

        const finalCards = deduped;

        DIAG.cards = finalCards.length;
        DIAG.imgs = document.querySelectorAll('img[src*="sinaimg"]').length;
        DIAG.videos = document.querySelectorAll('video').length;
        // v0.1.21：日志加「唯一卡数」和去重前后的对照。
        //
        // 用户实测日志：卡片=24 但只挂 1 个按钮。三路命中（6+0+46）远多于 24，
        // 说明媒体反查把大量「单张图片的父容器」也当成了卡片候选。
        // 它们体积小 / 认不出 id，于是被 enhanceCards 静默跳过 ——
        // 而跳过原因此前只在手动菜单里打印，自动扫描时看不到，
        // 于是「24 张卡只挂 1 个」这件事完全无法归因。
        //
        // 现在打三组数：候选数（去重后）/ 三路各自命中 / 去重前总数。
        // 下一轮日志里 若 候选 远大于 增强+跳过 之和，说明去重还在漏。
        console.log(
            `${TAG} collectCards: 候选=${finalCards.length} | ` +
            `href路=${DIAG.href} 属性路=${DIAG.attr} 媒体路=${DIAG.media} | ` +
            `图片=${DIAG.imgs} 视频=${DIAG.videos} | ` +
            `合并小卡=${DIAG.tooSmall} 去嵌套=${DIAG.nested} 超大容器=${DIAG.oversized} | ${location.pathname.slice(0, 24)}`
        );
        return finalCards;
    }

    /** 卡片是否含媒体 —— DOM 侧快判（图片/视频元素存在即真） */
    // v0.1.13：加结果缓存 —— getComputedStyle 每次都要重算样式，
    // 在 collectCards→enhanceCards→injectCardButtons 三轮里对同一张卡重复调用
    // 会明显拖慢 flush（MutationObserver 高频触发时尤其明显）。
    const _mediaCache = new WeakMap();

    function cardHasMedia(card) {
        if (_mediaCache.has(card)) return _mediaCache.get(card);
        const r = computeCardHasMedia(card);
        _mediaCache.set(card, r);
        return r;
    }

    function computeCardHasMedia(card) {
        if (card.querySelector('video')) return true;
        const imgs = Array.from(card.querySelectorAll('img'));
        if (imgs.some((im) => !isAvatarImage(im.src))) return true;
        // v0.1.13：微博新版部分图片用 background-image 或 CSS 变量，不一定有 <img>。
        // 只看 <img> 会把这类卡片误判为「纯文字」而静默跳过。
        const bg = getComputedStyle(card).backgroundImage || '';
        if (bg && bg !== 'none' && /url\(/.test(bg)) return true;
        if (card.querySelector('[style*="background-image"]')) return true;
        // 有微博图床的任意元素（九宫格容器/图片链接）
        const bgLinks = card.querySelectorAll('a[href*="/photo"], a[href*="sinaimg"], [data-v2type="image"]');
        if (bgLinks.length) return true;
        return false;
    }

    /** 给卡片打标记：是否含媒体（异步查接口拿真值，避免误判） */
    async function probeCardMedia(card) {
        try {
            const link = findMblogLink(card);
            if (!link) return false;
            const id = idFromHref(link.getAttribute('href'));
            if (!id) return false;
            const status = await fetchStatus(id);
            const hasMedia = !!(
                get(status, 'pic_infos', null) ||
                get(status, 'mix_media_info', null) ||
                get(status, 'page_info', null) ||
                get(status, 'retweeted_status.pic_infos', null) ||
                get(status, 'retweeted_status.page_info', null)
            );
            card.dataset.wbHasMedia = hasMedia ? '1' : '0';
            card.dataset.wbId = id;
            return hasMedia;
        } catch (e) {
            console.warn(`${TAG} probeCardMedia ⚠️`, e.message);
            return false;
        }
    }

    // ══════════════════════════════════════════════════════════════
    // §8  下载主流程
    // ══════════════════════════════════════════════════════════════

    const tasks = new Map(); // id -> { status, message, percent, title, id }

    /**
     * v0.1.33：内存层淘汰 —— tasks 是 Map，只增不减。
     * WHY 必须裁：微博往下滚一天能加几百条，
     *   而显示层只画 6 条、持久层只存 6 条，
     *   中间这份「全量」Map 会一直涨：内存涨、每次 renderPanel 的遍历也变慢。
     *
     * 裁剪规则：
     *   · **进行中的任务永不淘汰**（正在下/保存中的必须留着）
     *   · 只淘汰已完成的，且只保留最新 HISTORY_MAX 条
     *   · 新任务加进来时才裁，不是每次 setTask 都裁（省掉无谓遍历）
     */
    function trimTasks() {
        if (tasks.size <= HISTORY_MAX) return;
        const all = Array.from(tasks.values());
        // 进行中的（message 不是 done）必须保留
        const busy = all.filter((t) => t.message !== MSG.done);
        const finished = all.filter((t) => t.message === MSG.done);
        // 已完成的只留最新的 HISTORY_MAX 条；进行中的再多也留着
        const keepFinished = finished.slice(-HISTORY_MAX);
        const keep = new Set(keepFinished.map((t) => t.id));
        // 超出上限的进行中任务也只在极端情况保留（busy 优先）
        const keepBusy = busy.slice(-HISTORY_MAX);
        keepBusy.forEach((t) => keep.add(t.id));
        if (keep.size >= tasks.size) return;
        for (const t of all) {
            if (!keep.has(t.id)) tasks.delete(t.id);
        }
        console.log(`${TAG} 历史裁剪 ${tasks.size} → ${keep.size} 条（上限 ${HISTORY_MAX}）`);
    }

    function setTask(id, patch) {
        const cur = tasks.get(id) || { id, title: id, message: MSG.init, percent: 0 };
        Object.assign(cur, patch);
        tasks.set(id, cur);
        trimTasks();
        renderPanel();
        return cur;
    }

    function getTask(id) {
        if (!tasks.has(id)) {
            tasks.set(id, { id, title: id, message: MSG.init, percent: 0 });
        }
        return tasks.get(id);
    }

    /** 下载一条微博的全部资源 */
    async function downloadWeibo(id, silent) {
        if (!silent) setTask(id, { message: MSG.ready, percent: 0 });

        let status;
        try {
            status = await fetchStatus(id);
        } catch (e) {
            console.error(`${TAG} downloadWeibo ❌ 接口失败 id=${id}`, e.message);
            setTask(id, { message: MSG.failed });
            return false;
        }

        const info = extractInfo(status);
        // v0.1.8：面板标题统一走模板（此前用旧 buildFilename，与真实文件名不一致）
        const title = renderName(info, '00', 'jpg').replace(/\.jpg$/, '');
        setTask(id, { title, message: MSG.ready });

        const mediaItems = await collectResources(status);
        if (mediaItems.length === 0) {
            console.log(`${TAG} downloadWeibo ❌ 无资源 id=${id}`);
            setTask(id, { message: MSG.empty });
            return false;
        }

        // 正文（可选）
        const files = [];
        if (cfg.isIncludesText) {
            const text = info.isLongText ? (await fetchLongText(id)) || info.fullText : info.fullText;
            if (text) {
                files.push({ name: renderName(info, 'txt', 'txt'), data: new TextEncoder().encode(text) });
            }
        }

        const done = { q: 0, total: mediaItems.length };

        const queue = createQueue(cfg.isImageHD ? 3 : 5);
        mediaItems.forEach((item) => {
            let url = item.url;
            queue.add(async () => {
                try {
                    // 直播 m3u8：先探是不是 m3u8
                    if (/\.m3u8(\?|$)/i.test(url)) {
                        return await downloadM3u8(id, url, info, item.index, done);
                    }

                    // ⚠ v0.1.23 撤销 v0.1.22 的「视频直连」。
                    //
                    // 用户实测反馈：「其他脚本下载视频不会跳出新链接」——
                    // 姐姐 v0.1.22 让 <a href="f.video.weibocdn.com/..." download="x.mp4">
                    // 直接导航，结果整个微博页面被跳走到视频 CDN 上。
                    //
                    // WHY 这是错的（浏览器硬规则，不是配置问题）：
                    //   <a download> 属性**只对同源 URL 生效**。
                    //   视频地址在 f.video.weibocdn.com，与页面 weibo.com 跨域，
                    //   Chrome 会**忽略 download 属性**，改为直接导航到该 URL。
                    //   结果：不是下载文件，而是把当前页替换成视频流。
                    //
                    // 参考脚本（OWENDSWANG v1.5.3）为什么不会跳？
                    //   它**先 GM_xmlhttpRequest 拉成 blob**，再用
                    //   link.href = URL.createObjectURL(blob) —— blob: 是同源，
                    //   download 属性生效，文件名可控，也不会导航。
                    //   姐姐 v0.1.22 抄的时候只抄了「不绕 GM_download」这一半，
                    //   把「必须先变 blob」这一半漏了，于是改成了跨域直连。
                    //
                    // 正确链路：URL → GM_xmlhttpRequest(blob) → createObjectURL
                    //          → <a download>（同源，download 生效）→ 延迟清理
                    // 即：视频走 fetchBlob + saveBlob（原生落盘），不走 GM_download。

                    // ⚠ 视频直落的视频**不能塞进 files**。
                    // WHY：GM_download 是**立即返回**的（扩展自己在后台下），
                    //   files 是给后续统一落盘用的 —— 混进去会被落两次，
                    //   一份数据两个文件。
                    //
                    // v0.1.29：视频直落必须在这里（收集阶段）判定 —— 
                    // 放在落盘阶段是错的（item 已出作用域）。
                    //
                    // WHY 要在 fetchBlob **之前**：GM_download 直落是扩展自己拉，
                    // 不需要 blob、不需要进 files（进了会被二次落盘）。
                    // 早于 fetchBlob 判定才能省掉一次几 MB 的无效下载。
                    // ⚠ `=== false` 而非 `!cfg.x` —— undefined 也走直落，
                    //   免得「配置丢失」被静默当成「用户选了 blob 路径」。
                    if (item.isTop && cfg.isVideoViaBlob === false) {
                        const handed = saveVideoViaGM(url, info, item, done, saveVideoViaBlob);
                        if (handed) {
                            // 打标记，供落盘阶段的「files 为空」判定用（v0.1.28）。
                            item.__handedToGM = true;
                            // 已交给 GM_download，返回 null 不进 files。
                            return null;
                        }
                        // 没能交给扩展（GM_download 不可用/抛异常）→ 走 blob 兜底。
                        console.warn(`${TAG} 视频直落不可用，改走 blob 路径`);
                    }

                    let res = await fetchBlob(url, { verbose: !!item.isTop });
                    // ⚠ v0.1.1：ajax 超清接口对部分图片会返 HTML 错误页，
                    // 此时不能静默丢图，必须降级到 mw2000 重下（§10.16 铁律 3）
                    if (isEmptyResult(res)) {
                        const fallback = fallbackUrls.get(url);
                        if (fallback) {
                            // 图片降级到 mw2000，视频降级到 stream_url —— 同一套兜底
                            const isVid = key === 'media' || /\.(mp4|m3u8|mov|flv)/i.test(url);
                            console.log(`${TAG} ${isVid ? '高清视频' : '超清图'}失败，降级重试：${url.slice(0, 70)}`);
                            res = await fetchBlob(fallback);
                            url = fallback;
                        } else if (isHdEndpoint(url)) {
                            console.log(`${TAG} 超清接口失败且无降级地址：${url.slice(0, 70)}`);
                        }
                    }
                    if (isEmptyResult(res)) {
                        // v0.1.17：把 HTTP 状态打出来 —— 403/404/200空体 三种原因完全不同
                        console.warn(
                            `${TAG} 空资源 idx=${item.index} status=${res.status} ` +
                            `type=${res.response && res.response.type || 'n/a'} ` +
                            `size=${res.response && res.response.size || 0} ` +
                            `url=${url.slice(0, 100)}`
                        );
                        return null;
                    }
                    const blob = res.response;
                    // v0.1.3：模板驱动命名，序号由收集阶段分配
                    //
                    // v0.1.29 真因（用户实测文件名又变「#00」）：
                    //   这里**又**拿 URL 推了一遍扩展名，覆盖 item.ext。
                    //   而这里的 url 是「加过缓存参数 / 破缓存参数」之后的地址，
                    //   尾部形态跟收集阶段完全不同 —— 正则会从尾部捞出 `_00` 这种
                    //   数字片段当成扩展名，文件名就退回「微博#xxx#00」。
                    //   （v0.1.17 已经把 extOf 的数字误判堵住了，
                    //     但漏了这处「二次推导」，等于前门堵了后门没堵。）
                    // 修法：item.ext 在收集阶段已经用干净 URL 判过一次，
                    //        这里直接用，不再二次推导。
                    const ext = item.ext || (item.isTop ? 'mp4' : 'jpg');
                    // ⚠ v0.1.10 修复：-live 必须插在扩展名之前，不能追加到文件名末尾。
                    // 旧写法 `renderName(...) + '-live'` 得到 "xx#03.mp4-live"，
                    // 再进 safeDownloadName 时末尾没有合法扩展名 → 被压成 ".bin"，
                    // 最终落盘成 "微博#...#03.mp4-live.bin"（MP4 内容套了个假扩展名）。
                    // 传真实 ext 再摘出来拼（传空串会让 {ext} 降级成 x）
                    const base = renderName(info, item.index, ext);
                    const name = item.isLive
                        ? base.replace(/\.[A-Za-z0-9]{2,4}$/, '') + `-live.${ext}`
                        : base;
                    // v0.1.23：标记视频，落盘时要走原生（跨域 URL 不能直接 download）
                    files.push({ name, data: blob, isVideo: !!item.isTop });
                    return blob;
                } catch (e) {
                    console.warn(`${TAG} 下载失败 idx=${item.index} url=${url.slice(0, 90)}`, e.message);
                    return null;
                } finally {
                    done.q++;
                    setTask(id, {
                        percent: Math.round(done.q / done.total * 100),
                        message: `${done.q}/${done.total}`,
                    });
                }
            });
        });

        await queue.start();

        // v0.1.28 关键修正：直落的视频**不进 files**（它自己后台下），
        // 所以 files.length === 0 不等于「一个资源都没拿到」。
        //
        // v0.1.27 真因（用户实测「保存的媒体不落盘」）：
        //   队列修好后，单视频这条终于能走到这里 ——
        //   但视频走 saveVideoViaGM（GM_download 直落）时**故意不 push 到 files**，
        //   于是 files 长度是 0，撞上下面的 `files.length === 0` 判定，
        //   被当成「无资源」报 MSG.failed，**在 GM_download 还在后台下载时就宣告失败**。
        //   表现：视频其实下下来了（文件在），但进度条显示「重试」。
        //
        // 修法：分开判断。
        //   · videoHanded > 0 → 视频已交给 GM_download，等它的 onload 再报完成
        //   · files.length === 0 且 videoHanded === 0 → 才是真的没资源
        const videoHanded = mediaItems.filter((m) => m.isTop && handedToGM(m)).length;

        console.log(
            `${TAG} 队列完成 收集=${files.length}/${mediaItems.length} ` +
            `视频项=${mediaItems.filter((m) => m.isTop).length} ` +
            `直落=${videoHanded} 视频blob=${files.filter((f) => f.isVideo).length}`
        );

        if (files.length === 0 && videoHanded === 0) {
            setTask(id, { message: MSG.failed });
            return false;
        }

        // 纯视频（全部走直落、files 为空）：任务状态由 GM_download 的回调驱动，
        // 这里不能立刻标完成也不能标失败 —— 交给 saveVideoViaGM 的 onload/onerror。
        // 否则会出现「进度条说完成了，文件其实还在下」或反过来的错位。
        if (files.length === 0) {
            console.log(
                `${TAG} 全部走 GM_download 直落（files=0，直落=${videoHanded}）` +
                `— 状态由 GM_download 回调驱动，不在此处判定`
            );
            setTask(id, { message: '已交给浏览器下载' });
            // v0.1.28：把任务状态回调挂到 item 上。
            // WHY：直落的 GM_download 是**异步**的，落盘阶段到这里就 return 了，
            // 用户看到的进度条会永远停在「已交给浏览器下载」。
            // 挂上回调后，GM_download 的 onload 回来才把状态改成「完成」/「失败」，
            // 进度条才反映真实结果。
            mediaItems.forEach((m) => {
                if (!m.isTop || !handedToGM(m)) return;
                m.onGMDone = (ok) => {
                    setTask(id, { message: ok ? MSG.done : MSG.failed });
                };
            });
            return true;
        }

        // ── 落盘（v0.1.2：GM_download 异步，必须等真实回调再报完成）──
        // v0.1.1 这里是「调完 saveBlob 立刻标完成」，但 GM_download 是异步的，
        // 浏览器可能拒收。提前报完成 = 进度条骗人，用户看不到真实失败。
        setTask(id, { message: '保存中' });

        // v0.1.28：混批场景（图 + 视频）也把回调挂上 ——
        // 图走 files 正常落盘，视频在后台直落，两者进度要合并显示。
        // 这里记下初始的视频直落数，等图都落完再决定最终文案。
        // v0.1.31：savedOk 提前声明。
        // WHY：下面的 onGMDone 闭包里会读 savedOk（打合并日志），
        //   而原来的 `let savedOk = 0` 写在闭包之后 ——
        //   闭包本身没问题（异步回调，执行时早已赋值），
        //   但一旦以后有人在同步路径上调用 onGMDone 就会踩 TDZ。
        //   提前声明把这个坑永久封掉。
        let savedOk = 0;

        // v0.1.31 修正（姐姐自查发现）：
        //   旧写法 `let handedCount = videoHanded` + 回调里 `if (ok) handedCount++`
        //   初始值就等于终态阈值，所以**第一个视频回调就满足 >= videoHanded**，
        //   会立刻 setTask 定终态 —— 此时图集可能才落了一半，
        //   进度文案被视频的回调覆盖，混批场景状态永远不准。
        //   而且 `ok` 只取最后一个视频的成败，前面的失败会被吞掉。
        //
        // 修法：分开「已出结果数」和「成功数」两个计数，互不干扰；
        //      只有全部视频都回报了才定终态，且终态看**整体**而非最后一个。
        let gmReported = 0;
        let gmOk = 0;
        mediaItems.forEach((m) => {
            if (!m.isTop || !handedToGM(m)) return;
            m.onGMDone = (ok) => {
                gmReported += 1;
                if (ok) gmOk += 1;
                if (gmReported < videoHanded) return;   // 还有视频在跑，不定终态
                const allOk = gmOk === videoHanded;
                console.log(
                    `${TAG} 视频直落收尾 ${gmOk}/${videoHanded} 成功` +
                    `（图集落盘 ${savedOk}/${files.length}）`
                );
                // ⚠ 不传 percent: undefined —— Object.assign 会把
                //   已有 percent 覆盖成 undefined，渲染时变成 NaN%。
                const finalPatch = { message: allOk ? MSG.done : MSG.failed };
                if (allOk) finalPatch.percent = 100;
                setTask(id, finalPatch);
            };
        });

        const saveOne = (blob, name, isVideo) => new Promise((resolve) => {
            saveBlob(blob, safeDownloadName(name), null, (ok) => {
                if (ok) savedOk++;
                resolve(ok);
            }, !!isVideo);
        });

        if (cfg.isPack && files.length > 1) {
            const zip = buildZip(files.map((f) => ({
                // zip 内用「序号.ext」，完整模板名由 zip 文件名承载，避免重复前缀
                name: f.name.replace(/^.*?(#\d{2})/, '$1').replace(/\.[^.]+$/, '') + '.part',
                data: f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data),
            })));
            await saveOne(zip, `${title}.zip`);   // zip 保持整包名，不套单图模板
        } else {
            // v0.1.9：串行 → 错峰批量落盘
            // WHY 不能直接并发：浏览器同一瞬间只接收一个下载任务，多余的静默丢弃
            //   （Tampermonkey issue #1113 明确要求 "add a delay between file saving"）
            //   v0.1.2~v0.1.8 的全串行是"错峰到极致"，安全但慢——
            //   每张图都要等 onload 回调才下一个，整个过程被网络往返卡死。
            // 折中：批内并发（浏览器仍逐个接收，只是紧邻触发，命中概率低）+
            //       批间等 gap（给浏览器一个明确的"这一批处理完了"信号）。
            // 实测参数：batch=3 / gap=260ms 是保守起点，可在面板调。
            const batchSize = Math.max(1, Number(cfg.saveBatch) || 3);
            const gap = Math.max(0, Number(cfg.saveGap) || 0);
            let batchOk = 0, batchTotal = 0;

            for (let i = 0; i < files.length; i += batchSize) {
                const batch = files.slice(i, i + batchSize);
                batchTotal += batch.length;
                const results = await Promise.all(
                    batch.map((f) => new Promise((resolve) => {
                        // v0.1.23：视频走原生落盘（forceNative=true）
                        saveBlob(f.data, safeDownloadName(f.name), null, (ok) => {
                            if (ok) batchOk++;
                            resolve(ok);
                        }, !!f.isVideo);
                    }))
                );
                setTask(id, {
                    message: `保存中 ${i + results.filter(Boolean).length}/${files.length}`,
                    percent: Math.round((i + batch.length) / files.length * 95),
                });
                // 批间让路：让浏览器确认收完这一批
                if (gap > 0 && i + batchSize < files.length) await sleep(gap);
            }
            savedOk = batchOk;
            console.log(`${TAG} 错峰落盘: ${batchOk}/${batchTotal} 成功（batch=${batchSize} gap=${gap}ms）`);
        }

        if (savedOk === 0) {
            console.error(`${TAG} downloadWeibo ❌ 全部落盘失败 id=${id}（检查浏览器下载权限）`);
            setTask(id, { message: MSG.failed });
            return false;
        }

        console.log(`${TAG} downloadWeibo ✅ id=${id} → ${savedOk}/${files.length} 个文件已保存, 标题=${title}`);
        setTask(id, {
            message: savedOk < files.length ? `已存${savedOk}/${files.length}` : MSG.done,
            percent: 100,
        });
        GM_setValue('wb_last_result', files.map((f) => f.name).join('\n'));
        return true;
    }

    /** m3u8 直播下载：解析分片 → 并发拉取 → Blob 拼接 */
    async function downloadM3u8(id, m3u8Url, info, index, done) {
        try {
            const manifestRes = await fetchBlob(m3u8Url, { timeout: 20000 });
            if (isEmptyResult(manifestRes)) {
                console.warn(`${TAG} m3u8 ❌ manifest 为空`);
                return null;
            }
            const text = await manifestRes.response.text();
            const segs = parseM3u8(text, m3u8Url);
            console.log(`${TAG} m3u8 ✅ 解析出 ${segs.length} 个分片`);
            if (segs.length === 0) return null;

            const parts = [];
            const queue = createQueue(6);
            segs.forEach((seg) => {
                queue.add(async () => {
                    try {
                        const r = await fetchBlob(seg, { timeout: 30000 });
                        if (isEmptyResult(r)) return null;
                        parts.push(r.response);
                        return r.response;
                    } catch (e) {
                        return null;
                    } finally {
                        setTask(id, {
                            message: `直播 ${parts.length}/${segs.length}`,
                            percent: Math.round(parts.length / segs.length * 100),
                        });
                    }
                });
            });
            await queue.start();

            if (parts.length === 0) return null;
            const merged = new Blob(parts, { type: 'video/mp2t' });
            const outName = renderName(info, index, 'mp4');
            await new Promise((resolve) => {
                saveBlob(merged, safeDownloadName(outName), null, resolve);
            });
            console.log(`${TAG} m3u8 ✅ 合并 ${parts.length} 段 → ${outName}`);
            return merged;
        } catch (e) {
            console.error(`${TAG} m3u8 ❌`, e.message);
            return null;
        }
    }

    // ══════════════════════════════════════════════════════════════
    // §9  UI 层
    // ══════════════════════════════════════════════════════════════

    let panel = null;
    let panelTimer = null;

    const CSS = `
/* v0.1.7 面板位置：左下角
   原先贴左上（left:0;top:0），跟微博自身的左侧导航栏打架。
   左下是微博不占的位置，且跟右下角的卡片下载按钮分居两端，不打架。 */
/* ═══════════════════════════════════════════════════════════
   v0.1.32 UI 重做：只改视觉层，id / 类名 / 行为全部不动
   ───────────────────────────────────────────────────────────
   设计取向：
   · 深色毛玻璃卡片 —— 微博是白底亮色，浅色面板贴在页面上「像贴纸」，
     深色 + 毛玻璃能压住页面又不像插件（对比：真插件都长这样）
   · 开关做成「胶囊 + 状态点」，一眼分得清开/关，
     不再靠 ✔️❌ emoji 猜（emoji 在不同系统下渲染差异大）
   · 主按钮（批量下载）用品牌红实心，次要开关全部弱化成幽灵按钮，
     视觉层级：主操作 > 常用开关 > 数字微调
   · 数字输入加 stepper 样式（上下箭头），比 contenteditable 纯文本好用
   · 保留 --wb-* 变量入口，深色模式下用户可自行换配色
   ═══════════════════════════════════════════════════════════ */
#wb-panel{
  position:fixed;left:14px;bottom:14px;z-index:2147483000;
  font:12px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;
  color:var(--wb-text,#e8eaed);
  user-select:none;max-width:352px;
  transition:opacity .22s ease,transform .22s ease;
}
#wb-panel.wb-collapsed{opacity:0;transform:translateY(8px);pointer-events:none}
/* v0.1.33 改：收起抓手改为「微博黄 + 红色描边」双色。
 *
 * 用户反馈「左下的红和黑差别不明显」—— 之前是
 *   纯红方块 opacity:.5 压在深色面板上（rgba(28,28,32,.92)）。
 *   深底 + 半透明红 = 暗红，视觉上跟面板的黑几乎融成一片，
 *   根本看不出「这里有个可以点回来的东西」。
 *
 * 修法（换成微博自己的品牌黄，红只做描边）：
 *   · 微博主色是 #ff8200~#ffc300 这一带的橙黄，跟微博页头的黄色 logo 同源，
 *     在白底和深底上都能跳出来，不会跟红按钮/深色面板混淆
 *   · 加一圈红色描边 → 双色对比，黄底红边在暗背景上辨识度最高
 *   · 尺寸 16→22px、加圆角和阴影，小到不挡内容、大到一眼能看见
 *   · hover 加亮，给一个「能点回来」的暗示
 */
#wb-panel.wb-collapsed::after{
  content:"";position:fixed;left:0;bottom:0;width:22px;height:22px;
  background:linear-gradient(135deg,#ffc300,#ff8200);
  border:2px solid var(--wb-brand,#e6162d);
  border-radius:0 9px 0 9px;
  box-shadow:0 2px 10px rgba(255,130,0,.5),0 0 0 1px rgba(0,0,0,.12);
  opacity:1;cursor:pointer;
  transition:filter .16s,transform .16s;
}
#wb-panel.wb-collapsed::after:hover{filter:brightness(1.1);transform:scale(1.08)}
#wb-panel:hover{transform:none}

#wb-panel .wb-box{
  background:var(--wb-bg,rgba(28,28,32,.92));
  -webkit-backdrop-filter:blur(14px) saturate(1.3);
  backdrop-filter:blur(14px) saturate(1.3);
  border:1px solid rgba(255,255,255,.09);
  border-radius:14px;padding:11px 12px;
  box-shadow:0 8px 32px rgba(0,0,0,.36),0 1px 0 rgba(255,255,255,.05) inset;
  max-height:66vh;overflow:auto;
}
#wb-panel .wb-box::-webkit-scrollbar{width:5px}
#wb-panel .wb-box::-webkit-scrollbar-thumb{
  background:rgba(255,255,255,.16);border-radius:3px
}
#wb-panel .wb-box::-webkit-scrollbar-track{background:transparent}

#wb-panel .wb-row{display:flex;gap:6px;align-items:center;margin-bottom:6px;flex-wrap:wrap}
#wb-panel .wb-row:last-of-type{margin-bottom:8px}

/* ── 开关胶囊：状态点 + 文字 ── */
#wb-panel .wb-toggle{
  display:inline-flex;align-items:center;gap:5px;
  background:rgba(255,255,255,.06);
  border:1px solid rgba(255,255,255,.1);
  border-radius:999px;cursor:pointer;
  padding:4px 10px 4px 8px;font-size:11.5px;
  color:rgba(255,255,255,.62);
  white-space:nowrap;
  transition:background .16s,border-color .16s,color .16s;
}
#wb-panel .wb-toggle:hover{background:rgba(255,255,255,.12);color:rgba(255,255,255,.9)}
/* 状态点：关=灰、并且整个胶囊降透明；开=品牌红点亮 */
#wb-panel .wb-toggle::before{
  content:"";width:6px;height:6px;border-radius:50%;flex:0 0 auto;
  background:rgba(255,255,255,.28);
  transition:background .16s,box-shadow .16s;
}
#wb-panel .wb-toggle.wb-on{
  background:rgba(230,22,45,.16);border-color:rgba(230,22,45,.5);
  color:#fff;
}
#wb-panel .wb-toggle.wb-on::before{
  background:var(--wb-brand,#e6162d);
  box-shadow:0 0 0 3px rgba(230,22,45,.2);
}
/* 关态文案需要更弱的视觉 —— 用 first-child span 的透明度表达 */
#wb-panel .wb-toggle:not(.wb-on){opacity:.72}

/* ── 主按钮：唯一实心红，视觉锚点 ── */
#wb-panel .wb-toggle.wb-main{
  border-color:transparent;padding:6px 14px;font-size:12.5px;font-weight:600;
  background:var(--wb-brand,#e6162d);color:#fff;
  box-shadow:0 2px 10px rgba(230,22,45,.3);
}
#wb-panel .wb-toggle.wb-main::before{display:none}
#wb-panel .wb-toggle.wb-main:hover{filter:brightness(1.12);background:var(--wb-brand,#e6162d)}
#wb-panel .wb-toggle.wb-main.on{
  background:rgba(255,255,255,.1);color:#fff;border:1px solid rgba(255,255,255,.16);
  box-shadow:none;
}

/* ── 数字微调：带上下箭头的 stepper ── */
#wb-panel .wb-speed{
  display:inline-flex;align-items:center;gap:3px;
  font-size:10.5px;color:rgba(255,255,255,.4);
  background:rgba(255,255,255,.04);
  border:1px solid rgba(255,255,255,.08);
  border-radius:8px;padding:3px 7px;cursor:default;white-space:nowrap;
}
#wb-panel .wb-speed span[contenteditable]{
  min-width:16px;text-align:center;
  color:#fff;font-weight:600;font-variant-numeric:tabular-nums;
  outline:none;padding:0 1px;border-radius:3px;
  border-bottom:1px dashed rgba(255,255,255,.2);
  transition:background .14s,border-color .14s;
}
#wb-panel .wb-speed span[contenteditable]:hover{background:rgba(255,255,255,.1)}
#wb-panel .wb-speed span[contenteditable]:focus{
  background:rgba(230,22,45,.18);border-bottom-color:var(--wb-brand,#e6162d);
  color:#fff;
}
/* contenteditable 加上下箭头提示「可调」 */
#wb-panel .wb-speed span[contenteditable]::after{
  content:"\\2191\\2193";font-size:7px;opacity:.3;margin-left:1px;
  font-weight:400;letter-spacing:-1px;vertical-align:middle;
}
#wb-panel .wb-speed span[contenteditable]:focus::after{opacity:.7}

#wb-panel .wb-title{font-weight:700;color:var(--wb-brand,#ff6b78);cursor:pointer;flex:0 0 auto}
#wb-panel .wb-state{cursor:pointer;white-space:nowrap;color:var(--wb-brand,#ff6b78)}

/* ── 任务列表 ── */
/* 任务列表容器 —— v0.1.32 补：此前只有子项有样式，容器本身是裸的，
   导致列表和上方开关行之间没有分隔、滚动时糊成一片 */
#wb-panel .wb-list{
  margin-top:8px;padding-top:7px;
  border-top:1px solid rgba(255,255,255,.08);
  display:flex;flex-direction:column;gap:1px;
}
#wb-panel .wb-list:empty{display:none}
#wb-panel .wb-item{
  display:flex;gap:6px;align-items:center;margin:3px 0;
  padding:4px 7px;border-radius:8px;
  background:rgba(255,255,255,.03);
  opacity:.4;transition:opacity .2s,background .2s;
}
#wb-panel .wb-item:hover{background:rgba(255,255,255,.07)}
#wb-panel .wb-item.wb-done{opacity:1}
#wb-panel .wb-item .wb-link{
  flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  color:inherit;text-decoration:none;
}
#wb-panel .wb-item .wb-link:hover{text-decoration:underline;color:#fff}
#wb-panel .wb-bar{height:3px;background:rgba(255,255,255,.1);border-radius:2px;overflow:hidden;margin-top:3px}
#wb-panel .wb-bar>i{
  display:block;height:100%;border-radius:2px;
  background:linear-gradient(90deg,var(--wb-brand,#e6162d),#ff7a5c);
  transition:width .25s ease;
}
#wb-panel .wb-sep{height:1px;background:rgba(255,255,255,.08);margin:9px 0}

/* ── 卡片右下角下载按钮 ── */
.wb-card-dl{
  position:absolute;bottom:10px;right:10px;z-index:12;
  background:var(--wb-brand,#e6162d);color:#fff;border:none;border-radius:999px;
  padding:4px 13px;font:600 11.5px/1.7 -apple-system,"PingFang SC",sans-serif;
  cursor:pointer;opacity:.88;
  transition:opacity .16s,filter .16s,transform .16s;
  pointer-events:auto;
  box-shadow:0 2px 10px rgba(0,0,0,.28);user-select:none;
}
.wb-card-dl:hover{filter:brightness(1.14);opacity:1;transform:translateY(-1px)}
.wb-card-dl:active{transform:translateY(0)}
.wb-card-dl.wb-busy{background:#6b7280;cursor:wait}
.wb-card-dl.wb-ok{background:#16a34a}
.wb-card-dl.wb-ok:hover{filter:none;opacity:1}
.wb-card-dl.wb-fail{background:#f97316}

/* ── 批量工具条 ── */
.wb-batch-bar{
  position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:2147483001;
  background:rgba(20,20,24,.9);
  -webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);
  color:#fff;border:1px solid rgba(255,255,255,.1);
  border-radius:999px;padding:7px 8px 7px 16px;display:flex;gap:6px;align-items:center;
  font:12px/1 -apple-system,"PingFang SC",sans-serif;
  box-shadow:0 8px 28px rgba(0,0,0,.36);
}
.wb-batch-bar button{
  background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.08);color:#fff;
  border-radius:999px;padding:5px 13px;cursor:pointer;
  font-size:12px;font-family:inherit;transition:background .14s;
}
.wb-batch-bar button:hover{background:rgba(255,255,255,.18)}
.wb-batch-bar button.wb-primary{
  background:var(--wb-brand,#e6162d);border-color:transparent;font-weight:600;
}
.wb-batch-bar button.wb-primary:hover{filter:brightness(1.12);background:var(--wb-brand,#e6162d)}

.wb-card-pick{
  position:absolute;bottom:10px;right:10px;z-index:14;width:24px;height:24px;
  border-radius:50%;border:2px solid rgba(255,255,255,.92);
  background:rgba(0,0,0,.4);cursor:pointer;display:none;
  align-items:center;justify-content:center;color:#fff;
  font:700 13px sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.4);
  transition:background .14s,transform .14s;
}
.wb-card-pick:hover{transform:scale(1.08)}
body.wb-batch .wb-card-pick{display:flex}
.wb-card-pick.wb-on{background:var(--wb-brand,#e6162d);border-color:#fff}
`;

    /** 创建面板 */
    function buildPanel() {
        if (panel) return panel;
        panel = document.createElement('div');
        panel.id = 'wb-panel';
        panel.innerHTML = `
<div class="wb-box">
  <div class="wb-row">
    <span class="wb-toggle" id="wb-cardbtn">✔️卡片按钮</span>
    <span class="wb-speed" title="落盘错峰：每批几个文件一起触发">
      批<span id="wb-batch-num" contenteditable="true" spellcheck="false">3</span>
      ·<span id="wb-gap-num" contenteditable="true" spellcheck="false" title="批间间隔（毫秒）">260</span>ms
    </span>
    <span class="wb-toggle wb-main" id="wb-batch">${cfg.isBatch ? '✅ 退出批量' : '📦 批量下载'}</span>
  </div>
  <div class="wb-row">
    <span class="wb-toggle" id="wb-pack">${cfg.isPack ? '✔️打包' : '❌打包'}</span>
    <span class="wb-toggle" id="wb-hd">${cfg.isImageHD ? '✔️超清图' : '❌超清图'}</span>
    <span class="wb-toggle" id="wb-vhd">${cfg.isVideoHD ? '✔️超清视频' : '❌超清视频'}</span>
    <span class="wb-toggle" id="wb-text">${cfg.isIncludesText ? '✔️正文' : '❌正文'}</span>
  </div>
  <div id="wb-list"></div>
</div>`;
        document.body.appendChild(panel);
        bindPanel();
        return panel;
    }

    function renderPanel() {
        try {
            if (!panel) return;
            const list = panel.querySelector('#wb-list');
            if (!list) return;

            const all = Array.from(tasks.values());
            const active = all.filter((t) => t.message !== MSG.done);
            const recent = active.length ? active : all;
            // v0.1.33：条数收口到 HISTORY_MAX（原先是 clamp(cfg.messagesNumber, 3, 40)）
            const n = HISTORY_MAX;
            const show = recent.slice(-n).reverse();

            list.innerHTML = show.map((t) => `
<div class="wb-item ${t.message === MSG.done ? 'wb-done' : ''}" data-id="${t.id}">
  <a class="wb-link" href="https://weibo.com/${t.id}" target="_blank" title="${escapeHtml(t.title)}">${escapeHtml(t.title)}</a>
  <span class="wb-state">${escapeHtml(t.message)}</span>
  <div class="wb-bar"><i style="width:${t.percent || 0}%"></i></div>
</div>`).join('');

            // 状态可点击重下
            list.querySelectorAll('.wb-state').forEach((el) => {
                el.addEventListener('click', () => {
                    const id = el.closest('.wb-item').dataset.id;
                    downloadWeibo(id);
                });
            });

            if (cfg.isAutoHide && active.length === 0) {
                clearTimeout(panelTimer);
                panelTimer = setTimeout(() => panel.classList.add('wb-collapsed'), 4000);
            } else {
                panel.classList.remove('wb-collapsed');
            }
        } catch (e) {
            console.warn(`${TAG} renderPanel ⚠️`, e.message);
        }
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        })[c]);
    }

    /** 面板内的开关 + 拖拽命名 */
    function bindPanel() {
        // v0.1.4：PANEL_LABELS 已提到模块级（syncPanelToggles 要用）
        const paintToggle = (sel) => {
            const el = panel.querySelector(sel);
            const def = PANEL_LABELS[sel];
            if (!el || !def) return;
            el.textContent = cfg[def.key] ? def.on : def.off;
            // v0.1.32：所有开关都点亮状态点（不再只有主按钮）。
            // WHY：v0.1.32 的 UI 用「胶囊 + 状态点」区分开关，
            //   状态点不亮就分不出开/关；而旧写法 `&& !!def.big`
            //   只给批量下载那一个加 on 类，其余开关永远是无点状态。
            el.classList.toggle('on', !!cfg[def.key]);
            el.setAttribute('title', `${def.on.replace(/[✔✅❌]/g, '').trim()}：点击切换`);
        };

        const bindToggle = (sel) => {
            const el = panel.querySelector(sel);
            if (!el) return;
            el.addEventListener('click', () => {
                const def = PANEL_LABELS[sel];
                cfg[def.key] = !cfg[def.key];
                GM_setValue(CFG_KEYS[def.key], cfg[def.key]);
                paintToggle(sel);
                if (sel === '#wb-batch') applyBatchMode(cfg.isBatch);
                if (sel === '#wb-cardbtn') applyCardBtnVisibility(cfg.isCardBtn);
                console.log(`${TAG} cfg ${def.key} → ${cfg[def.key]}`);
            });
        };

        Object.keys(PANEL_LABELS).forEach((sel) => {
            bindToggle(sel);
            paintToggle(sel);
        });

        // v0.1.9：落盘错峰参数（批大小 + 批间隔），就地编辑
        const bindNum = (sel, key, min, max, def) => {
            const el = panel.querySelector(sel);
            if (!el) return;
            el.textContent = String(cfg[key] ?? def);
            const commit = () => {
                let v = parseInt(el.textContent, 10);
                if (!Number.isFinite(v)) v = def;
                v = Math.max(min, Math.min(max, v));
                cfg[key] = v;
                el.textContent = String(v);
                GM_setValue(CFG_KEYS[key], v);
                console.log(`${TAG} ${key} → ${v}`);
            };
            el.addEventListener('blur', commit);
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
            });
        };
        bindNum('#wb-batch-num', 'saveBatch', 1, 8, 3);
        // 把批大小设成 1 就退化成全串行 —— 这是内置的"安全模式"，
        // 不用额外开关：丢文件时用户改一个数字就能保命。
        bindNum('#wb-gap-num', 'saveGap', 0, 3000, 260);

        // v0.1.8：删除「显示条数」输入框 + 拖拽命名排序
        // 命名已由 v0.1.3 的模板系统接管（油猴菜单「🏷 设置命名模板」），
        // 面板里这套 7 字段拖拽是遗留物，两套并存只会让人不知道该改哪个。
    }

    // ══════════════════════════════════════════════════════════════
    // §10  卡片增强：时间戳入口 + 批量选择 + 大图
    // ══════════════════════════════════════════════════════════════

    const pending = new Set();
    let flushScheduled = false;
    const MAX_PENDING = 200;
    let pendingCards = 0;   // v0.1.11：因未布局而暂缓挂按钮的卡片数

    function scheduleFlush() {
        if (flushScheduled) return;
        flushScheduled = true;
        const run = () => {
            flushScheduled = false;
            flush();
        };
        if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(run, { timeout: 200 });
        } else {
            setTimeout(run, 120);
        }
    }

    /** flush 入口 —— 必包 try-catch（§10.4 真因 2） */
    function flush() {
        try {
            enhanceCards();
            injectCardButtons();
            if (cfg.isBatch) injectPickers();
            // v0.1.11：滚动加载导致上一轮被标记 wbPending 的卡片，本轮布局已就绪
            // → 清标记，让 injectCardButtons 下一轮能挂上按钮。
            // 这类卡片不会触发新的 DOM mutation，所以要靠 flush 主动清理。
            if (pendingCards > 0) {
                document.querySelectorAll('[data-wb-pending="1"]').forEach((el) => {
                    const r = el.getBoundingClientRect();
                    if (r.width > 0 || r.height > 0) pendingCards--;
                });
            }
        } catch (e) {
            console.warn(`${TAG} flush ⚠️`, e.message);
        }
    }

    function enhanceCards() {
        const cards = collectCards();
        let touched = 0;
        SKIP.noId = 0; SKIP.noMedia = 0; SKIP.tooSmall = 0;
        for (const card of cards) {
            // v0.1.15：只剩右下角按钮，本函数只负责打标记（注入交给 injectCardButtons）
            if (card.dataset.wbEnhanced === '1') continue;
            // v0.1.12：跳过原因逐条统计 —— 用户反馈「有的卡片有按钮有的没有」时，
            // 光看总数猜不出是哪一关挡的，必须按原因分开数。
            const id = extractId(card);
            if (!id) { SKIP.noId++; continue; }
            if (!cardHasMedia(card)) { SKIP.noMedia++; continue; }
            const r = card.getBoundingClientRect();
            if (r.width < 200 || r.height < 80) { SKIP.tooSmall++; continue; }

            card.dataset.wbId = id;
            card.dataset.wbEnhanced = '1';
            // v0.1.15：顶部标签已移除，enhanceCards 只负责打标记，
            // 按钮本体由 injectCardButtons 统一注入（右下角，常驻）。
            touched++;
        }
        // v0.1.21：跳过原因进常规日志。
        // 之前只在手动「显示诊断信息」菜单里打印，flush 每秒跑一次却是静默的 ——
        // 用户看到「卡片=24 却只挂 1 个」时，完全看不出另外 23 张卡卡在哪一关。
        // 现在每轮把「候选 / 新增 / 已增强 / 无id / 无媒体 / 太小」一起打出来，
        // 三个跳过数之和 + 已增强 必须等于候选数，一眼能对账。
        console.log(
            `${TAG} enhanceCards: 候选=${cards.length} 新增=${touched} ` +
            `已增强=${cards.filter((c) => c.dataset.wbEnhanced === '1').length} ` +
            `| 跳过 无id=${SKIP.noId} 无媒体=${SKIP.noMedia} 太小=${SKIP.tooSmall}`
        );

        // 事件委托：点时间戳 = 下载
        if (!enhanceCards._bound) {
            enhanceCards._bound = true;
            // v0.1.15：只剩右下角一个入口
            document.addEventListener('click', (e) => {
                const btn = e.target.closest && e.target.closest('.wb-card-dl');
                if (!btn) return;
                const id = btn.dataset.id;
                if (!id) return;
                e.preventDefault();
                e.stopPropagation();
                if (btn.dataset.wbBusy === '1') return;
                btn.dataset.wbBusy = '1';
                btn.classList.remove('wb-ok', 'wb-fail');
                btn.classList.add('wb-busy');
                btn.textContent = '⏳ 下载中';
                downloadWeibo(id).then((ok) => {
                    btn.dataset.wbBusy = '0';
                    btn.classList.remove('wb-busy');
                    btn.classList.add(ok ? 'wb-ok' : 'wb-fail');
                    btn.textContent = ok ? '✅ 完成' : '↻ 重试';
                });
            }, true);
        }
    }

    /**
     * v0.1.5：卡片级下载按钮
     *
     * 为什么放在卡片右上角而不是媒体旁边：
     * - 微博右上角通常是「转发/评论/点赞」区，注入在那儿会跟原生按钮重叠
     * - 卡片级按钮的位置用 CSS 绝对定位钉死，靠 hover 才显现，不挡内容
     * - 按钮挂在 card 上而非具体图片上 —— 微博改版时图片节点位置常变，
     *   卡片根节点反而稳定（§10.15 坐标计算原则：依赖结构少的东西）
     *
     * 与既有入口的关系：
     * - 时间戳「下载」标签：保留，作为快速入口
     * - 本按钮：显式入口，不误触，且带独立状态显示
     */
    function injectCardButtons() {
        if (!cfg.isCardBtn) return;
        try {
            const cards = collectCards();
            let n = 0;
            // v0.1.21：注入侧的跳过原因统计（此前完全没有，
            // 导致「卡片=24 只挂 1 个」时无法判断是识别问题还是注入问题）
            let nNoId = 0, nNoMedia = 0, nTooSmall = 0;
            for (const card of cards) {
                // ⚠ v0.1.11 自愈：React 复用节点时可能清掉我们注入的 button，
                // 但 wbDlBtn 标记还在 → 旧逻辑认为"已挂载"直接跳过，按钮永远回不来。
                // 表现为：滚动来回后某些卡片的按钮突然消失。
                // 修法：标记在但 DOM 里没按钮 → 清标记重挂。
                // ⚠ v0.1.19 防重复的唯一依据：卡片自己的 wbDlBtn 标记。
                //
                // 双按钮的根因是「同一张卡被识别两次」—— 那是 collectCards
                // 的问题，已在 v0.1.18 用顺序无关的两趟去重解决（8 组顺序测试）。
                // 注入层不再做「祖先包含」类判断：个人主页所有卡片共用一个
                // feed 容器，祖先判断会把第一张卡之外的每张都跳掉。
                if (card.dataset.wbDlBtn === '1') {
                    if (!card.querySelector(':scope > .wb-card-dl')) {
                        // 标记在但按钮没了 —— React 清过节点，清标记重挂
                        card.dataset.wbDlBtn = '0';
                    } else {
                        continue;
                    }
                }
                // ⚠ v0.1.19：删掉 v0.1.16 的「祖先里已挂按钮就跳过」判断。
                //
                // 真因（用户实测）：个人主页 6 张卡被标记增强，但只出现 1 个按钮。
                // 这条判断用 parentElement.closest(...) 往上找，而个人主页的
                // 卡片共用一个 feed 容器 —— 第一张卡挂上按钮后，
                // 后面的卡片的父节点链上都能查到那个标记，于是全被跳过。
                //
                // 也就是说：它防的不是「重复挂」，
                // 它防的是「除了第一张卡以外的每一张卡」。
                //
                // 为什么当初想加它：为了防双按钮。但 collectCards 现在已经
                // 做了顺序无关的去重（v0.1.18 两趟法 + 8 组顺序测试），
                // 双按钮的根因已经在源头解决，这道防线只剩副作用没有收益。
                //
                // 正确做法：防重复要查「祖先里是否有另一张已挂按钮的**卡片**」，
                // 不是查任意祖先。要留也得写成
                //   card.parentElement?.closest('[data-wb-dl-btn="1"]') &&
                //   其元素也是 collectCards 的候选集合之一
                // —— 那样才只挡真重复。现在直接删。
                const id = card.dataset.wbId || extractId(card);
                if (!id) { nNoId++; continue; }
                if (!cardHasMedia(card)) { nNoMedia++; continue; }

                // ⚠ v0.1.6：尺寸守卫 —— 头像容器、表情包容器也会满足上面的条件，
                // 不挡掉的话下载按钮会出现在头像旁边。
                //
                // ⚠ v0.1.11 修复「时有时无」：不能一挡就永久放弃。
                // 微博滚动加载的卡片，图片懒加载完成后 rect 会从 0 变正常，
                // 首次扫描时 rect=0 的卡片被挡下就再也不会挂按钮 —— 表现为
                // 「有的卡片有按钮、有的没有，滚动后还不出现」。
                // 修法：挡下时打标记但不设 wbDlBtn，下轮 flush 会重新检查；
                // 并且给一个宽高下限的兜底判断（0 视为未定而非太小）。
                const rect = card.getBoundingClientRect();
                if (rect.width === 0 && rect.height === 0) {
                    if (!card.dataset.wbPending) pendingCards++;
                    card.dataset.wbPending = '1';   // 还没布局好，下轮再说
                    continue;
                }
                if (rect.width < 200 || rect.height < 80) {
                    card.dataset.wbTooSmall = '1';   // 确实太小（头像/表情），永久跳过
                    nTooSmall++;
                    continue;
                }
                delete card.dataset.wbPending;

                const pos = getComputedStyle(card).position;
                if (pos === 'static') card.style.position = 'relative';

                const btn = document.createElement('button');
                btn.className = 'wb-card-dl';
                btn.type = 'button';
                btn.dataset.id = id;
                btn.textContent = '⬇ 下载';
                btn.title = '下载这条微博的所有图片/视频';
                btn.setAttribute('aria-label', '下载这条微博');

                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (btn.dataset.wbBusy === '1') return;
                    btn.dataset.wbBusy = '1';
                    btn.classList.add('wb-busy');
                    btn.textContent = '⏳ 下载中';
                    downloadWeibo(id).then((ok) => {
                        btn.dataset.wbBusy = '0';
                        btn.classList.remove('wb-busy');
                        btn.classList.add(ok ? 'wb-ok' : 'wb-fail');
                        btn.textContent = ok ? '✅ 完成' : '↻ 重试';
                    });
                });

                // ⚠ v0.1.11：新卡片注入时就要按开关决定初始状态，
                // 否则开关关着时新卡片仍会带一个可见按钮（滚动加载越多越明显）
                if (!cfg.isCardBtn || cfg.isBatch) btn.style.display = 'none';

                card.appendChild(btn);
                card.dataset.wbDlBtn = '1';
                n++;
            }
            // v0.1.21：同样把跳过原因打出来。两轮日志一对比就知道
        // 「是识别阶段没认出来」还是「识别出来了但注入阶段被挡」。
        const st = cards.filter((c) => c.dataset.wbEnhanced === '1').length;
        console.log(
            `${TAG} injectCardButtons: 候选=${cards.length} 挂载=${n} 已增强=${st} ` +
            `| 跳过 无id=${nNoId} 无媒体=${nNoMedia} 太小=${nTooSmall} 未布局=${pendingCards}`
        );
        } catch (e) {
            console.warn(`${TAG} injectCardButtons ⚠️`, e.message);
        }
    }

    /** 卡片按钮显隐（开关切换时用；已注入的不销毁，只切 display） */
    function applyCardBtnVisibility(on) {
        try {
            document.querySelectorAll('.wb-card-dl').forEach((el) => {
                // 批量模式下强制隐藏，不受此开关影响
                el.style.display = (on && !cfg.isBatch) ? '' : 'none';
            });
            console.log(`${TAG} 卡片按钮 → ${on ? '显示' : '隐藏'}`);
        } catch (e) {
            console.warn(`${TAG} applyCardBtnVisibility ⚠️`, e.message);
        }
    }

    /** 大图浏览：把缩略图 src 换成 large（§10.15：改 src 是最稳的增强） */
    function upgradeBigImages() {
        if (!cfg.isBigImage || !cfg.isEnhance) return;
        try {
            const imgs = document.querySelectorAll('img[src*="sinaimg"]');
            let n = 0;
            imgs.forEach((im) => {
                if (isAvatarImage(im.src)) return;
                if (im.dataset.wbBig === '1') return;
                const big = toLargeUrl(im.src);
                if (big && big !== im.src) {
                    im.dataset.wbOrig = im.src;
                    im.src = big;
                    im.dataset.wbBig = '1';
                    n++;
                }
            });
            if (n) console.log(`${TAG} upgradeBigImages: ${n} 张换成 large`);
        } catch (e) {
            console.warn(`${TAG} upgradeBigImages ⚠️`, e.message);
        }
    }

    /** 批量选择 */
    const picked = new Set();

    function applyBatchMode(on) {
        try {
            document.body.classList.toggle('wb-batch', !!on);
            let bar = document.querySelector('.wb-batch-bar');
            if (!on) {
                if (bar) bar.remove();
                picked.clear();
                document.querySelectorAll('.wb-card-pick').forEach((el) => el.remove());
                // 退出批量：恢复单条下载按钮
                // ⚠ v0.1.11：必须跟 isCardBtn 开关对齐。
                // 旧写法无条件 display=''，会在「开关已关」时把按钮错误地亮回来 ——
                // 这就是「显示不稳定」的来源之一：面板开关关着，退出批量后按钮又冒出来。
                applyCardBtnVisibility(cfg.isCardBtn);
                return;
            }
            // 批量模式下隐藏单条下载按钮 —— 避免误触（点了会立刻下载整条，节奏乱）
            applyCardBtnVisibility(cfg.isCardBtn);   // 函数内部已处理 isBatch 优先级
            if (bar) return;
            bar = document.createElement('div');
            bar.className = 'wb-batch-bar';
            bar.innerHTML = `
<span id="wb-pick-count">已选 0</span>
<button id="wb-pick-all">全选本页</button>
<button id="wb-pick-none">清空</button>
<button id="wb-pick-dl" class="wb-primary">下载所选</button>
<button id="wb-pick-exit">退出</button>`;
            document.body.appendChild(bar);

            bar.querySelector('#wb-pick-all').addEventListener('click', () => {
                injectPickers();
                document.querySelectorAll('.wb-card-pick').forEach((el) => {
                    if (!el.classList.contains('wb-on')) el.click();
                });
            });
            bar.querySelector('#wb-pick-none').addEventListener('click', () => {
                picked.clear();
                document.querySelectorAll('.wb-card-pick.wb-on').forEach((el) => el.click());
            });
            bar.querySelector('#wb-pick-dl').addEventListener('click', async () => {
                const ids = Array.from(picked);
                if (ids.length === 0) {
                    alert('还没选任何微博');
                    return;
                }
                console.log(`${TAG} 批量下载 ${ids.length} 条`);
                for (const id of ids) {
                    await downloadWeibo(id);
                    await sleep(600);
                }
            });
            bar.querySelector('#wb-pick-exit').addEventListener('click', () => {
                cfg.isBatch = false;
                GM_setValue(CFG_KEYS.isBatch, false);
                applyBatchMode(false);
                syncPanelToggles();
            });

            injectPickers();
        } catch (e) {
            console.warn(`${TAG} applyBatchMode ⚠️`, e.message);
        }
    }

    /** 给每张卡片左上角注入选择圈（坐标计算，不赌祖先结构） */
    function injectPickers() {
        try {
            const cards = collectCards();
            cards.forEach((card) => {
                if (card.dataset.wbPicker === '1') return;
                const pos = getComputedStyle(card).position;
                if (pos === 'static') card.style.position = 'relative';

                const id = card.dataset.wbId || extractId(card);
                if (!id) return;

                const dot = document.createElement('div');
                dot.className = 'wb-card-pick';
                dot.dataset.id = id;
                dot.textContent = picked.has(id) ? '✓' : '';
                dot.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (picked.has(id)) {
                        picked.delete(id);
                        dot.classList.remove('wb-on');
                        dot.textContent = '';
                    } else {
                        picked.add(id);
                        dot.classList.add('wb-on');
                        dot.textContent = '✓';
                    }
                    const cnt = document.querySelector('#wb-pick-count');
                    if (cnt) cnt.textContent = `已选 ${picked.size}`;
                });
                card.appendChild(dot);
                card.dataset.wbPicker = '1';
            });
        } catch (e) {
            console.warn(`${TAG} injectPickers ⚠️`, e.message);
        }
    }

    // ══════════════════════════════════════════════════════════════
    // §11  去广告（激进，但全挂总开关）
    // ══════════════════════════════════════════════════════════════

    /** 广告识别特征：文案关键词 + 结构标记 */
    const AD_TEXT_RE = /(广告|推广|赞助|商务合作|入驻|品牌合作)/;
    const AD_CLASS_RE = /(card-ad-|ad-|advert|recommend-ad|promotion)/i;

    function hideAds() {
        if (!cfg.isEnhance || !cfg.isHideAd) return;
        try {
            let n = 0;
            document.querySelectorAll('[data-v2type], section, article, div[class*="card"]').forEach((el) => {
                if (el.dataset.wbAd === '1') return;
                const cls = typeof el.className === 'string' ? el.className : '';
                const adType = get(el, 'dataset.adInfo', null) || get(el, 'dataset.promotionType', null);
                const hasAdClass = AD_CLASS_RE.test(cls);
                const hasAdType = !!adType;
                if (!hasAdClass && !hasAdType) return;
                // 别把整个 feed 干掉
                if (el.querySelectorAll('[data-v2type]').length > 3) return;
                el.style.display = 'none';
                el.dataset.wbAd = '1';
                n++;
            });

            // 文案兜底：卡片很小 + 含"广告"字样
            document.querySelectorAll('section, article').forEach((el) => {
                if (el.dataset.wbAd === '1') return;
                const text = (el.innerText || '').slice(0, 120);
                if (!AD_TEXT_RE.test(text)) return;
                if ((el.innerText || '').length > 500) return;
                el.style.display = 'none';
                el.dataset.wbAd = '1';
                n++;
            });

            if (n) console.log(`${TAG} hideAds: 隐藏 ${n} 个广告位`);
        } catch (e) {
            console.warn(`${TAG} hideAds ⚠️`, e.message);
        }
    }

    /** 藏热搜榜 / 会员浮层 */
    function hideExtras() {
        if (!cfg.isEnhance) return;
        try {
            if (cfg.isHideHot) {
                document.querySelectorAll('a[href*="/hot"], [class*="hot"] [class*="band"], [class*="HotSearch"]').forEach((el) => {
                    const t = el.closest('div, section, aside');
                    if (!t || t.dataset.wbAd === '1') return;
                    if ((el.innerText || '').length > 300) return;
                    t.style.display = 'none';
                    t.dataset.wbAd = '1';
                });
            }
            if (cfg.isHideVip) {
                document.querySelectorAll('[class*="vip"], [class*="Vip"], [class*="promo"], [class*="member"]').forEach((el) => {
                    if (el.dataset.wbAd === '1') return;
                    if ((el.innerText || '').length > 400) return;
                    el.style.display = 'none';
                    el.dataset.wbAd = '1';
                });
            }
        } catch (e) {
            console.warn(`${TAG} hideExtras ⚠️`, e.message);
        }
    }

    // ══════════════════════════════════════════════════════════════
    // §12  油猴菜单
    // ══════════════════════════════════════════════════════════════

    const MENU_DEFS = [
        { key: 'isEnable', label: '启用脚本' },
        { key: 'isEnhance', label: '启用增强（去广告/大图/批量）', after: () => applyBatchMode(cfg.isBatch) },
        { key: 'isHideAd', label: '去广告（隐藏推广位）' },
        { key: 'isHideHot', label: '隐藏热搜榜' },
        { key: 'isHideVip', label: '隐藏会员/推广浮层' },
        { key: 'isBigImage', label: '大图浏览（九宫格直接高清）' },
        { key: 'isBatch', label: '批量选择模式', after: (v) => applyBatchMode(v) },
        { key: 'isImageHD', label: '超高清图（ajax 接口，较慢）' },
        { key: 'isVideoHD', label: '超高清视频（tv 接口）' },
        { key: 'isPack', label: '打包 zip 下载' },
        { key: 'isIncludesText', label: '附带微博正文 txt' },
        { key: 'isSaveHistory', label: '面板保留历史记录' },
        { key: 'isAutoHide', label: '完成后面板自动收起' },
    ];

    const menuIds = new Map();

    function refreshMenus() {
        for (const def of MENU_DEFS) {
            const old = menuIds.get(def.key);
            if (old !== undefined) {
                try { GM_unregisterMenuCommand(old); } catch (e) { /* 已失效 */ }
            }
            const id = GM_registerMenuCommand(
                `${cfg[def.key] ? '✔️' : '❌'} ${def.label}`,
                () => {
                    cfg[def.key] = !cfg[def.key];
                    GM_setValue(CFG_KEYS[def.key], cfg[def.key]);
                    console.log(`${TAG} 菜单切换 ${def.key} → ${cfg[def.key]}`);
                    if (def.after) def.after(cfg[def.key]);
                    refreshMenus();
                    syncPanelToggles();
                    if (def.key === 'isEnable' && cfg.isEnable) boot();
                }
            );
            menuIds.set(def.key, id);
        }
    }

    function syncPanelToggles() {
        if (!panel) return;
        Object.keys(PANEL_LABELS).forEach((sel) => {
            const el = panel.querySelector(sel);
            const def = PANEL_LABELS[sel];
            if (!el || !def) return;
            el.textContent = cfg[def.key] ? def.on : def.off;
            el.classList.toggle('on', !!cfg[def.key] && !!def.big);
        });
    }

    MENU_DEFS.push({ key: 'isCardBtn', label: '卡片级下载按钮（hover 显示）' });

    GM_registerMenuCommand('🐢 落盘安全模式（全串行）', () => {
        cfg.saveBatch = 1;
        cfg.saveGap = 0;
        GM_setValue(CFG_KEYS.saveBatch, 1);
        GM_setValue(CFG_KEYS.saveGap, 0);
        if (panel) {
            const b = panel.querySelector('#wb-batch-num');
            const g = panel.querySelector('#wb-gap-num');
            if (b) b.textContent = '1';
            if (g) g.textContent = '0';
        }
        alert('已切到安全模式：落盘全串行。\n如果之前有丢文件，现在不会再丢。');
    });

    GM_registerMenuCommand('🚀 落盘极速模式（批5·间隔120ms）', () => {
        cfg.saveBatch = 5;
        cfg.saveGap = 120;
        GM_setValue(CFG_KEYS.saveBatch, 5);
        GM_setValue(CFG_KEYS.saveGap, 120);
        if (panel) {
            const b = panel.querySelector('#wb-batch-num');
            const g = panel.querySelector('#wb-gap-num');
            if (b) b.textContent = '5';
            if (g) g.textContent = '120';
        }
        alert('已切到极速模式：每批 5 个 · 间隔 120ms。\n如果发现丢文件，用安全模式退回。');
    });

    GM_registerMenuCommand('⚖️ 恢复默认（批3·间隔260ms）', () => {
        cfg.saveBatch = 3;
        cfg.saveGap = 260;
        GM_setValue(CFG_KEYS.saveBatch, 3);
        GM_setValue(CFG_KEYS.saveGap, 260);
        if (panel) {
            const b = panel.querySelector('#wb-batch-num');
            const g = panel.querySelector('#wb-gap-num');
            if (b) b.textContent = '3';
            if (g) g.textContent = '260';
        }
        alert('已恢复默认：每批 3 个 · 间隔 260ms');
    });
    GM_registerMenuCommand('🩺 卡片识别诊断', () => {
        const cards = collectCards();
        const buttonsVisible = Array.from(document.querySelectorAll('.wb-card-dl'))
            .filter((el) => getComputedStyle(el).display !== 'none'
                && getComputedStyle(el).visibility !== 'hidden'
                && parseFloat(getComputedStyle(el).opacity) > 0).length;
        const btns = document.querySelectorAll('.wb-card-dl').length;
        const enhanced = document.querySelectorAll('[data-wb-enhanced="1"]').length;
        const dlBtns = document.querySelectorAll('.wb-card-dl').length;
        const visibleBtns = Array.from(document.querySelectorAll('.wb-card-dl'))
            .filter((el) => getComputedStyle(el).display !== 'none').length;
        const pending = document.querySelectorAll('[data-wb-pending="1"]').length;
        const tooSmall = document.querySelectorAll('[data-wb-too-small="1"]').length;
        const msg = [
            `当前页面：${location.pathname.slice(0, 40)}`,
            '',
            `识别到卡片：${cards.length}`,
            `  ├ href 路（个人主页/信息流）：${DIAG.href}`,
            `  ├ 属性路（data-oid/mid）：${DIAG.attr}`,
            `  └ 媒体路（从图片/视频反查）：${DIAG.media}`,
            '',
            `页面媒体：图片 ${DIAG.imgs} / 视频 ${DIAG.videos}`,
            '',
            `已挂下载按钮（右下角）：${btns}`,
            `  └ 实际可见：${buttonsVisible}`,
            `已挂卡片按钮：${btns}`,
            `  ├ 未被开关隐藏：${visibleBtns}`,
            `  ├ 等待布局（懒加载）：${pending}`,
            `  └ 尺寸太小（头像/表情）：${tooSmall}`,
            `已增强卡片：${enhanced}`,
            '',
            `未挂入口的原因（可叠加）：`,
            `  ├ 识别不出微博 id：${SKIP.noId}`,
            `  ├ 判定为纯文字（无图无视频）：${SKIP.noMedia}`,
            `  └ 尺寸太小：${SKIP.tooSmall}`,
            '',
            enhanced === 0
                ? '诊断：一张卡片都没识别到。\n把上面的数字贴给开发者，能直接定位断点。'
                : enhanced > 0 && btns === 0
                    ? '诊断：卡片识别成功但按钮没注入 —— 多半是「卡片按钮」开关被关了'
                    : '诊断：一切正常 ✅',
        ].join('\n');
        console.log(`${TAG} 诊断\n${msg}`);
        alert(msg);
    });

    GM_registerMenuCommand(
        cfg.dlVidCover ? '🖼 视频封面：下载' : '🖼 视频封面：不下载',
        () => {
            cfg.dlVidCover = !cfg.dlVidCover;
            GM_setValue(CFG_KEYS.vidCover, cfg.dlVidCover);
            console.log(`${TAG} 视频封面 → ${cfg.dlVidCover ? '下载' : '不下载'}`);
        }
    );

    GM_registerMenuCommand(
        cfg.isVideoViaBlob ? '🎬 视频下载：Blob 路径（旧）' : '🎬 视频下载：GM_download 直落（推荐）',
        () => {
            cfg.isVideoViaBlob = !cfg.isVideoViaBlob;
            GM_setValue(CFG_KEYS.isVideoViaBlob, cfg.isVideoViaBlob);
            console.log(`${TAG} 视频下载路径 → ${cfg.isVideoViaBlob ? 'Blob 中转' : 'GM_download 直落'}`);
        }
    );

    GM_registerMenuCommand('📊 显示诊断信息', () => {
        const cards = collectCards();
        alert([
            `微博助手 v${VERSION}`,
            `页面卡片数：${cards.length}`,
            `已挂下载入口：${cards.filter((c) => c.dataset.wbEnhanced === '1').length}`,
            `下载任务：${tasks.size}`,
            `批量已选：${picked.size}`,
            `超清图：${cfg.isImageHD ? '开' : '关'}`,
            `超清视频：${cfg.isVideoHD ? '开' : '关'}`,
            `已隐藏广告：${document.querySelectorAll('[data-wb-ad="1"]').length}`,
        ].join('\n'));
    });

    GM_registerMenuCommand('🧹 清空任务记录', () => {
        tasks.clear();
        picked.clear();
        renderPanel();
    });

    GM_registerMenuCommand('📋 复制上次下载清单', () => {
        const last = GM_getValue('wb_last_result', '');
        if (!last) {
            alert('还没有下载记录');
            return;
        }
        if (typeof GM_setClipboard === 'function') {
            GM_setClipboard(last, 'text');
            alert('已复制到剪贴板');
        } else {
            console.log(`${TAG} 上次清单:\n${last}`);
        }
    });

    GM_registerMenuCommand('🏷 设置命名模板', () => {
        const help =
            `当前模板：\n${nameTemplate}\n\n` +
            `可用占位符：\n` +
            NAME_TPL_FIELDS.map((f) => `  {${f}}`).join('\n') + '\n\n' +
            `说明：\n` +
            `  #      分隔符，写不写都行，下面的模板都自带\n` +
            `  {index} 两位补零序号，单图也是 01\n` +
            `  {ext}   扩展名（不含点），livephoto 视频会加 -live 后缀\n` +
            `  取不到的占位符会显示成 x（不会静默留空）\n\n` +
            `示例：\n` +
            `  微博#{username}#{uid}#{index}.{ext}\n` +
            `  {username}-{time}-{index}\n` +
            `  {mblogid}-{index}.{ext}`;
        const next = window.prompt(help, nameTemplate);
        if (next && next.trim()) {
            nameTemplate = next.trim();
            GM_setValue(NAME_TPL_KEY, nameTemplate);
            console.log(`${TAG} 命名模板 → ${nameTemplate}`);
            alert('命名模板已保存：\n' + nameTemplate);
        }
    });

    GM_registerMenuCommand('👀 预览命名效果', () => {
        const demo = {
            userName: '示例博主',
            userID: '1234567890',
            mblogid: 'ABCdefGHI',
            time: '2026-10-15 18:30',
        };
        alert([
            '命名预览（示例数据）：',
            '',
            '  ' + renderName(demo, '01', 'jpg'),
            '  ' + renderName(demo, '02', 'jpg'),
            '  ' + renderName(demo, '01', 'mp4') + '-live',
            '',
            `当前模板：${nameTemplate}`,
            `占位符：${NAME_TPL_FIELDS.map((f) => '{' + f + '}').join(' ')}`,
        ].join('\n'));
    });

    GM_registerMenuCommand('↩️ 恢复默认命名模板', () => {
        nameTemplate = NAME_TPL_DEFAULT;
        GM_setValue(NAME_TPL_KEY, nameTemplate);
        alert('已恢复默认：\n' + nameTemplate);
    });

    // ══════════════════════════════════════════════════════════════
    // §13  启动
    // ══════════════════════════════════════════════════════════════

    let booted = false;

    function boot() {
        if (booted) return;
        booted = true;
        try {
            if (!document.body) {
                // document-idle 下 body 一定在，但保险起见兜底
                document.documentElement.appendChild(document.createElement('body'));
            }
            GM_addStyle(CSS);
            buildPanel();
            refreshMenus();

            // 恢复历史
            if (cfg.isSaveHistory) {
                const saved = GM_getValue('wb_task_history', '[]');
                try {
                    const list = JSON.parse(saved);
                    // v0.1.33：只恢复最近 HISTORY_MAX 条，
                    // 并且**按时间倒序保留**（Array.slice(-n) 取的是「最后 n 个」，
                    // 而 list 的顺序取决于上一次保存时的 Map 迭代顺序）。
                    list.slice(-HISTORY_MAX).forEach((t) => tasks.set(t.id, Object.assign({ percent: 0 }, t)));
                    renderPanel();
                } catch (e) { /* 缓存坏了就忽略 */ }
            }

            flush();
            if (cfg.isBatch) applyBatchMode(true);

            // MutationObserver：微博滚动加载新卡片
            const observer = new MutationObserver((mutations) => {
                for (const m of mutations) {
                    m.addedNodes.forEach((node) => {
                        if (node.nodeType === 1) pending.add(node);
                    });
                }
                if (pending.size > MAX_PENDING) pending.clear();
                scheduleFlush();
            });
            observer.observe(document.body, { childList: true, subtree: true });

            // 滚动时升级大图（懒加载）
            let scrollTimer = null;
            window.addEventListener('scroll', () => {
                if (scrollTimer) return;
                scrollTimer = setTimeout(() => {
                    scrollTimer = null;
                    if (cfg.isEnhance) upgradeBigImages();
                    scheduleFlush();
                }, 400);
            }, { passive: true });

            console.log(`${TAG} ✅ 启动完成 v${VERSION} 增强=${cfg.isEnhance ? '开' : '关'}`);
        } catch (e) {
            console.error(`${TAG} ❌ 启动失败`, e);
        }
    }

    // 历史持久化
    setInterval(() => {
        try {
            if (!cfg.isSaveHistory) return;
            // v0.1.33：与显示层同一上限（原先写死 20，与显示层不一致）
            GM_setValue('wb_task_history',
                JSON.stringify(Array.from(tasks.values()).slice(-HISTORY_MAX)));
        } catch (e) { /* 静默 */ }
    }, 15000);

    if (cfg.isEnable) boot();

})();
