// ==UserScript==
// @name         NodeSeek 热榜插件
// @namespace    http://nodeseek.com/
// @version      1.3
// @description  Nodeseek 侧边栏热榜；隐藏已屏蔽用户、已私有/不可见，以及阅读等级高于当前用户等级的帖子
// @author       https://www.nodeseek.com/space/10539
// @match        https://www.nodeseek.com/*
// @grant        GM_addStyle
// @grant        unsafeWindow
// @license      MIT
// @homepageURL  https://github.com/FengBujue0104/nodeseek-scripts
// @supportURL   https://github.com/FengBujue0104/nodeseek-scripts/issues
// @downloadURL  https://scripts.fengbujue.com/nodeseek/nodeseek-hotlist.user.js
// @updateURL    https://scripts.fengbujue.com/nodeseek/nodeseek-hotlist.meta.js
// ==/UserScript==

/*
 * 原作者：https://www.nodeseek.com/space/10539（Greasy Fork 560065，MIT）。
 * 1.3：除站内黑名单外，再隐藏「已私有 / 已删除 / 当前账号不可见」以及阅读等级 > 当前用户等级的帖子（未登录按 0 级）。
 *      判断方式：同源读取帖子页（带当前登录态），404 或站点错误页视为不可见；页面内 postData.rank 即阅读等级。
 *      当前页面帖子列表里的锁形等级标记会直接复用，不额外请求。结果按账号缓存，失败或被风控时不隐藏。
 * 1.2：按官方黑名单 /api/block-list/list 隐藏被屏蔽作者。
 */

(function() {
    'use strict';

    const CONFIG = {
        apis: {
            realtime: 'https://api.bimg.eu.org/hot.json',
            daily: 'https://api.bimg.eu.org/daily.json',
            weekly: 'https://api.bimg.eu.org/weekly.json'
        },
        refreshInterval: 60 * 1000,
        defaultCount: 10,
        insertSelector: '.nsk-panel.quick-access'
    };

    GM_addStyle(`
        .nsk-hot-panel {
            margin-bottom: 15px;
            background: var(--bg-color);
            border-radius: var(--border-radius);
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            overflow: hidden;
            border: 1px solid var(--border-color);
            position: relative;
            box-sizing: border-box;
        }
        .hot-header-row {
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 12px; 
            position: relative;
            border-bottom: none;
            height: 24px;
        }
        .hot-icon-left {
            position: absolute;
            left: 12px;
            top: 50%;
            transform: translateY(-50%);
            display: flex;
            align-items: center;
            color: #ff4d4f;
        }
        .hot-title {
            font-size: 15px;
            font-weight: 700;
            color: var(--text-color);
            z-index: 1;
        }
        .hot-title a {
            color: inherit;
            text-decoration: none;
            cursor: pointer;
        }
        .hot-title a:hover {
            color: var(--primary-color);
            text-decoration: underline;
        }
        .hot-refresh-btn {
            position: absolute;
            right: 12px;
            top: 50%;
            transform: translateY(-50%);
            cursor: pointer;
            color: var(--text-color-secondary);
            padding: 4px;
            border-radius: 4px;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 20px;
            height: 20px;
        }
        .hot-refresh-btn:hover {
            background-color: var(--bg-color-grey);
            color: var(--primary-color);
        }
        .hot-refresh-btn.status-loading svg {
            animation: spin 1s linear infinite;
            transform-origin: center center;
        }
        .hot-tabs-container { padding: 8px 12px; box-sizing: border-box; }
        .hot-tabs-track {
            position: relative;
            background-color: var(--bg-color-grey);
            border-radius: 8px;
            padding: 3px;
            display: flex;
            height: 40px;
            box-sizing: border-box;
        }
        .hot-tab-slider {
            position: absolute;
            top: 3px;
            left: 3px;
            width: calc((100% - 6px) / 3);
            height: calc(100% - 6px);
            background-color: var(--bg-color);
            border-radius: 6px;
            box-shadow: 0 1px 2px rgba(0,0,0,0.08);
            transition: transform 0.25s cubic-bezier(0.4, 0.0, 0.2, 1);
            z-index: 1;
            box-sizing: border-box;
        }
        .hot-tab-item {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 13px;
            font-weight: 500;
            color: var(--text-color-secondary);
            cursor: pointer;
            z-index: 2;
            transition: color 0.2s;
            user-select: none;
            position: relative;
        }
        .hot-tab-item.active { color: var(--text-color); font-weight: 700; }
        .slider-pos-0 { transform: translateX(0%); }
        .slider-pos-1 { transform: translateX(100%); }
        .slider-pos-2 { transform: translateX(200%); }
        .nsk-hot-list {
            padding: 0 !important; 
            margin: 0 !important;
            list-style: none;
            width: 100%;
        }
        .nsk-hot-list li {
            height: auto !important;
            min-height: 42px;
            padding: 6px 14px;
            width: 100%;
            box-sizing: border-box;
            border-top: 1px dashed var(--border-color);
            display: flex;
            align-items: center;
        }
        .nsk-hot-list li:first-child { border-top: 1px solid var(--border-color); }
        .nsk-hot-list li a {
            display: flex !important;
            align-items: center !important;
            text-decoration: none !important;
            color: var(--text-color);
            width: 100%;
            line-height: 1.5 !important;
        }
        .nsk-hot-list li a:hover .hot-post-title { color: var(--primary-color); }
        .hot-rank-num {
            display: inline-flex;
            justify-content: center;
            align-items: center;
            width: 18px;
            height: 18px;
            border-radius: 5px;
            background: var(--bg-color-grey);
            color: var(--text-color-secondary);
            font-size: 11px;
            margin-right: 12px;
            font-weight: 700;
            flex-shrink: 0;
            margin-top: 1px;
        }
        .hot-rank-1 { background: #ff4d4f !important; color: #fff !important; }
        .hot-rank-2 { background: #ff7a45 !important; color: #fff !important; }
        .hot-rank-3 { background: #ffa940 !important; color: #fff !important; }
        .hot-post-title {
            flex: 1;
            font-size: 13.5px;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-line-break: anywhere;
            -webkit-box-orient: vertical;
            overflow: hidden;
            word-break: break-word;
            transition: color 0.2s;
            letter-spacing: 0.2px;
        }
        .hot-loading-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            width: 100%;
            height: 320px;
            color: var(--text-color-secondary);
            gap: 12px;
        }
        .hot-loading-icon {
            color: var(--primary-color);
            opacity: 0.8;
            display: flex;
        }
        .hot-loading-container .hot-loading-icon.spinning svg {
             animation: spin 1s linear infinite;
             transform-origin: center center;
             display: block;
        }
        .hot-loading-text { font-size: 13px; opacity: 0.7; }
        .hot-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 14px;
            font-size: 11px;
            color: var(--text-color-secondary);
            background: var(--bg-color-grey);
            border-top: 1px solid var(--border-color);
        }
        .hot-expand-btn { cursor: pointer; font-weight: 500; }
        .hot-expand-btn:hover { color: var(--primary-color); }
        .hot-item-hidden { display: none !important; }
        .status-loading { color: var(--primary-color); }
        .status-error { color: #ff4d4f !important; font-weight: 600; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
    `);

    const ICONS = {
        realFire: `<svg class="iconpark-icon" style="width:1.3em;height:1.3em;vertical-align:middle;"><use href="#fire"></use></svg>`,
        refresh: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>`,
        loading: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>`,
        error: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`
    };

    const UI = {
        panel: null, listUl: null, refreshBtn: null, updateTime: null,
        toggleBtn: null, toggleText: null, slider: null, tabs: []
    };

    let state = {
        currentTab: 0,
        tabKeys: ['realtime', 'daily', 'weekly'],
        isLoading: false,
        expanded: false,
        posts: null,
        gen: 0,
        failed: new Set()
    };

    const BLOCK_LIST_API = '/api/block-list/list';
    const BLOCK_LIST_TTL = 60 * 1000;
    const blockedIds = new Set();
    const blockedNames = new Set();
    let blockListLoadedAt = 0;

    function normalizeName(name) {
        return String(name || '').trim().toLowerCase();
    }

    async function loadBlockList(force = false) {
        if (!force && blockListLoadedAt && Date.now() - blockListLoadedAt < BLOCK_LIST_TTL) {
            return;
        }
        try {
            const response = await fetch(BLOCK_LIST_API, {
                credentials: 'include',
                headers: { Accept: 'application/json' }
            });
            const data = await response.json().catch(() => null);
            if (!response.ok || !data || data.success === false || !Array.isArray(data.data)) {
                if (!blockListLoadedAt) blockListLoadedAt = Date.now();
                return;
            }
            blockedIds.clear();
            blockedNames.clear();
            for (const item of data.data) {
                if (item.block_member_id != null) blockedIds.add(String(item.block_member_id));
                const name = normalizeName(item.block_member_name);
                if (name) blockedNames.add(name);
            }
            blockListLoadedAt = Date.now();
        } catch (error) {
            if (!blockListLoadedAt) blockListLoadedAt = Date.now();
        }
    }

    function isBlockedAuthor(post) {
        if (!post) return false;
        if (post.author_id != null && blockedIds.has(String(post.author_id))) return true;
        return Boolean(post.author && blockedNames.has(normalizeName(post.author)));
    }

    function filterBlockedPosts(posts) {
        if (!posts) return posts;
        return posts.filter(item => !isBlockedAuthor(item.post));
    }

    // ===== 1.3：已私有 / 阅读等级过滤 =====
    const ACCESS = {
        cachePrefix: 'nshot:access:v1:',
        okTtl: 20 * 60 * 1000,
        hideTtl: 60 * 60 * 1000,
        concurrency: 3,
        timeout: 8000,
        prefetchExtra: 5,
        maxEntries: 600
    };
    const pageWin = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
    let viewer = null;
    let accessCache = null;
    const inflight = new Map();

    function toRank(value) {
        const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
        return Number.isInteger(n) && n >= 0 ? n : null;
    }

    async function getViewer() {
        if (viewer) return viewer;
        const cfg = pageWin.__config__;
        const user = cfg && cfg.user;
        if (!cfg) {
            // 页面配置缺失时无法确认等级：仅按不可见(404)过滤，不按等级隐藏。
            viewer = { uid: 'unknown', rank: null, loggedIn: false };
        } else if (!user) {
            viewer = { uid: '0', rank: 0, loggedIn: false };
        } else {
            const uid = String(user.member_id ?? user.uid ?? user.id ?? 'self');
            let rank = toRank(user.rank);
            if (rank === null && /^\d+$/.test(uid)) {
                try {
                    const r = await fetch(`/api/account/getInfo/${uid}`, { credentials: 'include', headers: { Accept: 'application/json' } });
                    const d = await r.json();
                    if (d && d.success === true) rank = toRank(d.detail && d.detail.rank);
                } catch (e) { /* 保持未知 */ }
            }
            viewer = { uid, rank, loggedIn: true };
        }
        return viewer;
    }

    function cacheKey() { return ACCESS.cachePrefix + (viewer ? viewer.uid : 'unknown'); }

    function loadAccessCache() {
        if (accessCache) return accessCache;
        accessCache = new Map();
        try {
            const raw = JSON.parse(localStorage.getItem(cacheKey()) || '{}');
            const now = Date.now();
            for (const [id, v] of Object.entries(raw)) {
                if (!v || typeof v.t !== 'number') continue;
                const ttl = v.s === 'hide' ? ACCESS.hideTtl : ACCESS.okTtl;
                if (now - v.t < ttl) accessCache.set(id, v);
            }
        } catch (e) { /* ignore */ }
        return accessCache;
    }

    let saveTimer = 0;
    function saveAccessCache() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            try {
                const entries = [...loadAccessCache()].sort((a, b) => a[1].t - b[1].t).slice(-ACCESS.maxEntries);
                localStorage.setItem(cacheKey(), JSON.stringify(Object.fromEntries(entries)));
            } catch (e) { /* ignore */ }
        }, 300);
    }

    function setAccess(id, record) {
        loadAccessCache().set(String(id), { ...record, t: Date.now() });
        saveAccessCache();
    }

    function parseConfigFromHtml(html) {
        const m = /id=["']temp-script["'][^>]*>([^<]*)</.exec(String(html || ''));
        if (!m || !m[1].trim()) return null;
        try {
            const bin = atob(m[1].trim());
            const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
            return JSON.parse(new TextDecoder('utf-8').decode(bytes));
        } catch (e) {
            return null;
        }
    }

    // 返回 {s:'ok'|'hide', why, rank} 或 null（无法判断，不隐藏）。
    function classifyPostResponse(status, html, viewerRank) {
        if (status === 404 || status === 410) return { s: 'hide', why: 'unavailable' };
        if (status !== 200 && status !== 403) return null; // 429/5xx 等临时错误不隐藏
        const cfg = parseConfigFromHtml(html);
        if (!cfg) return null; // Cloudflare 质询、网络错误页等
        const pd = cfg.postData;
        if (!pd) {
            return cfg.pageType === 'error' ? { s: 'hide', why: 'unavailable' } : null;
        }
        const rank = toRank(pd.rank) ?? 0;
        if (viewerRank !== null && viewerRank !== undefined && rank > viewerRank) {
            return { s: 'hide', why: 'level', rank };
        }
        return status === 200 ? { s: 'ok', rank } : null;
    }

    function judge(record) {
        if (!record) return null;
        if (record.s === 'hide' && record.why === 'unavailable') return 'unavailable';
        const rank = toRank(record.rank);
        if (rank !== null && viewer && viewer.rank !== null && rank > viewer.rank) return 'level';
        return record.s === 'hide' && record.why === 'level' && (!viewer || viewer.rank === null) ? null : 'ok';
    }

    // 复用当前页面已渲染的信息：帖子列表里的锁形等级标记、当前帖子页的 postData。
    function harvestPage() {
        const cache = loadAccessCache();
        try {
            const pd = pageWin.__config__ && pageWin.__config__.postData;
            if (pd && pd.postId != null) setAccess(pd.postId, { s: 'ok', rank: toRank(pd.rank) ?? 0, src: 'page' });
        } catch (e) { /* ignore */ }
        document.querySelectorAll('.post-list-item').forEach(item => {
            const a = item.querySelector('.post-title a[href*="/post-"]');
            const m = a && /\/post-(\d+)-/.exec(a.getAttribute('href') || '');
            if (!m) return;
            let rank = 0;
            const lockUse = item.querySelector('.post-title use[href="#lock"], .post-title use[*|href="#lock"]');
            if (lockUse) {
                const holder = lockUse.closest('span');
                const n = holder && /\d+/.exec(holder.textContent || '');
                rank = n ? Number(n[0]) : null;
                if (rank === null) return; // 有锁但读不到数字：交给帖子页判断
            }
            const old = cache.get(m[1]);
            if (old && old.s === 'hide') return; // 列表与缓存冲突时保留更保守的判断直到过期
            setAccess(m[1], { s: 'ok', rank, src: 'list' });
        });
    }

    async function checkPost(id) {
        id = String(id);
        if (inflight.has(id)) return inflight.get(id);
        const job = (async () => {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), ACCESS.timeout);
            try {
                const r = await fetch(`/post-${id}-1`, {
                    credentials: 'include',
                    signal: controller.signal,
                    headers: { Accept: 'text/html' }
                });
                const html = r.status === 404 ? '' : await r.text();
                const res = classifyPostResponse(r.status, html, viewer ? viewer.rank : null);
                if (res) setAccess(id, res);
                return res;
            } catch (e) {
                return null;
            } finally {
                clearTimeout(timer);
                inflight.delete(id);
            }
        })();
        inflight.set(id, job);
        return job;
    }

    const hiddenStats = { blocked: 0, unavailable: 0, level: 0 };

    function visiblePosts(posts) {
        hiddenStats.unavailable = 0;
        hiddenStats.level = 0;
        const cache = loadAccessCache();
        return (posts || []).filter(item => {
            const v = judge(cache.get(String(item.post && item.post.id)));
            if (v === 'unavailable') { hiddenStats.unavailable++; return false; }
            if (v === 'level') { hiddenStats.level++; return false; }
            return true;
        });
    }

    // 只检查需要展示的前若干条（未展开时 defaultCount + 余量，展开后全部），被隐藏的会自动向后补位。
    async function runAccessChecks(gen) {
        const cache = loadAccessCache();
        while (gen === state.gen) {
            const target = state.expanded ? Infinity : CONFIG.defaultCount + ACCESS.prefetchExtra;
            const todo = [];
            let shown = 0;
            for (const item of state.posts || []) {
                if (shown >= target) break;
                const id = String(item.post && item.post.id);
                const v = judge(cache.get(id));
                if (v === 'unavailable' || v === 'level') continue;
                shown++;
                if (!cache.has(id) && !state.failed.has(id)) todo.push(id);
            }
            if (!todo.length) return;
            let idx = 0;
            const worker = async () => {
                while (idx < todo.length && gen === state.gen) {
                    const id = todo[idx++];
                    const res = await checkPost(id);
                    if (!res) state.failed.add(id);
                    else if (res.s === 'hide' && gen === state.gen) scheduleRerender();
                }
            };
            await Promise.all(Array.from({ length: Math.min(ACCESS.concurrency, todo.length) }, worker));
        }
    }

    let rerenderTimer = 0;
    function scheduleRerender() {
        clearTimeout(rerenderTimer);
        rerenderTimer = setTimeout(() => renderList(visiblePosts(state.posts)), 120);
    }

    function updateHiddenTitle() {
        if (!UI.updateTime) return;
        const parts = [];
        if (hiddenStats.blocked) parts.push(`黑名单 ${hiddenStats.blocked}`);
        if (hiddenStats.unavailable) parts.push(`已私有/不可见 ${hiddenStats.unavailable}`);
        if (hiddenStats.level) parts.push(`等级限制 ${hiddenStats.level}`);
        const lv = viewer && viewer.rank !== null ? `当前等级 Lv.${viewer.rank}${viewer.loggedIn ? '' : '（未登录）'}` : '当前等级未知';
        UI.updateTime.title = `${lv}\n已隐藏：${parts.length ? parts.join('，') : '无'}`;
    }

    function escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    function formatTimeDiff(timestamp) {
        if (!timestamp) return '--';
        const diff = Math.floor((Date.now() / 1000) - timestamp);
        if (diff < 60) return '刚刚';
        return `${Math.floor(diff / 60)}分前`;
    }

    async function fetchData(type) {
        const apiUrl = CONFIG.apis[type];
        if (!apiUrl) return null;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000); 
            const response = await fetch(`${apiUrl}?t=${Date.now()}`, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (!response.ok) throw new Error('Network error');
            return await response.json();
        } catch (error) {
            return null;
        }
    }

    function updateFooterStatus(status, timestamp = 0) {
        if (!UI.refreshBtn || !UI.updateTime) return;
        
        const iconSvg = UI.refreshBtn.querySelector('svg');

        if (status === 'loading') {
            UI.refreshBtn.classList.add('status-loading');
        } else {
            if (UI.refreshBtn.classList.contains('status-loading')) {
                if (document.hidden) {
                    UI.refreshBtn.classList.remove('status-loading');
                } else if (iconSvg) {
                    iconSvg.addEventListener('animationiteration', () => {
                        UI.refreshBtn.classList.remove('status-loading');
                    }, { once: true });
                } else {
                    UI.refreshBtn.classList.remove('status-loading');
                }
            }
        }

        UI.updateTime.classList.remove('status-error');
        if (status === 'error') {
            UI.updateTime.classList.add('status-error');
            UI.updateTime.textContent = '连接失败';
        } else if (status === 'idle') {
            UI.updateTime.textContent = timestamp > 0 ? formatTimeDiff(timestamp) + '更新' : '--';
        }
    }

    function renderList(posts) {
        if (!UI.listUl) return;

        if (!posts || posts.length === 0) {
            const isError = posts === null;
            const spinClass = isError ? '' : 'spinning';
            
            UI.listUl.innerHTML = `
                <div class="hot-loading-container">
                    <div class="hot-loading-icon ${spinClass}">${isError ? ICONS.error : ICONS.loading}</div>
                    <span class="hot-loading-text">${isError ? '获取失败，请重试' : '暂无数据'}</span>
                </div>`;
            if (UI.toggleBtn) UI.toggleBtn.style.display = 'none';
            return;
        }

        updateHiddenTitle();
        const cache = loadAccessCache();
        const html = posts.map((item, index) => {
            const post = item.post;
            const rank = index + 1;
            const isHidden = !state.expanded && index >= CONFIG.defaultCount ? 'hot-item-hidden' : '';
            const known = cache.get(String(post.id));
            const readRank = known ? toRank(known.rank) : null;
            const rankClass = index < 3 ? `hot-rank-${rank}` : '';
            const score = Math.floor(item.score);
            const safeTitle = escapeHtml(post.title);
            const safeAuthor = escapeHtml(post.author);
            const tooltip = `标题：${safeTitle}&#10;作者：${safeAuthor} (ID: ${post.author_id})&#10;浏览：${post.views} | 回复：${post.comments}&#10;热度：${score}${readRank ? `&#10;阅读等级：Lv.${readRank}` : ''}`;

            return `
                <li class="${isHidden} hot-list-item">
                    <a href="/post-${post.id}-1" title="${tooltip}">
                        <span class="hot-rank-num ${rankClass}">${rank}</span>
                        <span class="hot-post-title">${safeTitle}</span>
                    </a>
                </li>
            `;
        }).join('');

        UI.listUl.innerHTML = html;
        
        if (UI.toggleBtn) {
            UI.toggleBtn.style.display = posts.length > CONFIG.defaultCount ? 'block' : 'none';
            UI.toggleText.textContent = state.expanded ? '收起榜单 ▲' : '展开全部 ▼';
        }
    }

    function renderLoading() {
        if (UI.listUl) {
            UI.listUl.innerHTML = `
                <div class="hot-loading-container">
                    <div class="hot-loading-icon spinning">${ICONS.loading}</div>
                    <span class="hot-loading-text">正在更新...</span>
                </div>
            `;
        }
        if (UI.toggleBtn) UI.toggleBtn.style.display = 'none';
    }

    async function switchTab(index) {
        if (state.isLoading) return;

        state.currentTab = index;
        state.isLoading = true;
        state.expanded = false;
        const gen = ++state.gen;
        state.failed = new Set();

        if (UI.slider) UI.slider.className = `hot-tab-slider slider-pos-${index}`;
        UI.tabs.forEach((el, idx) => el.classList.toggle('active', idx === index));

        updateFooterStatus('loading');
        renderLoading(); 
        
        const [data] = await Promise.all([
            fetchData(state.tabKeys[index]),
            loadBlockList(),
            getViewer()
        ]);
        loadAccessCache();
        harvestPage();
        
        state.isLoading = false;
        
        if (data && data.posts) {
            const unblocked = filterBlockedPosts(data.posts);
            hiddenStats.blocked = data.posts.length - unblocked.length;
            state.posts = unblocked;
            renderList(visiblePosts(state.posts));
            updateFooterStatus('idle', data.updated_at);
            runAccessChecks(gen).catch(() => {});
        } else {
            state.posts = null;
            renderList(null); 
            updateFooterStatus('error');
        }
    }

    function initPanel() {
        const target = document.querySelector(CONFIG.insertSelector);
        if (!target) return;

        const panel = document.createElement('div');
        panel.className = 'nsk-panel nsk-hot-panel';
        
        panel.innerHTML = `
            <div class="hot-header-row">
                <div class="hot-icon-left">
                    ${ICONS.realFire}
                </div>
                <div class="hot-title">
                    <a href="https://bimg.eu.org" target="_blank">NodeSeek 热榜</a>
                </div>
                <div class="hot-refresh-btn" id="hot-refresh-btn" title="点击刷新">
                    ${ICONS.refresh}
                </div>
            </div>

            <div class="hot-tabs-container">
                <div class="hot-tabs-track">
                    <div class="hot-tab-slider slider-pos-0" id="hot-tab-slider"></div>
                    <div class="hot-tab-item active" data-idx="0">实时</div>
                    <div class="hot-tab-item" data-idx="1">日榜</div>
                    <div class="hot-tab-item" data-idx="2">周榜</div>
                </div>
            </div>
            
            <ul class="nsk-hot-list" id="hot-list-ul"></ul>

            <div class="hot-footer">
                <div class="hot-status-text" id="hot-last-update">--</div>
                <div class="hot-expand-btn" id="hot-toggle-container">
                    <span id="hot-toggle-text">展开全部 ▼</span>
                </div>
            </div>
        `;

        target.parentNode.insertBefore(panel, target);

        UI.panel = panel;
        UI.listUl = document.getElementById('hot-list-ul');
        UI.refreshBtn = document.getElementById('hot-refresh-btn');
        UI.updateTime = document.getElementById('hot-last-update');
        UI.toggleBtn = document.getElementById('hot-toggle-container');
        UI.toggleText = document.getElementById('hot-toggle-text');
        UI.slider = document.getElementById('hot-tab-slider');
        UI.tabs = Array.from(document.querySelectorAll('.hot-tab-item'));

        UI.refreshBtn.addEventListener('click', () => switchTab(state.currentTab));
        UI.tabs.forEach((tab) => {
            tab.addEventListener('click', () => switchTab(parseInt(tab.dataset.idx)));
        });

        UI.toggleBtn.addEventListener('click', () => {
            const hiddenItems = UI.listUl.querySelectorAll('.hot-item-hidden');
            if (hiddenItems.length > 0) {
                hiddenItems.forEach(el => el.classList.remove('hot-item-hidden'));
                UI.toggleText.textContent = '收起榜单 ▲';
                state.expanded = true;
                runAccessChecks(state.gen).catch(() => {});
            } else {
                state.expanded = false;
                const allItems = UI.listUl.querySelectorAll('li');
                allItems.forEach((el, idx) => {
                    if (idx >= CONFIG.defaultCount) el.classList.add('hot-item-hidden');
                });
                UI.toggleText.textContent = '展开全部 ▼';
            }
        });

        switchTab(0);
    }

    if (pageWin.__NSHOT_TEST__) {
        pageWin.__NSHOT_TEST__.api = { classifyPostResponse, parseConfigFromHtml, judge, visiblePosts, state, getViewer, hiddenStats, loadAccessCache };
    }

    initPanel();

})();