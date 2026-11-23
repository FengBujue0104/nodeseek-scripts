import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const src = fs.readFileSync(new URL('../nodeseek-hotlist.user.js', import.meta.url), 'utf8');
const b64 = o => Buffer.from(JSON.stringify(o), 'utf8').toString('base64');
const page = cfg => `<html><body><script id="temp-script" type="application/json">${b64(cfg)}</script></body></html>`;

async function run({ user, postRanks, notFound = [], cf = [], domLock = {}, total = 15 }) {
  const dom = new JSDOM(`<div><div class="nsk-panel quick-access"></div>
    <ul>${Object.entries(domLock).map(([id, r]) => `<li class="post-list-item"><div class="post-title"><a href="/post-${id}-1">t</a> <span><svg><use href="#lock"></use></svg>${r} </span></div></li>`).join('')}</ul></div>`,
    { url: 'https://www.nodeseek.com/', runScripts: 'outside-only' });
  const w = dom.window;
  const fetched = [];
  w.__config__ = { pageType: 'home', user };
  w.__NSHOT_TEST__ = {};
  w.GM_addStyle = () => {};
  w.fetch = async (url) => {
    url = String(url);
    if (url.startsWith('https://api.bimg.eu.org/')) {
      const posts = Array.from({ length: total }, (_, i) => ({ post: { id: i + 1, title: 'P' + (i + 1), author: 'a' + (i + 1), author_id: 100 + i + 1, views: 1, comments: 1 }, score: 100 - i }));
      return new w.Response(JSON.stringify({ updated_at: Date.now() / 1000, posts }), { status: 200 });
    }
    if (url === '/api/block-list/list') return new w.Response(JSON.stringify({ success: true, data: [{ block_member_id: 102, block_member_name: 'a2' }] }), { status: 200 });
    const m = /^\/post-(\d+)-1$/.exec(url);
    if (m) {
      const id = Number(m[1]); fetched.push(id);
      if (notFound.includes(id)) return new w.Response(page({ pageType: 'error', user: null }), { status: 404 });
      if (cf.includes(id)) return new w.Response('<html>Just a moment...</html>', { status: 403 });
      return new w.Response(page({ pageType: 'post', user, postData: { postId: id, rank: postRanks[id] ?? 0 } }), { status: 200 });
    }
    throw new Error('unexpected ' + url);
  };
  w.Response = globalThis.Response;
  w.TextDecoder = globalThis.TextDecoder;
  w.AbortController = globalThis.AbortController;
  w.eval(src);
  await new Promise(r => setTimeout(r, 800));
  const titles = () => [...w.document.querySelectorAll('#hot-list-ul li')].map(li => ({ t: li.querySelector('.hot-post-title').textContent, hid: li.classList.contains('hot-item-hidden'), n: li.querySelector('.hot-rank-num').textContent }));
  return { w, fetched, titles };
}

// logged in Lv.2
{
  const r = await run({ user: { member_id: 9, rank: 2 }, postRanks: { 4: 5, 7: 2 }, notFound: [1], cf: [5], domLock: { 3: 3 } });
  const vis = r.titles().filter(x => !x.hid).map(x => x.t);
  assert.deepEqual(vis, ['P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11', 'P12', 'P13', 'P14']);
  assert.deepEqual(r.titles().map(x => x.n).slice(0, 3), ['1', '2', '3']);
  assert.ok(!r.fetched.includes(3), 'DOM lock reused, no fetch');
  assert.ok(!r.fetched.includes(2), 'blocked author not fetched');
  const api = r.w.__NSHOT_TEST__.api;
  assert.match(r.w.document.getElementById('hot-last-update').title, /当前等级 Lv\.2/);
  assert.match(r.w.document.getElementById('hot-last-update').title, /已私有\/不可见 1，等级限制 2/);
  // expand -> remaining checked
  r.w.document.getElementById('hot-toggle-container').click();
  await new Promise(res => setTimeout(res, 500));
  assert.ok(r.fetched.includes(15));
  assert.equal(r.titles().filter(x => x.hid).length, 0);
  console.log('logged-in ok; fetched', r.fetched.join(','));
}
// logged out => Lv.0
{
  const r = await run({ user: null, postRanks: { 6: 1 } });
  const vis = r.titles().filter(x => !x.hid).map(x => x.t);
  assert.ok(!vis.includes('P6') && !vis.includes('P2'));
  assert.equal(vis.length, 10);
  console.log('logged-out ok');
}
// pure classifier
{
  const r = await run({ user: null, postRanks: {}, total: 1 });
  const c0 = r.w.__NSHOT_TEST__.api.classifyPostResponse; const c = (...a) => { const v = c0(...a); return v === null ? null : JSON.parse(JSON.stringify(v)); };
  assert.deepEqual(c(404, '', 0), { s: 'hide', why: 'unavailable' });
  assert.equal(c(403, '<html>cf</html>', 0), null);
  assert.equal(c(500, '', 0), null);
  assert.equal(c(429, page({ pageType: 'error' }), 0), null);
  assert.equal(c(200, '<html></html>', 0), null);
  assert.deepEqual(c(200, page({ pageType: 'post', postData: { rank: 3 } }), null), { s: 'ok', rank: 3 });
  assert.deepEqual(c(200, page({ pageType: 'post', postData: { rank: 3, title: '中文' } }), 2), { s: 'hide', why: 'level', rank: 3 });
  assert.deepEqual(c(403, page({ pageType: 'error' }), 2), { s: 'hide', why: 'unavailable' });
  console.log('classifier ok');
}
console.log('ALL HOTLIST TESTS PASSED');
// real NodeSeek HTML fixtures (fetched 2026-11-22)
{
  const r = await run({ user: null, postRanks: {}, total: 1 });
  const api = r.w.__NSHOT_TEST__.api;
  const ok = fs.readFileSync(new URL('./fixtures/post-ok.html', import.meta.url), 'utf8');
  const nf = fs.readFileSync(new URL('./fixtures/post-404.html', import.meta.url), 'utf8');
  const cfg = api.parseConfigFromHtml(ok);
  assert.equal(cfg.pageType, 'post'); assert.equal(cfg.postData.title, '去香港有啥必做的事儿吗');
  assert.equal(JSON.stringify(api.classifyPostResponse(200, ok, 0)), JSON.stringify({ s: 'ok', rank: 0 }));
  assert.equal(api.parseConfigFromHtml(nf).pageType, 'error');
  assert.equal(api.classifyPostResponse(200, nf, 0).why, 'unavailable');
  console.log('real fixtures ok');
}
