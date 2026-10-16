// 单元验证：把脚本里的纯函数抽出来真跑
const fs = require('fs');
const src = fs.readFileSync('/opt/data/cache/scratch/wb-build/weibo-saver-v0.1.0.user.js', 'utf8');

// ── 抽 CRC32 ──
const crc32Src = src.match(/const CRC_TABLE = \(\(\) => \{[\s\S]*?\}\)\(\);[\s\S]*?function crc32\(bytes\) \{[\s\S]*?\n    \}/)[0];
eval(crc32Src);

console.log('═══ ZIP 验证 ═══');
// CRC32 已知向量
const enc = new TextEncoder();
console.log('crc32("hello") =', crc32(enc.encode('hello')).toString(16), '(期望 3610a686)');
console.log('crc32("") =', crc32(enc.encode('')).toString(16), '(期望 0)');
console.log('crc32("123456789") =', crc32(enc.encode('123456789')).toString(16), '(期望 cbf43926)');

// 抽 buildZip（含依赖 dosDateTime）
const dosSrc = src.match(/function dosDateTime\(d\) \{[\s\S]*?\n    \}/)[0];
eval(dosSrc);
const zipSrc = src.match(/function buildZip\(files\) \{[\s\S]*?\n    \}/)[0];
eval(zipSrc);
const blob = buildZip([
  { name: '张三-2026-10-15-测试.jpg', data: enc.encode('FAKE_JPEG_DATA_'.repeat(100)) },
  { name: '张三-2026-10-15-测试.mp4', data: enc.encode('FAKE_MP4_DATA_'.repeat(500)) },
]);
console.log('zip blob 类型:', blob.type);
console.log('zip blob 字节:', blob.size, '(>0 = 真生成了二进制)');
if (blob.size > 0) {
  // 校验 ZIP 魔数
  blob.arrayBuffer().then((ab) => {
    const u8 = new Uint8Array(ab);
    const sig = String.fromCharCode(u8[0], u8[1], u8[2], u8[3]);
    console.log('ZIP 魔数:', sig === 'PK' ? '✅ PK (合法 zip)' : '❌ ' + JSON.stringify(sig));
    const endSig = String.fromCharCode(u8[u8.length - 22], u8[u8.length - 21], u8[u8.length - 20], u8[u8.length - 19]);
    console.log('EOCD 魔数:', endSig === 'PK' ? '✅ 结尾完整' : '❌ ' + JSON.stringify(endSig));
    // 文件名 UTF-8 检查
    const nameIdx = u8.indexOf(0xe5); // 张
    console.log('含中文文件名:', nameIdx > 0 ? '✅ UTF-8 已写入' : '⚠️ 未找到');
  });
}

// ── m3u8 ──
console.log('\n═══ m3u8 解析验证 ═══');
const m3u8Src = src.match(/function parseM3u8\(text, baseUrl\) \{[\s\S]*?\n    \}/)[0];
eval(m3u8Src);
const manifest = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:6
#EXTINF:6.0,
seg1.ts
#EXTINF:6.0,
seg2.ts
#EXTINF:6.0,
/abs/seg3.m4s
#EXT-X-ENDLIST
#EXT-X-DISCONTINUITY
not_media.txt
`;
const segs = parseM3u8(manifest, 'https://video.weibo.com/stream/live/abc123/index.m3u8');
console.log('解析到分片:', segs.length, '(期望 3)');
segs.forEach((s, i) => console.log(`  [${i}]`, s));

// ── 命名 ──
console.log('\n═══ 命名 / 清洗验证 ═══');
const cleanSrc = src.match(/const INVALID_CHARS = \{[\s\S]*?function cleanName\(s\) \{[\s\S]*?\n    \}/)[0];
eval(cleanSrc);
const tricky = '张三/2026-10-15:12:30｜"引号"*问号?反斜杠\\零宽字符';
console.log('原始:', tricky);
console.log('清洗:', cleanName(tricky));
console.log('长度:', cleanName(tricky).length);

// ── URL 换档 ──
console.log('\n═══ 图片换档验证 ═══');
const urlSrc = src.match(/const IMAGE_SIZE_PATTERNS = \[[\s\S]*?function toLargeUrl\(url\) \{[\s\S]*?\n    \}/)[0];
eval(urlSrc);
const avatarSrc = src.match(/function isAvatarImage\(url\) \{[\s\S]*?\n    \}/)[0];
eval(avatarSrc);
[
  'https://wx1.sinaimg.cn/large/abc123.jpg',
  'https://wx2.sinaimg.cn/mw690/abc123.jpg',
  'https://wx3.sinaimg.cn/bmiddle/abc123.jpg',
  'https://wx4.sinaimg.cn/square/abc123.jpg',
  'https://wx5.sinaimg.cn/thumb300/abc123.jpg',
  'https://wx6.sinaimg.cn/crop.0.0.150.150.abc.jpg',
  'https://wx7.sinaimg.cn/avatar/abc.jpg',
].forEach((u) => console.log(' ', u.slice(24, 55).padEnd(32), '→', toLargeUrl(u)));

// ── mblog id ──
console.log('\n═══ mblog id 提取 ═══');
const idSrc = src.match(/function idFromHref\(href\) \{[\s\S]*?\n    \}/)[0];
eval(idSrc);
['https://weibo.com/1234567890/ABCdefGHI', 'https://weibo.com/2803301701/PqRstUvW', 'https://weibo.com/u/12345', 'https://example.com/a/b']
  .forEach((h) => console.log(' ', h.padEnd(45), '→', idFromHref(h)));

// ── 画质打分 ──
console.log('\n═══ 视频画质挑选 ═══');
const getSrc = src.match(/function get\(obj, path, def\) \{[\s\S]*?\n    \}/)[0];
eval(getSrc);
const pickSrc = src.match(/function pickBestVideo\(mediaInfo\) \{[\s\S]*?\n    \}/)[0];
eval(pickSrc);
console.log('  选:', String(pickBestVideo({
  playback_list: [
    { meta: { quality_index: 1 }, play_info: { url: 'low.mp4', width: 480, height: 270, bitrate: 500 } },
    { meta: { quality_index: 3 }, play_info: { url: 'high.mp4', width: 1920, height: 1080, bitrate: 5000 } },
    { meta: { quality_index: 2 }, play_info: { url: 'mid.mp4', width: 1280, height: 720, bitrate: 2000 } },
  ],
})).slice(-12));
console.log('  无 playback_list 降级:', String(pickBestVideo({ mp4_1080p_mp4: 'hd.mp4', stream_url: 'sd.mp4' })));
console.log('  空对象:', pickBestVideo({}));

setTimeout(() => process.exit(0), 500);
