import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const full = fs.readFileSync(new URL('../nodeseek-pro-max.user.js', import.meta.url), 'utf8');
const start = full.indexOf('    function nsxAdjustUnread(');
const end = full.indexOf('    const __vite_glob_0_cid_notifyBlock');
assert.ok(start > 0 && end > start, 'notifyBlock module found');
const moduleSrc = full.slice(start, end);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BroadcastSrc = `class Broadcast { static ins = new Map(); constructor(n){ if (Broadcast.ins.has(n)) return Broadcast.ins.get(n); this.recv=[]; Broadcast.ins.set(n,this);} on(f){this.recv.push(f);} send(data){ const m={sender:'x',data}; this.recv.forEach(f=>f(m)); } }`;

const DATA = {
  atMe: [{ id: 1, commenter_id: 66, commenter_name: 'Bad', viewed: false }, { id: 2, commenter_id: 7, commenter_name: 'good', viewed: false }, { id: 3, commenter_id: 66, commenter_name: 'Bad', viewed: true }],
  reply: [{ id: 4, commenter_id: 8, commenter_name: 'r', viewed: false }],
  message: [{ sender_id: 66, receiver_id: 1, sender_name: 'Bad', receiver_name: 'me', viewed: false, max_id: 1 }, { sender_id: 1, receiver_id: 9, sender_name: 'me', receiver_name: 'friend', viewed: true, max_id: 2 }],
};
async function setup({ counts, path = '/', blockFail = false, enabled = true, local = null, html = '' } = {}) {
  const dom = new JSDOM(`<body>${html}</body>`, { url: 'https://www.nodeseek.com' + path, runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const calls = [];
  const rawFetch = async (url) => {
    url = String(url); calls.push(url);
    const J = o => new w.Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
    if (url === '/api/block-list/list') return blockFail ? new w.Response('x', { status: 500 }) : J({ success: true, data: [{ block_member_id: 66, block_member_name: 'Bad' }] });
    if (url === '/api/notification/at-me/list') return J({ success: true, data: DATA.atMe });
    if (url === '/api/notification/reply-to-me/list') return J({ success: true, data: DATA.reply });
    if (url === '/api/notification/message/list') return J({ success: true, msgArray: DATA.message });
    if (url === '/api/notification/unread-count') return J({ success: true, unreadCount: { ...counts } });
    return J({ success: true, other: 1 });
  };
  w.fetch = rawFetch;
  w.Response = Response; w.Headers = Headers;
  if (local) w.localStorage.setItem('nsx_advanced_blacklist', JSON.stringify(local));
  w.__config__ = { user: { member_id: 1, member_name: 'me', unViewedCount: { ...counts } } };
  w.meCard = { user: { unViewedCount: { ...counts } } };
  const store = { 'notify_block.enabled': enabled, 'relation.blacklist_enabled': true, 'relation.blacklist_mode': 'fold' };
  w.__ctx = { loggedIn: true, store: { get: (k, d) => (k in store ? store[k] : d) } };
  w.eval(`(function(){${BroadcastSrc};const addScript=(id,val)=>{window.__scripts=(window.__scripts||0)+1;window.eval(val);};${moduleSrc};
    const card = []; new Broadcast('nsx_notify').on(m => { if (m.data && m.data.type==='unreadCount') card.push(m.data.counts); }); // 模拟 userCardExt 先注册
    window.__card = card; window.__bn = new Broadcast('nsx_notify'); window.__adjust = nsxAdjustUnread; notifyBlock.init(window.__ctx);})()`);
  return { w, calls, rawFetch, last: () => w.__card[w.__card.length - 1] };
}

{ // 未读数：1 个黑名单 @ + 1 个正常 @ → 2 变 1
  const t = await setup({ counts: { all: 2, atMe: 2, reply: 0, message: 0 } });
  await sleep(80);
  assert.deepEqual({ ...t.w.__config__.user.unViewedCount }, { all: 1, atMe: 1, reply: 0, message: 0 });
  assert.deepEqual({ ...t.w.meCard.user.unViewedCount }, { all: 1, atMe: 1, reply: 0, message: 0 });
  assert.deepEqual({ ...t.last() }, { all: 1, atMe: 1, reply: 0, message: 0 }, 'side card got adjusted broadcast');
  assert.ok(!t.calls.includes('/api/notification/reply-to-me/list'), 'only categories with unread are fetched');
  const r = await (await t.w.fetch('/api/notification/unread-count')).json();
  assert.deepEqual(r.unreadCount, { all: 1, atMe: 1, reply: 0, message: 0 }); assert.equal(r.__nsxAdjusted, true);
  // 其他 tab / userCardExt 轮询广播的原始数字 → 立即补发调整值
  t.w.__bn.send({ type: 'unreadCount', counts: { all: 2, atMe: 2, reply: 0, message: 0 } });
  assert.deepEqual({ ...t.last() }, { all: 1, atMe: 1, reply: 0, message: 0 });
  console.log('count 2->1 ok');
}
{ // 私信只有黑名单会话 → 0；all 同步减少；列表数据层过滤
  const t = await setup({ counts: { all: 4, atMe: 2, reply: 1, message: 1 } });
  await sleep(80);
  assert.deepEqual({ ...t.w.__config__.user.unViewedCount }, { all: 2, atMe: 1, reply: 1, message: 0 });
  const at = await (await t.w.fetch('/api/notification/at-me/list')).json();
  assert.deepEqual(at.data.map(x => x.id), [2], 'blocked @ items removed (read and unread)');
  const rp = await (await t.w.fetch('/api/notification/reply-to-me/list')).json();
  assert.deepEqual(rp.data.map(x => x.id), [4]);
  const msg = await (await t.w.fetch('/api/notification/message/list')).json();
  assert.deepEqual(msg.msgArray.map(x => x.max_id), [2], 'blocked conversation removed');
  const other = await (await t.w.fetch('/api/other')).json();
  assert.deepEqual(other, { success: true, other: 1 });
  console.log('message->0 / list filtering ok');
}
{ // DOM 兜底：通知页已渲染与新增条目
  const html = `<div class="reply-container">
    <div class="reply-item" id="a"><div><img class="avatar"></div><div><a href="/space/66">Bad</a> 在帖子 <a href="/post-1-1#2">t</a>中@了我</div></div>
    <div class="reply-item" id="b"><div><img class="avatar"></div><div><a href="/space/7">good</a> 在帖子</div></div>
    <div class="reply-item" id="empty">没有@消息</div></div>
    <div class="talk-list"></div>`;
  const t = await setup({ counts: { all: 0, atMe: 0, reply: 0, message: 0 }, path: '/notification', html });
  // Vue 用 createElement 生成 router-link(a) 内嵌头像链接(a)，HTML 解析器做不到，这里用 DOM API 构造
  for (const [id, uid, name] of [['t1', 66, 'Bad'], ['t2', 9, 'friend']]) {
    const doc = t.w.document, outer = doc.createElement('a'); outer.id = id; outer.href = `#/message?mode=talk&to=${uid}`;
    const item = doc.createElement('div'); item.className = 'talk-item';
    const av = doc.createElement('a'); av.href = `/space/${uid}`; const nm = doc.createElement('div'); nm.className = 'name'; nm.textContent = name;
    item.append(av, nm); outer.append(item); doc.querySelector('.talk-list').append(outer);
  }
  await sleep(100);
  const d = id => t.w.document.getElementById(id).style.display;
  assert.equal(d('a'), 'none'); assert.equal(d('b'), ''); assert.equal(d('empty'), ''); assert.equal(d('t1'), 'none'); assert.equal(d('t2'), '');
  const n = t.w.document.createElement('div'); n.className = 'reply-item'; n.id = 'c'; n.innerHTML = '<a href="/space/123">BAD</a> 回复了我的帖子';
  t.w.document.querySelector('.reply-container').append(n); // 按名字命中（不区分大小写）
  await sleep(100);
  assert.equal(d('c'), 'none');
  assert.ok(!t.calls.includes('/api/notification/at-me/list'), 'zero counts: no list fetches');
  console.log('DOM fallback ok');
}
{ // 本地高级黑名单（非标记模式）也生效；标记模式不算
  const t = await setup({ counts: { all: 2, atMe: 2, reply: 0, message: 0 }, blockFail: true, local: { good: { mode: 'official' } } });
  await sleep(80);
  assert.equal(t.w.__config__.user.unViewedCount.atMe, 1, 'local blacklist (good) counted; official list failed so Bad not counted');
  const t2 = await setup({ counts: { all: 2, atMe: 2, reply: 0, message: 0 }, blockFail: true, local: { good: { mode: 'mark' } } });
  await sleep(80);
  assert.equal(t2.w.__config__.user.unViewedCount.atMe, 2);
  console.log('local blacklist ok');
}
{ // 接口失败：不改数字、不过滤
  const t = await setup({ counts: { all: 2, atMe: 2, reply: 0, message: 0 }, blockFail: true });
  await sleep(80);
  assert.deepEqual({ ...t.w.__config__.user.unViewedCount }, { all: 2, atMe: 2, reply: 0, message: 0 });
  const r = await (await t.w.fetch('/api/notification/unread-count')).json();
  assert.equal(r.unreadCount.atMe, 2); assert.equal(r.__nsxAdjusted, undefined);
  const at = await (await t.w.fetch('/api/notification/at-me/list')).json();
  assert.equal(at.data.length, 3);
  console.log('failure unchanged ok');
}
{ // 列表接口失败：该类不减
  const t = await setup({ counts: { all: 2, atMe: 2, reply: 0, message: 0 } });
  const orig = t.w.__nsxNotifyBlock;
  assert.ok(orig);
  const adj = { ...t.w.__adjust({ all: 3, atMe: 2, reply: 1 }, { reply: { blocked: 1, normal: 0, raw: 1 } }) };
  assert.deepEqual(adj, { all: 2, atMe: 2, reply: 0 });
  assert.deepEqual({ ...t.w.__adjust({ all: 3, message: 3 }, { message: { blocked: 1, normal: 1, raw: 3 } }) }, { all: 2, message: 2 }, 'message per-msg count: subtract conversations, keep >= normal');
  assert.deepEqual({ ...t.w.__adjust({ all: 5, message: 5 }, { message: { blocked: 1, normal: 0, raw: 3 } }) }, { all: 4, message: 4 }, 'count changed since stats: no forced zero');
  assert.deepEqual({ ...t.w.__adjust({ all: 2, atMe: 2 }, null) }, { all: 2, atMe: 2 });
  console.log('adjust edge cases ok');
}
{ // 开关关闭：完全不生效
  const t = await setup({ counts: { all: 2, atMe: 2, reply: 0, message: 0 }, enabled: false });
  await sleep(80);
  assert.equal(t.w.fetch, t.rawFetch, 'fetch not wrapped');
  assert.equal(t.w.__scripts, undefined);
  assert.equal(t.w.__config__.user.unViewedCount.atMe, 2);
  assert.equal(t.w.__card.length, 0);
  console.log('disabled ok');
}
console.log('ALL NOTIFY BLOCK TESTS PASSED');
