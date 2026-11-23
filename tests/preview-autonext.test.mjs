import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const full = fs.readFileSync(new URL('../nodeseek-pro-max.user.js', import.meta.url), 'utf8');
const start = full.indexOf('        const postPreview = {');
const end = full.indexOf('        define(postPreview);');
assert.ok(start > 0 && end > start, 'postPreview module found');
const moduleSrc = full.slice(start, end);
const b64 = o => Buffer.from(JSON.stringify(o), 'utf8').toString('base64');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 3 页；第 2 页开头重复出现第 1 页的 #2（模拟热评重复），BadGuy(id 66) 在第 2、3 页各有一条
const PAGES = { 1: [1, 2, 3], 2: [2, 4, 5, 6], 3: [7, 8, 9] };
const BAD = new Set([5, 8]);
const user = f => BAD.has(f) ? [66, 'BadGuy'] : [100 + f, 'u' + f];
function pageHtml(p, { total = 3 } = {}) {
  const li = f => `<li id="${f}" class="content-item"><div class="avatar-wrapper"><a href="/space/${user(f)[0]}"><img></a></div><a href="/space/${user(f)[0]}" class="author-name">${user(f)[1]}</a><a href="#${f}" class="floor-link">#${f}</a><article class="post-content"><p>c${f}</p></article></li>`;
  const cfg = { pageType: 'post', postData: { postId: 7, postPage: p, postPageCount: total, comments: (p === 1 ? [{ floorIndex: 0, poster: { uid: 1, name: 'op' } }] : []).concat(PAGES[p].map(f => ({ floorIndex: f, poster: { uid: user(f)[0], name: user(f)[1] }, blocked: false }))) } };
  const main = p === 1 ? `<div class="nsk-post"><div id="0" class="content-item"><article class="post-content"><p>MAIN</p></article></div></div>` : '';
  const next = p < total ? `<a href="/post-7-${p + 1}" class="pager-next">next</a>` : `<span class="pager-next" aria-disabled="true"></span>`;
  return `<html><body>${main}<div class="nsk-pager post-top-pager">${next}</div><ul class="comments">${PAGES[p].map(li).join('')}</ul><script id="temp-script">${b64(cfg)}</script></body></html>`;
}

async function setup({ store: extra = {}, gate = {}, failOnce = new Set() } = {}) {
  const dom = new JSDOM(`<ul class="post-list"><li class="post-list-item"><div class="post-list-content"><div class="post-title"><a href="/post-7-1">T</a></div></div></li></ul>`, { url: 'https://www.nodeseek.com/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const calls = {};
  w.fetch = async (url) => {
    url = String(url);
    if (url === '/api/block-list/list') return new w.Response(JSON.stringify({ success: true, data: [{ block_member_id: 66, block_member_name: 'BadGuy' }] }));
    const m = /\/post-7-(\d+)$/.exec(url);
    if (!m) throw new Error('unexpected ' + url);
    const p = Number(m[1]); calls[p] = (calls[p] || 0) + 1;
    if (gate[p]) await gate[p].promise;
    if (failOnce.has(p)) { failOnce.delete(p); return new w.Response('boom', { status: 502 }); }
    const r = new w.Response(pageHtml(p)); Object.defineProperty(r, 'url', { value: url }); return r;
  };
  w.Response = Response; w.TextDecoder = TextDecoder;
  const store = { 'post_preview.enabled': true, 'relation.blacklist_enabled': true, ...extra };
  w.__ctx = { isPost: false, store: { get: (k, d) => (k in store ? store[k] : d) } };
  w.eval(`(function(){const addStyle=()=>{};const define=()=>{};${moduleSrc};window.__mod=postPreview;})()`);
  w.__mod.init(w.__ctx);
  const body = w.document.querySelector('.nsx-preview-body');
  let near = false;
  Object.defineProperty(body, 'scrollHeight', { get: () => near ? 600 : 10000 });
  Object.defineProperty(body, 'clientHeight', { get: () => 500 });
  const q = s => w.document.querySelector(s);
  const t = {
    w, calls, body,
    setNear(v) { near = v; },
    scroll() { body.dispatchEvent(new w.Event('scroll')); },
    toggle() { q('.nsx-preview-toggle').click(); },
    status: () => q('.nsx-preview-status').textContent,
    tip: () => q('.nsx-preview-autonext')?.textContent ?? null,
    floors: () => [...w.document.querySelectorAll('.nsx-preview-entry')].map(e => (e.textContent.match(/c(\d+)$/) || e.textContent.match(/MAIN/))[0]),
    async until(fn, ms = 1500) { for (let i = 0; i < ms / 10; i++) { if (fn()) return; await sleep(10); } throw new Error('timeout: ' + fn); }
  };
  return t;
}
const deferred = () => { let resolve; const promise = new Promise(r => (resolve = r)); return { promise, resolve }; };

{ // 追加下一页、去重、黑名单跨页、防重入、失败重试、最后一页停止
  const gate = { 2: deferred() };
  const t = await setup({ gate, failOnce: new Set([3]) });
  t.toggle();
  await t.until(() => /已加载/.test(t.status()));
  assert.deepEqual(t.floors(), ['MAIN', 'c1', 'c2', 'c3']);
  assert.equal(t.status(), '第 1 页 / 共 3 页 · 已加载 3 条评论');
  assert.equal(t.tip(), '继续下滑自动加载第 2 页');
  await sleep(30); assert.equal(t.calls[2], undefined, 'far from bottom: no auto load');
  t.setNear(true); t.scroll(); t.scroll(); t.scroll();
  await sleep(30);
  assert.equal(t.calls[2], 1, 'reentry guarded: one fetch for page 2');
  assert.equal(t.tip(), '正在加载第 2 页…');
  gate[2].resolve();
  await t.until(() => /第 3 页加载失败/.test(t.tip() || ''));
  assert.deepEqual(t.floors(), ['MAIN', 'c1', 'c2', 'c3', 'c4', 'c6'], 'page 2 appended, dup #2 skipped, BadGuy #5 hidden, MAIN once');
  assert.match(t.status(), /第 1–2 页 \/ 共 3 页 · 已加载 6 条评论（已隐藏黑名单 1 条）/);
  assert.equal(t.calls[3], 1);
  t.scroll(); t.scroll(); await sleep(30);
  assert.equal(t.calls[3], 1, 'after failure no auto retry on scroll');
  const retry = [...t.w.document.querySelectorAll('.nsx-preview-autonext button')].find(b => b.textContent === '重试');
  assert.ok(retry, 'retry button shown');
  retry.click();
  await t.until(() => t.tip() === '已到最后一页');
  assert.equal(t.calls[3], 2);
  assert.deepEqual(t.floors(), ['MAIN', 'c1', 'c2', 'c3', 'c4', 'c6', 'c7', 'c9']);
  assert.equal(t.status(), '第 1–3 页 / 共 3 页 · 已加载 9 条评论（已隐藏黑名单 2 条）');
  t.scroll(); await sleep(30);
  assert.equal(t.calls[4], undefined, 'stops at last page');
  // 手动翻页仍可用：点页码 2 → 整页替换为第 2 页
  const btn2 = [...t.w.document.querySelectorAll('.nsx-preview-nav:not(.nsx-preview-autonext) button')].find(b => b.textContent === '1');
  assert.ok(btn2, 'manual page buttons kept');
  t.setNear(false);
  [...t.w.document.querySelectorAll('.nsx-preview-nav:not(.nsx-preview-autonext) button')].find(b => b.textContent === '上一页').click();
  await t.until(() => /^第 2 页/.test(t.status()));
  assert.deepEqual(t.floors(), ['c2', 'c4', 'c6']);
  assert.equal(t.status(), '第 2 页 / 共 3 页 · 已加载 4 条评论（已隐藏黑名单 1 条）');
  assert.equal(t.tip(), '继续下滑自动加载第 3 页');
  console.log('append/dedupe/blacklist/reentry/retry/last-page/manual ok');
}
{ // 关闭预览时停止；重新打开后可继续
  const gate = { 2: deferred() };
  const t = await setup({ gate });
  t.toggle();
  await t.until(() => /已加载/.test(t.status()));
  t.setNear(true); t.scroll();
  await sleep(20); assert.equal(t.calls[2], 1);
  t.toggle(); // close
  gate[2].resolve(); await sleep(50);
  assert.deepEqual(t.floors(), ['MAIN', 'c1', 'c2', 'c3'], 'closed: nothing appended');
  t.scroll(); await sleep(20);
  assert.equal(t.calls[2], 1, 'closed: no further loads');
  t.toggle(); // reopen (already loaded, no reload)
  assert.equal(t.tip(), '继续下滑自动加载第 2 页');
  t.scroll();
  await t.until(() => t.tip() === '已到最后一页');
  assert.equal(t.calls[1], 1); assert.equal(t.calls[2], 2); assert.equal(t.calls[3], 1);
  console.log('close stops / reopen resumes ok');
}
{ // 关闭子开关：不自动翻页，状态栏保持原样
  const t = await setup({ store: { 'post_preview.auto_next': false } });
  t.toggle();
  await t.until(() => /本页/.test(t.status()));
  t.setNear(true); t.scroll(); await sleep(30);
  assert.equal(t.calls[2], undefined);
  assert.equal(t.tip(), null);
  assert.equal(t.status(), '第 1 页 · 本页 3 条评论');
  console.log('auto_next off ok');
}
console.log('ALL PREVIEW AUTONEXT TESTS PASSED');
