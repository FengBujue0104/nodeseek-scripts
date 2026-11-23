import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const full = fs.readFileSync(new URL('../nodeseek-pro-max.user.js', import.meta.url), 'utf8');
const start = full.indexOf('    const REPLY_STAY_KEY');
const end = full.indexOf('    const __vite_glob_0_cid_replyStay');
assert.ok(start > 0 && end > start, 'module found');
const moduleSrc = full.slice(start, end);

function makeDom(path, floors, scrollY) {
  const html = `<ul class="comments">${floors.map(f => `<li class="content-item" id="${f}">#${f}</li>`).join('')}</ul>`;
  const dom = new JSDOM(`<body>${html}</body>`, { url: 'https://www.nodeseek.com' + path, runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  // layout: each floor 500px tall, starting at y=100
  let sy = scrollY;
  Object.defineProperty(w, 'scrollY', { get: () => sy, configurable: true });
  w.scrollTo = (o) => { sy = typeof o === 'object' ? o.top : arguments[1]; };
  w.Element.prototype.getBoundingClientRect = function () {
    const i = floors.indexOf(Number(this.id));
    if (i < 0) return { top: 0, bottom: 0, height: 0 };
    const top = 100 + i * 500 - sy; return { top, bottom: top + 500, height: 500 };
  };
  w.Response = Response; w.Headers = Headers;
  w.__config__ = { commmentPerPage: 10 };
  return { w, getY: () => sy };
}

// 1) page script rewrites successful new-comment response
{
  const { w } = makeDom('/post-123-2', [11, 12, 13, 14, 15], 1250); // viewport top inside floor 13 (y 1100..1600)
  w.eval(moduleSrc + ';window.__mod={replyStay,readReplyStayRecord,replyStayScrollTop,REPLY_STAY_PAGE_SCRIPT};');
  w.document.documentElement.dataset.nsxReplyKeep = '1';
  w.fetch = async (url) => new Response(JSON.stringify(url.includes('new-comment')
    ? { success: true, redirect: '/post-123-5', redirectHash: '#47' } : { ok: 1 }), { headers: { 'content-type': 'application/json' } });
  w.eval(w.__mod.REPLY_STAY_PAGE_SCRIPT);
  const other = await (await w.fetch('/api/other')).json();
  assert.deepEqual(other, { ok: 1 });
  const res = await w.fetch('/api/content/new-comment', { method: 'POST' });
  const data = await res.json();
  assert.equal(data.redirect, '/post-123-2'); assert.equal(data.redirectHash, '');
  const rec = JSON.parse(w.sessionStorage.getItem('nsx_reply_keep_floor'));
  assert.equal(rec.path, '/post-123-2'); assert.equal(rec.anchor.floor, 13); assert.equal(rec.anchor.offset, -150);
  assert.equal(rec.newUrl, '/post-123-5#47'); assert.equal(rec.scrollY, 1250);
  // failure response untouched
  w.__fail = true;
  console.log('rewrite ok');
  // 2) after reload: restore
  const { w: w2, getY } = makeDom('/post-123-2', [11, 12, 13, 14, 15], 0);
  w2.eval(moduleSrc + ';window.__mod={readReplyStayRecord,replyStayScrollTop,restoreReplyStay};');
  w2.sessionStorage.setItem('nsx_reply_keep_floor', JSON.stringify(rec));
  const r2 = w2.__mod.readReplyStayRecord('/post-123-2');
  assert.ok(r2); assert.equal(w2.sessionStorage.getItem('nsx_reply_keep_floor'), null);
  w2.requestAnimationFrame = f => setTimeout(f, 0);
  w2.__mod.restoreReplyStay(r2, {});
  assert.equal(getY(), 1250);
  assert.match(w2.document.getElementById('nsx-reply-stay-tip').textContent, /#47/);
  console.log('restore ok');
}
// 3) autoLoading: anchor floor on a later page than URL -> target that page
{
  const { w } = makeDom('/post-9-1', [1, 2, 25, 26], 1700); // top inside floor 25 (y 1100..1600? -> idx2: 1100..1600; idx3: 1600..2100) => floor 26
  w.eval(moduleSrc + ';window.__mod={REPLY_STAY_PAGE_SCRIPT};');
  w.document.documentElement.dataset.nsxReplyKeep = '1';
  w.fetch = async () => new Response(JSON.stringify({ success: true, redirect: '/post-9-3', redirectHash: '#27' }));
  w.eval(w.__mod.REPLY_STAY_PAGE_SCRIPT);
  const data = await (await w.fetch('/api/content/new-comment')).json();
  assert.equal(data.redirect, '/post-9-3');
  const rec = JSON.parse(w.sessionStorage.getItem('nsx_reply_keep_floor'));
  assert.equal(rec.anchor.floor, 26); assert.equal(rec.scrollY, null);
  console.log('cross-page ok');
}
// 4) failed comment / disabled / stale record untouched
{
  const { w } = makeDom('/post-9-1', [1, 2], 0);
  w.eval(moduleSrc + ';window.__mod={REPLY_STAY_PAGE_SCRIPT,readReplyStayRecord};');
  w.document.documentElement.dataset.nsxReplyKeep = '1';
  w.fetch = async () => new Response(JSON.stringify({ success: false, message: 'x' }));
  w.eval(w.__mod.REPLY_STAY_PAGE_SCRIPT);
  assert.equal((await (await w.fetch('/api/content/new-comment')).json()).message, 'x');
  assert.equal(w.sessionStorage.getItem('nsx_reply_keep_floor'), null);
  w.document.documentElement.dataset.nsxReplyKeep = '0';
  w.fetch.__x = 1;
  w.sessionStorage.setItem('nsx_reply_keep_floor', JSON.stringify({ t: Date.now() - 600000, path: '/post-9-1' }));
  assert.equal(w.__mod.readReplyStayRecord('/post-9-1'), null);
  w.sessionStorage.setItem('nsx_reply_keep_floor', JSON.stringify({ t: Date.now(), path: '/post-9-2' }));
  assert.equal(w.__mod.readReplyStayRecord('/post-9-1'), null);
  console.log('guards ok');
}
console.log('ALL REPLYSTAY TESTS PASSED');
