// ★ 被测目标单一真源（2026-10-17 立）
// 背景：31 个测试曾硬编码 '/opt/data/cache/scratch/wb-build/weibo-saver-v0.1.0.user.js'
//   —— 那是 v0.1.0 的临时快照（scratch 24h 就清）。测试靶子从 v0.1.0 迭代到
//   v0.1.33 期间一直没换过，导致「30 套通过」对当前版本零覆盖。
// 修法：所有测试 require 本文件取路径，发版时不用改 34 个文件。

const fs = require('fs');
const path = require('path');

const SRC_DIR = __dirname;

// src/ 下最新的 weibo-saver-v*.user.js —— 按版本号排序取最大，不用手改版本号
function currentTarget() {
    const files = fs.readdirSync(SRC_DIR)
        .filter(f => /^weibo-saver-v\d+\.\d+\.\d+\.user\.js$/.test(f));
    if (files.length === 0) throw new Error('src/ 下找不到 weibo-saver-v*.user.js');
    files.sort((a, b) => {
        const va = a.match(/v(\d+)\.(\d+)\.(\d+)/).slice(1).map(Number);
        const vb = b.match(/v(\d+)\.(\d+)\.(\d+)/).slice(1).map(Number);
        for (let i = 0; i < 3; i++) if (va[i] !== vb[i]) return vb[i] - va[i];
        return 0;
    });
    return path.join(SRC_DIR, files[0]);
}

const TARGET = currentTarget();

module.exports = {
    TARGET,
    FILE: path.basename(TARGET),
    VERSION: path.basename(TARGET).match(/v(\d+\.\d+\.\d+)/)[1],
    read: () => fs.readFileSync(TARGET, 'utf8'),
    // 剥掉注释行得到纯代码（多数断言要在 codeOnly 上匹配，避免注释里的旧代码误命中）
    codeOnly: () => fs.readFileSync(TARGET, 'utf8')
        .split('\n')
        .filter(l => !/^\s*(\*|\/\/|\/\*)/.test(l))
        .join('\n'),
};
