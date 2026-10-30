// _trim-harness.js —— 真跑被测脚本里的 trimTasks
//
// WHY 需要这个文件：
//   v0.1.35 调试时发现，测试里**重写一份 trimTasks 实现**再断言，
//   测的是「测试自己写的实现」，不是被测脚本 —— 真 bug 照样漏。
//   （v0.1.33 的 test-v0133 就是这么写的，测出的「封顶 6」跟源码实际行为对不上。）
//   本 harness 把 userscript 的 IIFE 拆开在 Node 里真跑，
//   暴露真实的 tasks Map / trimTasks，跟浏览器里的运行路径一致。
//
// 铁律：走 _target.js 单一真源，不硬编码路径。
const fs = require('fs');
const path = require('path');
const { TARGET, read } = require('./_target.js');

const SRC = read();

let cached = null;

/** 起一个真实运行环境，返回暴露出来的 tasks 访问器 */
function boot() {
    if (cached) return cached;

    const body = SRC
        .replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/, '')
        .replace(/^\s*\/\*[\s\S]*?\*\/\s*/, '')
        .replace(/\(function \(\) \{/, '')
        .replace(/\}\)\(\);\s*$/, '');

    const probe = `
;globalThis.__probe = {
    size: () => tasks.size,
    ids: () => Array.from(tasks.keys()),
    reset: () => tasks.clear(),
    set: (id, msg) => { tasks.set(id, { id, title: id, message: msg, percent: 0 }); },
    trim: () => trimTasks(),
    MSG: MSG,
};
`;
    const WB = new Function('GM_getValue', 'GM_setValue', 'GM_addStyle', 'GM_registerMenuCommand',
        'GM_unregisterMenuCommand', 'GM_xmlhttpRequest', 'GM_download', 'alert', 'window',
        'document', 'navigator', 'location', 'MutationObserver', 'setTimeout', 'clearTimeout',
        'setInterval', 'clearInterval', 'requestIdleCallback', 'fetch', 'URL', 'Blob', 'TextEncoder',
        body + probe + '\n;return globalThis.__probe;');

    const store = {};
    const el = () => ({
        style: {}, appendChild() {}, setAttribute() {}, addEventListener() {},
        classList: { add() {}, remove() {}, toggle() {} },
        querySelectorAll: () => [], querySelector: () => null,
    });

    const WB2 = WB(
        (k, d) => (k in store ? store[k] : d),
        (k, v) => { store[k] = v; },
        () => {}, () => 0, () => {}, () => {}, () => {}, () => {},
        { prompt: () => null }, {},
        {
            querySelectorAll: () => [], querySelector: () => null, createElement: el,
            body: el(), documentElement: el(), head: el(), addEventListener() {},
        },
        { userAgent: 'node' },
        { href: 'https://weibo.com/' },
        class { observe() {} disconnect() {} },
        (f, t) => setTimeout(f, t), clearTimeout,
        (f, t) => setInterval(f, t), clearInterval,
        (f) => setTimeout(f, 0),
        () => Promise.resolve({}), URL, Blob, TextEncoder
    );

    cached = WB2;
    return WB2;
}

/**
 * 真跑 trimTasks
 * @param {Object} tasksObj  形如 { 'id': { id, message } }
 * @returns {{ kept: Array, removed: number }}
 */
function runTrim(tasksObj) {
    const p = boot();
    p.reset();
    for (const [id, t] of Object.entries(tasksObj)) {
        p.set(id, t.message);
    }
    const before = p.size();
    p.trim();
    const after = p.size();
    const keptIds = p.ids();
    const kept = Object.entries(tasksObj)
        .filter(([id]) => keptIds.includes(id))
        .map(([, t]) => t);
    return { kept, removed: before - after, MSG: p.MSG };
}

module.exports = { boot, runTrim, TARGET };
