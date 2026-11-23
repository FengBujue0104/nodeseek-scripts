import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const full = fs.readFileSync(new URL('../nodeseek-pro-max.user.js', import.meta.url), 'utf8');
const start = full.indexOf('        const postPreview = {');
const end = full.indexOf('        define(postPreview);');
assert.ok(start > 0 && end > start, 'postPreview module found');
const moduleSrc = full.slice(start, end);
const b64 = o => Buffer.from(JSON.stringify(o), 'utf8').toString('base64');

// 帖子页：楼层 0 正文 + 热评(4) 置顶 + 1..5 楼；comments 数组顺序与真实页面一致（含 0 楼）
const people = { 1: [11, 'alice'], 2: [12, 'BadGuy'], 3: [13, 'carol'], 4: [14, 'dave'], 5: [15, 'eve'] };
const domOrder = [4, 1, 2, 3, 5];
function postHtml({ blockedFlag = [] } = {}) {
  const li = f => `<li data-comment-id="${100 + f}" id="${f}" class="content-item"><div class="nsk-content-meta-info"><div class="avatar-wrapper"><a title="${people[f][1]}" href="/space/${people[f][0]}"><img src="/avatar/${people[f][0]}.png"></a></div><div><div class="author-info"><a href="/space/${people[f][0]}" class="author-name">${people[f][1]}</a></div></div><div class="floor-link-wrapper"><a href="#${f}" class="floor-link">#${f}</a></div></div><article class="post-content"><p>comment-${f}</p></article></li>`;
  const cfg = { pageType: 'post', postData: { postId: 7, rank: 0, comments: [{ floorIndex: 0, poster: { uid: 99, name: 'op' }, blocked: false }, ...domOrder.map(f => ({ floorIndex: f, poster: { uid: people[f][0], name: people[f][1] }, blocked: blockedFlag.includes(f) }))] } };
  return `<html><body><div class="nsk-post"><div id="0" class="content-item"><article class="post-content"><p>main</p></article></div></div><div class="comment-container"><ul class="comments">${domOrder.map(li).join('')}</ul></div><script id="temp-script" type="application/json">${b64(cfg)}</script></body></html>`;
}

async function run({ blockList, local = null, relCfg = {}, blockedFlag = [], blockStatus = 200 }) {
  const dom = new JSDOM(`<ul class="post-list"><li class="post-list-item"><div class="post-list-content"><div class="post-title"><a href="/post-7-1">T</a></div></div></li></ul>`, { url: 'https://www.nodeseek.com/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  let blockCalls = 0;
  w.fetch = async (url, opts) => {
    url = String(url);
    if (url === '/api/block-list/list') {
      blockCalls++;
      assert.equal(opts.credentials, 'include');
      if (blockStatus !== 200) return new w.Response('err', { status: blockStatus });
      return new w.Response(JSON.stringify({ success: true, data: blockList }), { status: 200 });
    }
    if (url.endsWith('/post-7-1')) { const r = new w.Response(postHtml({ blockedFlag }), { status: 200 }); Object.defineProperty(r, 'url', { value: url }); return r; }
    throw new Error('unexpected ' + url);
  };
  w.Response = Response; w.TextDecoder = TextDecoder;
  if (local) w.localStorage.setItem('nsx_advanced_blacklist', JSON.stringify(local));
  const store = { 'post_preview.enabled': true, 'relation.blacklist_enabled': true, 'relation.blacklist_mode': 'fold', ...relCfg };
  w.__ctx = { isPost: false, store: { get: (k, d) => (k in store ? store[k] : d) } };
  w.eval(`(function(){const addStyle=()=>{};let mod;const define=m=>{mod=m};${moduleSrc};window.__mod=postPreview;})()`);
  w.__mod.init(w.__ctx);
  const open = async () => {
    w.document.querySelector('.nsx-preview-toggle').click();
    for (let i = 0; i < 50 && !/本页|已加载/.test(w.document.querySelector('.nsx-preview-status').textContent); i++) await new Promise(r => setTimeout(r, 20));
  };
  await open();
  const shown = () => [...w.document.querySelectorAll('.nsx-preview-entry')].map(e => e.textContent.replace(/\s+/g, ' ').trim());
  return { w, shown, status: () => w.document.querySelector('.nsx-preview-status').textContent, blockCalls: () => blockCalls, open };
}
const comments = r => r.shown().filter(t => /comment-/.test(t)).map(t => t.match(/comment-(\d+)/)[1]);

{ // 官方黑名单：按 id 命中 bob(12)，按名字命中 eve（不区分大小写）
  const r = await run({ blockList: [{ block_member_id: 12, block_member_name: 'x' }, { block_member_id: 999, block_member_name: 'EVE' }] });
  assert.deepEqual(comments(r), ['4', '1', '3']);
  assert.ok(r.shown()[0].includes('main'), 'main post kept');
  assert.match(r.status(), /(本页|已加载) 5 条评论（已隐藏黑名单 2 条）/);
  assert.ok(r.shown().some(t => t.includes('dave · #4')), 'floor label kept');
  // 60 秒内再次打开不重复请求
  r.w.document.querySelector('.nsx-preview-toggle').click();
  await r.open();
  assert.equal(r.blockCalls(), 1);
  console.log('official blocklist ok');
}
{ // 接口失败：不隐藏
  const r = await run({ blockList: [], blockStatus: 500 });
  assert.deepEqual(comments(r), ['4', '1', '2', '3', '5']);
  assert.match(r.status(), /(本页|已加载) 5 条评论$/);
  console.log('failure no-hide ok');
}
{ // 页面数据 blocked 标记（按楼层对齐，不受热评置顶影响）
  const r = await run({ blockList: [], blockedFlag: [3] });
  assert.deepEqual(comments(r), ['4', '1', '2', '5']);
  console.log('postData.blocked ok');
}
{ // 本地高级黑名单：fold/official 隐藏，mark 不隐藏；按 userId 也能命中；关闭开关则不用
  const local = { carol: { mode: 'official' }, dave: { mode: 'mark' }, renamed: { userId: 11 } };
  const r = await run({ blockList: [], local });
  assert.deepEqual(comments(r), ['4', '2', '5']);
  const r2 = await run({ blockList: [], local, relCfg: { 'relation.blacklist_enabled': false } });
  assert.deepEqual(comments(r2), ['4', '1', '2', '3', '5']);
  const r3 = await run({ blockList: [], local: { alice: {} }, relCfg: { 'relation.blacklist_mode': 'mark' } });
  assert.deepEqual(comments(r3), ['4', '1', '2', '3', '5'], 'global mark mode does not hide');
  console.log('local blacklist ok');
}
console.log('ALL PREVIEW BLACKLIST TESTS PASSED');
