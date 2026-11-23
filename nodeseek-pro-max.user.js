// ==UserScript==
// @name         NodeSeek Pro Max
// @author       用蚊香买榄菊
// @description  用于增强 NodeSeek/DeepFlood 论坛体验的用户脚本：提供自动签到、下拉加载、快速评论、内容过滤、等级标记、浏览历史、Callout 渲染、图片预览、快捷键等功能，并带可视化设置面板可自由开关配置。
// @namespace    http://www.nodeseek.com/
// @version      1.1.5-cid3
// @icon         https://www.google.com/s2/favicons?sz=64&domain=nodeseek.com
// @match        *://www.nodeseek.com/*
// @match        *://www.deepflood.com/*
// @require      https://s4.zstatic.net/ajax/libs/layui/2.10.3/layui.min.js
// @resource     highlightStyle https://s4.zstatic.net/ajax/libs/highlight.js/11.9.0/styles/atom-one-light.min.css
// @resource     highlightStyle_dark https://s4.zstatic.net/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_listValues
// @grant        GM_deleteValue
// @grant        GM_notification
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_getResourceURL
// @grant        GM_addElement
// @grant        GM_addStyle
// @grant        GM_openInTab
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @grant        GM.info
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.deleteValue
// @grant        GM.listValues
// @grant        GM.openInTab
// @grant        GM.xmlHttpRequest
// @run-at       document-idle
// @license      GPL-3.0
// @homepageURL  https://github.com/FengBujue0104/nodeseek-scripts
// @supportURL   https://github.com/FengBujue0104/nodeseek-scripts/issues
// @downloadURL  https://scripts.fengbujue.com/nodeseek/nodeseek-pro-max.user.js
// @updateURL    https://scripts.fengbujue.com/nodeseek/nodeseek-pro-max.meta.js
// Based on NodeSeek Pro+; modified and maintained as NodeSeek Pro Max.
// Original project: https://greasyfork.org/scripts/602733
// ==/UserScript==
(function () {
    'use strict';
    function runNodeseekPro(apis) {
        const {GM_info, GM_getValue, GM_setValue, GM_listValues, GM_deleteValue, GM_registerMenuCommand, GM_unregisterMenuCommand, GM_getResourceURL, GM_openInTab, GM_xmlhttpRequest, unsafeWindow, nsxReloadPage} = apis;

    'use strict';

    // AI 功能总开关：需在模块加载前定义
    // 设为 true 可加载 aiComment 模块
    var AI = false;

    // NSX Core - 核心
    // 环境 + DOM + 网络 + 存储 + 模块管理

    const SITES = [
        { host: "www.nodeseek.com", code: "ns", name: "NodeSeek" },
        { host: "www.deepflood.com", code: "df", name: "DeepFlood" }
    ];

    const info = GM_info?.script || {};
    const site = SITES.find(s => s.host === location.host);
    let debug = false;
    try { debug = GM_getValue("settings", {})?.debug?.enabled; } catch { }

    // ===== 环境 =====
    const env = {
        info, site, BASE_URL: location.origin,
        log: (...a) => debug && console.log(`[NSX]`, ...a),
        warn: (...a) => debug && console.warn(`[NSX]`, ...a),
        error: (...a) => console.error(`[NSX]`, ...a)
    };

    // ===== DOM =====
    const $ = (s, r = document) => r?.querySelector(s);
    const $$ = (s, r = document) => [...(r?.querySelectorAll(s) || [])];

    function ensureIconGroup() {
        const head = document.querySelector('#nsk-head');
        if (!head) return null;

        const anchor = head.querySelector('.color-theme-switcher');
        const parent = head;

        let grp = document.getElementById('nsx-icon-group');
        if (!grp || grp.tagName !== 'DIV') {
            const old = grp;
            grp = document.createElement('div');
            grp.id = 'nsx-icon-group';
            grp.className = 'right-button-group';
            old?.replaceWith(grp);
        } else if (!grp.className) {
            grp.className = 'right-button-group';
        }

        const target = anchor && anchor.parentElement === parent ? anchor : null;
        if (target) {
            const alreadyInPlace = grp.parentElement === parent && grp.nextSibling === target;
            if (!alreadyInPlace) parent.insertBefore(grp, target);
        } else {
            const searchBox = head.querySelector('.search-box');
            if (searchBox && searchBox.parentElement === parent) {
                const alreadyInPlace = grp.parentElement === parent && grp.nextSibling === searchBox;
                if (!alreadyInPlace) parent.insertBefore(grp, searchBox);
            } else {
                const alreadyInPlace = grp.parentElement === parent && grp === parent.lastElementChild;
                if (!alreadyInPlace) parent.appendChild(grp);
            }
        }
        return grp;
    }

    function addStyle(id, val) {
        if (document.getElementById(id)) return;
        const isUrl = /^(https?:)?\/\//.test(val);
        const el = document.createElement(isUrl ? "link" : "style");
        el.id = id;
        isUrl ? (el.rel = "stylesheet", el.href = val) : (el.textContent = val);
        document.head?.appendChild(el);
    }

    function addScript(id, val) {
        if (document.getElementById(id)) return;
        const el = document.createElement("script");
        el.id = id;
        /^(https?:)?\/\//.test(val) ? (el.src = val) : (el.textContent = val);
        document.body?.appendChild(el);
    }

    const debounce = (fn, ms) => {
        let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
        d.cancel = () => clearTimeout(t); return d;
    };

    const throttle = (fn, ms) => {
        let last = 0;
        return (...a) => { const now = Date.now(); if (now - last >= ms) { last = now; fn(...a); } };
    };

    // ===== 存储 =====
    const cfgFragments = new Map(), metaFragments = new Map();
    let cfgCache = null;

    const isObj = v => v && typeof v === "object" && !Array.isArray(v);
    const merge = (t, s) => { for (const k in s) isObj(s[k]) ? (isObj(t[k]) || (t[k] = {}), merge(t[k], s[k])) : t[k] === undefined && (t[k] = s[k]); };
    const getPath = (o, p) => p.split(".").reduce((a, k) => a?.[k], o);
    const setPath = (o, p, v) => { const ks = p.split("."), l = ks.pop(); ks.reduce((a, k) => a[k] ??= {}, o)[l] = v; };

    const store = {
        reg(id, cfg, meta) { cfg && cfgFragments.set(id, cfg); meta && metaFragments.set(id, meta); },
        getDefaults() { const d = { version: info.version, debug: { enabled: false } }; cfgFragments.forEach(f => merge(d, f)); return d; },
        getMeta() { const m = {}; metaFragments.forEach(f => merge(m, f)); return m; },
        init() {
            if (cfgCache) return cfgCache;
            const def = this.getDefaults();
            cfgCache = GM_getValue("settings", null) || {};
            // Migrate the old combined appearance settings before defaults are merged.
            if (!cfgCache.badge_appearance && cfgCache.card_appearance) {
                const old = cfgCache.card_appearance;
                cfgCache.badge_appearance = { style: old.style || "liquid", show_list: old.show_list ?? true, show_post: old.show_post ?? true };
                delete old.style; delete old.show_list; delete old.show_post;
            }
            if (cfgCache.badge_appearance) {
                const badge = cfgCache.badge_appearance;
                badge.list_style ??= badge.style || "liquid";
                badge.post_style ??= badge.style || "liquid";
                delete badge.style;
            }
            merge(cfgCache, def);
            cfgCache.version = def.version;
            GM_setValue("settings", cfgCache);
            return cfgCache;
        },
        get(p, fb) { const v = getPath(this.init(), p); return v === undefined ? fb : v; },
        set(p, v) { setPath(this.init(), p, v); GM_setValue("settings", cfgCache); }
    };

    // ===== 网络 =====
    const net = {
        async fetch(url, { method = "GET", data, headers = {}, type = "json" } = {}) {
            const r = await fetch(url.startsWith("http") ? url : env.BASE_URL + url, {
                method, credentials: "include",
                headers: { ...(data ? { "Content-Type": "application/json" } : {}), ...headers },
                body: data ? JSON.stringify(data) : undefined
            });
            return r[type]().catch(() => null);
        },
        get: (u, h, t) => net.fetch(u, { headers: h, type: t }),
        post: (u, d, h, t) => net.fetch(u, { method: "POST", data: d, headers: h, type: t })
    };

    // ===== 模块管理 =====
    const modules = new Map();

    function define(cfg) {
        if (!cfg?.id) throw new Error("id required");
        cfg.deps ??= [];
        cfg.order ??= 100;
        modules.set(cfg.id, cfg);
        cfg.cfg && store.reg(cfg.id, cfg.cfg, cfg.meta);
        return cfg;
    }

    function boot(ctx) {
        store.init();
        // 拓扑排序
        const list = [...modules.values()];
        const indeg = new Map(list.map(m => [m.id, 0]));
        const edges = new Map(list.map(m => [m.id, []]));
        list.forEach(m => m.deps.forEach(d => { if (modules.has(d)) { edges.get(d).push(m.id); indeg.set(m.id, indeg.get(m.id) + 1); } }));
        const q = list.filter(m => indeg.get(m.id) === 0).sort((a, b) => a.order - b.order);
        const sorted = [];
        while (q.length) {
            const cur = q.shift(); sorted.push(cur);
            edges.get(cur.id).forEach(n => { indeg.set(n, indeg.get(n) - 1); if (!indeg.get(n)) q.push(modules.get(n)); });
            q.sort((a, b) => a.order - b.order);
        }
        // 初始化和监听
        sorted.forEach(m => {
            if (m.match?.(ctx) !== false) {
                try { m.init?.(ctx); } catch (e) { env.error(m.id, e); }
                if (ctx.watch) {
                    const w = typeof m.watch === "function" ? m.watch(ctx) : m.watch;
                    [].concat(w || []).filter(Boolean).forEach(i => ctx.watch(i.sel, i.fn, i.opts));
                }
            }
        });
    }

    /* ==========================================================================
       [ 🧭 辅助工具 ] - 自动跳转外部链接
       ========================================================================== */
    const autoJump = {
        id: "autoJump",
        order: 210,
        cfg: { auto_jump_external_links: { enabled: true } },
        meta: { auto_jump_external_links: { label: "自动跳转外部链接", group: "🧭 辅助工具" } },
        match: ctx => ctx.store.get("auto_jump_external_links.enabled", true),
        init(ctx) {
            $$('a[href*="/jump?to="]').forEach(a => {
                try {
                    const to = new URL(a.href).searchParams.get("to");
                    if (to) a.href = decodeURIComponent(to);
                } catch { }
            });
            if (/^\/jump/.test(location.pathname)) ctx.$(".btn")?.click();
        }
    };

    const __vite_glob_0_0 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
        __proto__: null,
        default: autoJump
    }, Symbol.toStringTag, { value: 'Module' }));

    /* ==========================================================================
       [ 🧭 辅助工具 ] - 下拉加载 / 自动翻页 (Infinite Scroll)
       ========================================================================== */

    const PROFILES = {
        list: { path: /^\/(categories\/|page|award|search|$)/, threshold: 1500, next: ".nsk-pager a.pager-next", list: "ul.post-list:not(.topic-carousel-panel)", pagerTop: "div.nsk-pager.pager-top", pagerBot: "div.nsk-pager.pager-bottom" },
        post: { path: /^\/post-/, threshold: 690, next: ".nsk-pager a.pager-next", list: "ul.comments", pagerTop: "div.nsk-pager.post-top-pager", pagerBot: "div.nsk-pager.post-bottom-pager" }
    };

    const autoLoading = {
        id: "autoLoading",
        order: 220,
        cfg: { loading_post: { enabled: false }, loading_comment: { enabled: false } },
        meta: {
            loading_post: { label: "自动加载下一页(帖子)", group: "🧭 辅助工具" },
            loading_comment: { label: "自动加载下一页(评论)", group: "🧭 辅助工具" }
        },
        match: ctx => ctx.isList || ctx.isPost,
        init(ctx) {
            const profile = ctx.isList ? PROFILES.list : ctx.isPost ? PROFILES.post : null;
            if (!profile) return;

            const cfgKey = ctx.isList ? "loading_post.enabled" : "loading_comment.enabled";
            let isEnabled = ctx.store.get(cfgKey, false);

            // 注入快捷开关按钮：纯净创造节点，以原生的 class 和 CSS 层叠逻辑定位
            const navGroup = ctx.$("#fast-nav-button-group");
            if (navGroup) {
                const btn = document.createElement("a");
                btn.className = "nav-item-btn";
                btn.id = "nsx-toggle-autoload";
                btn.href = "javascript:void(0);";

                const updateBtn = () => {
                    // 开启时：绿色向下加载流水线； 关闭时：鲜红色带禁止图标
                    if (isEnabled) {
                        btn.title = "瀑布流自动加载：已开启 (点击休眠)";
                        btn.innerHTML = `<svg viewBox="0 0 48 48" fill="none" class="iconpark-icon" style="width:24px;height:24px;color:#4caf50;"><path d="M24 10V38M12 26L24 38L36 26" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
                    } else {
                        btn.title = "瀑布流自动加载：已休眠 (点击开启)";
                        btn.innerHTML = `<svg viewBox="0 0 48 48" fill="none" class="iconpark-icon" style="width:24px;height:24px;color:#f44336;"><path d="M24 10V38M12 26L24 38L36 26" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 8L40 40" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
                    }
                };
                updateBtn();

                btn.onclick = (e) => {
                    e.preventDefault();
                    isEnabled = !isEnabled;
                    ctx.store.set(cfgKey, isEnabled);
                    updateBtn();
                    ctx.ui?.toast?.(isEnabled ? "✅ 瀑布流向下加载已开启" : "❌ 瀑布流加载已停用");
                };

                // 置于结构序列的第一位，由扩展的 nth-last-child CSS 接管精准定位！
                navGroup.prepend(btn);
            }

            let busy = false, prevY = scrollY;

            const blockByLevel = (doc) => {
                const lv = ctx.user?.rank || 0;
                doc.querySelectorAll('.post-list-item use[href="#lock"]').forEach(el => {
                    const n = +(el.closest("span")?.textContent?.match(/\d+/)?.[0] || 0);
                    if (n > lv) el.closest(".post-list-item")?.classList.add("blocked-post");
                });
            };
            const processCommentMenus = (commentElements) => {
                if (!ctx.isPost || !commentElements?.length) return;
                const existingMenu = document.querySelector(".comment-menu");
                const vue = existingMenu?.__vue__;
                if (!vue?.$root?.constructor || !vue?.$options) return;
                const startIndex = document.querySelectorAll(".content-item").length - commentElements.length;
                commentElements.forEach((comment, index) => {
                    const menuMount = document.createElement("div");
                    menuMount.className = "comment-menu-mount";
                    comment.appendChild(menuMount);
                    try {
                        const menuInstance = new vue.$root.constructor(vue.$options);
                        if (typeof menuInstance.setIndex === "function") menuInstance.setIndex(startIndex + index);
                        if (typeof menuInstance.$mount === "function") menuInstance.$mount(menuMount);
                    } catch { }
                });
            };

            const load = async () => {
                if (!isEnabled || busy) return;
                const atBottom = document.documentElement.scrollHeight <= innerHeight + scrollY + profile.threshold;
                if (!atBottom) return;
                const nextUrl = ctx.$(profile.next)?.href;
                if (!nextUrl) return;

                busy = true;
                try {
                    const html = await net.get(nextUrl, {}, "text");
                    const doc = new DOMParser().parseFromString(html, "text/html");
                    blockByLevel(doc);

                    // 评论数据同步
                    if (ctx.isPost) {
                        const json = doc.getElementById("temp-script")?.textContent;
                        if (json) try {
                            const cfg = JSON.parse(decodeURIComponent(atob(json).split("").map(c => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join("")));
                            if (cfg?.postData?.comments) ctx.uw.__config__.postData.comments.push(...cfg.postData.comments);
                        } catch { }
                    }

                    const src = doc.querySelector(profile.list), dst = document.querySelector(profile.list);
                    if (src && dst) {
                        const appended = Array.from(src.children);
                        dst.append(...appended);
                        processCommentMenus(appended);
                    }

                    [profile.pagerTop, profile.pagerBot].forEach(sel => {
                        const s = doc.querySelector(sel), d = document.querySelector(sel);
                        if (s && d) d.innerHTML = s.innerHTML;
                    });

                    history.pushState(null, null, nextUrl);
                } catch (e) { ctx.env.error("autoLoading", e); }
                busy = false;
            };

            const deb = debounce(load, 300);
            addEventListener("scroll", throttle(() => { if (scrollY > prevY) deb(); prevY = scrollY; }, 200), { passive: true });

            document.addEventListener('click', e => {
                const a = e.target.closest('a');
                if (a && (a.classList.contains('pager-pos') || a.classList.contains('pager-prev') || a.classList.contains('pager-next') || a.closest('.nsk-pager'))) {
                    a.target = '_self';
                    e.stopImmediatePropagation();
                }
            }, true);
        }
    };

    const __vite_glob_0_1 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
        __proto__: null,
        default: autoLoading
    }, Symbol.toStringTag, { value: 'Module' }));


    /* ==========================================================================
       [ 🚫 过滤设置 ] - 关键字过滤 (帖子屏蔽)
       ========================================================================== */



    const blockPosts = {
        id: "blockPosts",
        order: 380,
        cfg: { block_posts: { enabled: true, highlight_color: "#fff9c4" } },
        meta: {
            block_posts: {
                label: "关键字管理", group: "🚫 过滤设置",
                fields: {
                    highlight_color: { type: "COLOR", label: "默认高亮色" }
                }
            }
        },
        match: ctx => (ctx.isList || ctx.isPost) && ctx.store.get("block_posts.enabled", true),
        init(ctx) {
            const keywordsKey = 'nsx_advanced_keywords';
            const getMap = () => { try { return JSON.parse(localStorage.getItem(keywordsKey) || '{}'); } catch { return {}; } };
            const saveMap = (map) => localStorage.setItem(keywordsKey, JSON.stringify(map));

            const runFilter = (els) => {
                const kws = getMap();
                const kwEntries = Object.entries(kws);
                if (!kwEntries.length) return;
                const hColor = ctx.store.get("block_posts.highlight_color", "#fff9c4");

                els.forEach(item => {
                    if (item.dataset.nsxKwProcessed) return;
                    const titleEl = item.querySelector(".post-title>a");
                    const title = titleEl?.textContent?.toLowerCase() || "";
                    if (!title) return;

                    let matchedColors = [];
                    let shouldHide = false;
                    let foldWords = [];

                    for (const [word, info] of kwEntries) {
                        const groupWords = String(word || "").split(/[，,]/).map(s => s.trim().toLowerCase()).filter(Boolean);
                        if (!groupWords.length) continue;
                        const hit = groupWords.some(w => title.includes(w));
                        if (!hit) continue;

                        if (info.type === 'highlight') {
                            matchedColors.push(info.color || "#fff9c4");
                        } else if (info.type === 'block') {
                            if (info.mode === 'hide') {
                                shouldHide = true;
                                break;
                            } else {
                                foldWords.push(word);
                            }
                        }
                    }

                    if (shouldHide) {
                        item.style.display = 'none';
                    } else if (foldWords.length > 0) {
                        item.classList.add('nsx-post-folded');
                        if (!item.querySelector('.nsx-fold-notice')) {
                            const notice = document.createElement('div');
                            notice.className = 'nsx-fold-notice';
                            notice.style.padding = '10px 15px';
                            const kwText = foldWords.map(w => w.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])).join(', ');
                            notice.innerHTML = `<span>已折叠包含关键词 [<b>${kwText}</b>] 的主题</span><span class="nsx-unfold-btn" style="text-decoration:underline;cursor:pointer">点此查看</span>`;
                            notice.querySelector('.nsx-unfold-btn').onclick = () => { item.classList.remove('nsx-post-folded'); notice.style.display = 'none'; };
                            item.prepend(notice);
                        }
                    } else if (matchedColors.length > 0) {
                        item.style.transition = "background-color 0.3s, background 0.3s";
                        if (matchedColors.length === 1) {
                            item.style.backgroundColor = matchedColors[0];
                        } else {
                            // 多个关键字冲突：使用线性渐变色
                            const uniqueColors = [...new Set(matchedColors)];
                            if (uniqueColors.length === 1) {
                                item.style.backgroundColor = uniqueColors[0];
                            } else {
                                item.style.background = `linear-gradient(90deg, ${uniqueColors.join(', ')})`;
                            }
                        }
                    }

                    if (shouldHide || foldWords.length > 0 || matchedColors.length > 0) {
                        item.dataset.nsxKwProcessed = "1";
                    }
                });
            };

            const reapplyKeywords = () => {
                const all = $$(".post-list-item");
                all.forEach(item => {
                    delete item.dataset.nsxKwProcessed;
                    item.style.display = "";
                    item.style.backgroundColor = "";
                    item.style.background = "";
                    item.style.transition = "";
                    item.classList.remove("nsx-post-folded");
                    item.querySelectorAll(".nsx-fold-notice").forEach(n => n.remove());
                });
                runFilter(all);
            };

            runFilter($$(".post-list-item"));
            ctx.watch(".post-list-item", els => runFilter(els), { debounce: 150 });
            window.__nsxRuntime ||= {};
            window.__nsxRuntime.reapplyKeywords = reapplyKeywords;

            // --- 独立的关键字面板逻辑 ---
            let kwPanel = null, kwTrigger = null, pState = { open: false, kw: "", tab: "block" };
            const head = ctx.$("#nsk-head");
            if (head) {
                const grp = ensureIconGroup();
                if (!grp) return;
                kwTrigger = document.createElement("div");
                kwTrigger.className = "filter-dropdown-on";
                kwTrigger.style.cssText = "";
                kwTrigger.innerHTML = `<svg viewBox="0 0 48 48" fill="none" style="width:17px;height:17px;color:currentColor;"><path d="M6 9L20.4 25.8178V38.4444L27.6 42V25.8178L42 9H6Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/></svg>`;
                kwTrigger.title = "关键字过滤管理";
                grp.appendChild(kwTrigger);

                const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

                const renderList = () => {
                    const map = getMap();
                    let list = Object.entries(map).map(([k, v]) => ({ word: k, ...v }));
                    if (pState.kw) list = list.filter(i => i.word.toLowerCase().includes(pState.kw));
                    list = list.filter(i => (pState.tab === 'highlight' ? i.type === 'highlight' : i.type !== 'highlight'));
                    list.sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));

                    kwPanel.querySelectorAll('.nsx-rel-tab').forEach(b => b.classList.toggle('is-active', b.dataset.t === pState.tab));
                    const lEl = kwPanel.querySelector(".nsx-rel-list");
                    if (!list.length) { lEl.innerHTML = `<div class="nsx-rel-empty">当前分组没有关键字</div>`; return; }

                    lEl.innerHTML = list.map(i => {
                        let iconColor = i.type === 'highlight' ? (i.color || "#ffb300") : "#9e9e9e";
                        return `<div class="nsx-rel-item">
                            <div class="nsx-rel-link">
                                <span class="nsx-rel-icon" style="color:white;background:${iconColor};opacity:0.8;font-size:14px;${i.type === 'highlight' ? 'border:1px solid rgba(0,0,0,0.1)' : ''}">#</span>
                                <div class="nsx-rel-info">
                                    <span class="nsx-rel-item-title" data-un="${esc(i.word)}">${esc(i.word)}</span>
                                    <span class="nsx-rel-remark" data-un="${esc(i.word)}">${i.type === 'highlight' ? '高亮 (颜色: ' + (i.color || "默认") + ')' : (i.mode === 'hide' ? '彻底隐藏' : '折叠展示')}（双击编辑）</span>
                                </div>
                            </div>
                            <span class="nsx-rel-time">${i.time ? i.time.split(' ')[0] : ''}</span>
                            <button class="nsx-rel-close" data-a="del" data-un="${esc(i.word)}">移除</button>
                        </div>`;
                    }).join("");
                };

                const openPanel = () => {
                    if (!kwPanel) {
                        kwPanel = document.createElement("div"); kwPanel.id = "nsx-filter-panel";
                        kwPanel.innerHTML = `
                                <div class="nsx-rel-header"><div class="nsx-rel-title">关键字过滤</div><div style="display:flex;gap:8px;"><button class="nsx-rel-action" data-a="add">➕ 新增</button><button class="nsx-rel-action" data-a="clear">清空当前组</button></div></div>
                                <div class="nsx-rel-search">🔍<input placeholder="搜索关键字与配置..."/></div>
                                <div class="nsx-rel-tabs"><button class="nsx-rel-tab is-active" data-t="block">🚫 屏蔽</button><button class="nsx-rel-tab" data-t="highlight">🎨 高亮</button></div>
                                <div class="nsx-rel-list"></div>
                            `;
                        document.body.appendChild(kwPanel);

                        kwPanel.querySelector("input").oninput = e => { pState.kw = e.target.value.toLowerCase(); renderList(); };
                        kwPanel.onclick = e => {
                            e.stopPropagation();
                            const t = e.target.closest('[data-t]');
                            if (t) { pState.tab = t.dataset.t; renderList(); return; }
                            const a = e.target.closest("[data-a]"); if (!a) return;
                            const act = a.dataset.a, un = a.dataset.un;

                            if (act === "clear") {
                                ctx.ui.confirm("清空列表?", `确定要删除当前分组（${pState.tab === 'highlight' ? '高亮' : '屏蔽'}）的关键字吗？`, () => {
                                    const map = getMap();
                                    Object.keys(map).forEach(k => {
                                        const it = map[k] || {};
                                        const isHighlight = it.type === 'highlight';
                                        if ((pState.tab === 'highlight' && isHighlight) || (pState.tab === 'block' && !isHighlight)) delete map[k];
                                    });
                                    saveMap(map); reapplyKeywords(); renderList(); ctx.ui.toast("已清空");
                                });
                            }
                            if (act === "del") {
                                const map = getMap(); delete map[un]; saveMap(map); reapplyKeywords(); renderList(); ctx.ui.toast("已移除");
                            }
                            if (act === "add") {
                                const html = `
                                        <style>
                                            .nsx-kw-form .layui-form-label{width:76px;padding-left:0}
                                            .nsx-kw-form .layui-input-block{margin-left:96px}
                                            .nsx-mobile .nsx-kw-form .layui-form-label{width:auto;float:none;text-align:left;padding:0 0 4px}
                                            .nsx-mobile .nsx-kw-form .layui-input-block{margin-left:0}
                                        </style>
                                        <div class="layui-form nsx-kw-form" style="padding:20px 20px 0;">
                                            <div class="layui-form-item"><label class="layui-form-label">关键字</label><div class="layui-input-block"><input type="text" id="nkw-v" class="layui-input" placeholder="输入词语（可用 , 分隔，同一组）"></div></div>
                                            <div class="layui-form-item"><label class="layui-form-label">类型</label><div class="layui-input-block"><select id="nkw-t" lay-filter="nkw-t-filter"><option value="block" ${pState.tab === 'block' ? 'selected' : ''}>🚫 屏蔽</option><option value="highlight" ${pState.tab === 'highlight' ? 'selected' : ''}>🎨 高亮</option></select></div></div>
                                            <div class="layui-form-item" id="nkw-m-box"><label class="layui-form-label">模式</label><div class="layui-input-block"><select id="nkw-m"><option value="fold">优雅折叠</option><option value="hide">彻底隐藏</option></select></div></div>
                                            <div class="layui-form-item" id="nkw-c-box" style="display:none;"><label class="layui-form-label">高亮颜色</label><div class="layui-input-block">
                                                <div id="nkw-color-picker"></div>
                                                <input type="hidden" id="nkw-c-val" value="#fff9c4">
                                            </div></div>
                                        </div>
                                    `;
                                ctx.ui.layer.open({
                                    title: '新增关键字', content: html, area: ['min(520px,94vw)', 'auto'], btn: ['添加', '取消'],
                                    success: (l) => {
                                        layui.use(['form', 'colorpicker'], function () {
                                            const form = layui.form;
                                            form.render('select');

                                            const syncTypeUI = (val) => {
                                                const isH = val === 'highlight';
                                                l.find('#nkw-m-box').toggle(!isH);
                                                l.find('#nkw-c-box').toggle(isH);
                                            };

                                            form.on('select(nkw-t-filter)', function (data) {
                                                syncTypeUI(data.value);
                                            });

                                            // 首次打开时根据默认选中项立即同步显示区域
                                            syncTypeUI(l.find('#nkw-t').val());

                                            layui.colorpicker.render({
                                                elem: '#nkw-color-picker',
                                                color: '#fff9c4',
                                                predefine: true,
                                                alpha: true,
                                                done: function (color) { l.find('#nkw-c-val').val(color); }
                                            });
                                        });
                                    },
                                    yes: (idx, l) => {
                                        const w = l.find('#nkw-v').val().trim();
                                        if (!w) return;
                                        const map = getMap();
                                        const type = l.find('#nkw-t').val();
                                        map[w] = {
                                            type,
                                            mode: type === 'block' ? l.find('#nkw-m').val() : null,
                                            color: type === 'highlight' ? l.find('#nkw-c-val').val() : null,
                                            time: new Date().toLocaleString()
                                        };
                                        saveMap(map); reapplyKeywords(); ctx.ui.layer.close(idx); renderList(); ctx.ui.toast("已添加");
                                    }
                                });
                            }
                        };
                        kwPanel.ondblclick = (e) => {
                            const target = e.target.closest('.nsx-rel-item-title,.nsx-rel-remark');
                            if (!target) return;
                            e.preventDefault();
                            e.stopPropagation();
                            const un = target.dataset.un;
                            const map = getMap();
                            const info = map[un];
                            if (!info) return;

                            const html = `
                                <style>
                                    .nsx-kw-form .layui-form-label{width:76px;padding-left:0}
                                    .nsx-kw-form .layui-input-block{margin-left:96px}
                                    .nsx-mobile .nsx-kw-form .layui-form-label{width:auto;float:none;text-align:left;padding:0 0 4px}
                                    .nsx-mobile .nsx-kw-form .layui-input-block{margin-left:0}
                                </style>
                                <div class="layui-form nsx-kw-form" style="padding:20px 20px 0;">
                                    <div class="layui-form-item"><label class="layui-form-label">关键字</label><div class="layui-input-block"><input type="text" id="nkw-e-v" class="layui-input" value="${esc(un)}" placeholder="可用 , 分隔，作为同一组"></div></div>
                                    <div class="layui-form-item"><label class="layui-form-label">类型</label><div class="layui-input-block"><select id="nkw-e-t" lay-filter="nkw-e-t-filter"><option value="block" ${info.type === 'highlight' ? '' : 'selected'}>🚫 屏蔽</option><option value="highlight" ${info.type === 'highlight' ? 'selected' : ''}>🎨 高亮</option></select></div></div>
                                    <div class="layui-form-item" id="nkw-e-m-box" style="${info.type === 'highlight' ? 'display:none;' : ''}"><label class="layui-form-label">模式</label><div class="layui-input-block"><select id="nkw-e-m"><option value="fold" ${info.mode === 'hide' ? '' : 'selected'}>优雅折叠</option><option value="hide" ${info.mode === 'hide' ? 'selected' : ''}>彻底隐藏</option></select></div></div>
                                    <div class="layui-form-item" id="nkw-e-c-box" style="${info.type === 'highlight' ? '' : 'display:none;'}"><label class="layui-form-label">高亮颜色</label><div class="layui-input-block"><div id="nkw-e-color-picker"></div><input type="hidden" id="nkw-e-c-val" value="${esc(info.color || '#fff9c4')}"></div></div>
                                </div>`;
                            ctx.ui.layer.open({
                                title: '编辑关键字', content: html, area: ['min(520px,94vw)', 'auto'], btn: ['保存', '取消'],
                                success: (l) => {
                                    layui.use(['form', 'colorpicker'], function () {
                                        const form = layui.form;
                                        form.render('select');
                                        form.on('select(nkw-e-t-filter)', function (data) {
                                            const isH = data.value === 'highlight';
                                            l.find('#nkw-e-m-box').toggle(!isH);
                                            l.find('#nkw-e-c-box').toggle(isH);
                                        });
                                        layui.colorpicker.render({ elem: '#nkw-e-color-picker', color: info.color || '#fff9c4', predefine: true, alpha: true, done: color => l.find('#nkw-e-c-val').val(color) });
                                    });
                                },
                                yes: (idx, l) => {
                                    const nw = l.find('#nkw-e-v').val().trim();
                                    if (!nw) return;
                                    const type = l.find('#nkw-e-t').val();
                                    delete map[un];
                                    map[nw] = { type, mode: type === 'block' ? l.find('#nkw-e-m').val() : null, color: type === 'highlight' ? l.find('#nkw-e-c-val').val() : null, time: new Date().toLocaleString() };
                                    saveMap(map); reapplyKeywords(); ctx.ui.layer.close(idx); renderList(); ctx.ui.toast('已更新');
                                }
                            });
                        };
                        document.addEventListener("click", e => {
                            const inLayer = !!e.target.closest('.layui-layer,.layui-layer-page,.layui-layer-dialog,.layui-colorpicker');
                            if (inLayer) return;
                            const hasTopLayer = !!document.querySelector('.layui-layer[style*="z-index"]');
                            if (hasTopLayer) return;
                            if (pState.open && !kwPanel.contains(e.target) && !kwTrigger.contains(e.target)) closePanel();
                        });
                    }
                    const r = kwTrigger.getBoundingClientRect();
                    kwPanel.style.top = `${r.bottom + 8}px`;
                    kwPanel.style.height = `${innerHeight - r.bottom - 16}px`;
                    kwPanel.style.right = ``;
                    renderList(); kwPanel.classList.add("show"); pState.open = true;
                };
                const closePanel = () => { kwPanel?.classList.remove("show"); pState.open = false; };
                window.__nsxPanelCtrl ||= {};
                window.__nsxPanelCtrl.filter = { close: closePanel, isOpen: () => pState.open };
                kwTrigger.onclick = e => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!pState.open) {
                        window.__nsxPanelCtrl.history?.close?.();
                        window.__nsxPanelCtrl.relation?.close?.();
                    }
                    pState.open ? closePanel() : openPanel();
                };
            }
        }
    };

    const __vite_glob_0_3 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
        __proto__: null,
        default: blockPosts
    }, Symbol.toStringTag, { value: 'Module' }));

    /* ==========================================================================
       [ 🚫 过滤设置 ] - 低等级可见内容屏蔽
       ========================================================================== */

    const mark$2 = new WeakSet();
    const run = (els, ctx) => {
        const lv = ctx.user?.rank || 0;
        els.forEach(el => {
            const item = el.closest(".post-list-item");
            if (!item || mark$2.has(item)) return;
            mark$2.add(item);
            const n = +(el.closest("span")?.textContent?.match(/\d+/)?.[0] || 0);
            if (n > lv) item.classList.add("blocked-post");
        });
    };

    const blockViewLevel = {
        id: "blockViewLevel",
        order: 222,
        cfg: { block_view_level: { enabled: true } },
        meta: { block_view_level: { label: "低等级内容屏蔽", group: "🚫 过滤设置" } },
        match: ctx => ctx.isList && ctx.store.get("block_view_level.enabled", true),
        init(ctx) { run($$('.post-list-item use[href="#lock"]'), ctx); },
        watch: ctx => ({ sel: '.post-list-item use[href="#lock"]', fn: els => run(els, ctx), opts: { debounce: 80 } })
    };

    const __vite_glob_0_4 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
        __proto__: null,
        default: blockViewLevel
    }, Symbol.toStringTag, { value: 'Module' }));

    /* ==========================================================================
       [ 🎨 视觉美化 ] - Callout 语法支持 (引述增强)
       ========================================================================== */

    const CSS_BASE = `.post-content blockquote{border-left:none;border-radius:4px;margin:1em 0;box-shadow:inset 4px 0 0 0 rgba(0,0,0,.1)}.callout{--c:8,109,221;overflow:hidden;border-radius:4px;margin:1em 0;padding:12px 12px 12px 24px!important;box-shadow:inset 4px 0 0 0 rgba(var(--c),.5)}.callout.is-collapsible .callout-title{cursor:pointer}.callout-title{display:flex;gap:4px;color:rgb(var(--c));line-height:1.3;align-items:flex-start}.callout-content{overflow-x:auto}.callout-icon{flex:0 0 auto;display:flex;align-items:center}.callout-icon .svg-icon,.callout-fold .svg-icon{color:rgb(var(--c));height:18px;width:18px}.callout-title-inner{font-weight:600}.callout-fold{display:flex;align-items:center;padding-inline-end:8px}.callout-fold .svg-icon{transition:transform .1s}.callout-fold.is-collapsed .svg-icon{transform:rotate(-90deg)}.callout.is-collapsed .callout-content{display:none}.callout[data-callout="abstract"],.callout[data-callout="summary"],.callout[data-callout="tldr"]{--c:83,223,221}.callout[data-callout="info"],.callout[data-callout="todo"]{--c:8,109,221}.callout[data-callout="tip"],.callout[data-callout="hint"],.callout[data-callout="important"]{--c:83,223,221}.callout[data-callout="success"],.callout[data-callout="check"],.callout[data-callout="done"]{--c:68,207,110}.callout[data-callout="question"],.callout[data-callout="help"],.callout[data-callout="faq"]{--c:236,117,0}.callout[data-callout="warning"],.callout[data-callout="caution"],.callout[data-callout="attention"]{--c:236,117,0}.callout[data-callout="failure"],.callout[data-callout="fail"],.callout[data-callout="missing"]{--c:233,49,71}.callout[data-callout="danger"],.callout[data-callout="error"]{--c:233,49,71}.callout[data-callout="bug"]{--c:233,49,71}.callout[data-callout="example"]{--c:120,82,238}.callout[data-callout="quote"],.callout[data-callout="cite"]{--c:158,158,158}.callout-inserter-wrapper{position:relative;display:inline-flex;align-items:center}.callout-inserter-btn{padding:0;border:none;background:0 0;cursor:pointer;display:flex;color:currentColor}.callout-inserter-btn:hover{opacity:.7}.callout-inserter-dropdown{position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:8px;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,.15);z-index:1000;min-width:160px;display:none;overflow:auto;max-height:240px;background:#fff;border:1px solid #e5e7eb}.dark-layout .callout-inserter-dropdown{background:#1f1f1f;border-color:#3a3a3a}.callout-inserter-dropdown.show{display:block}.callout-inserter-item{padding:8px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;font-size:13px;transition:background .15s}.callout-inserter-item:hover{background:#f5f5f5}.dark-layout .callout-inserter-item:hover{background:#2a2a2a}.callout-inserter-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}`;
    const CSS_COLORFUL = `.callout{background:rgba(var(--c),.1)}`;

    const ICONS = { note: "M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5zm-6.17-1.81 4 4", abstract: "M8 2h8v4H8zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M12 11h4M12 16h4M8 11h.01M8 16h.01", info: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 14v-4m0-4h.01", tip: "M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4", success: "M20 6 9 17l-5-5", question: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01", warning: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3M12 9v4m0 4h.01", failure: "M18 6 6 18M6 6l12 12", danger: "M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z", bug: "M12 20v-9m2-6a4 4 0 0 1 4 4v3a6 6 0 0 1-12 0v-3a4 4 0 0 1 4-4zM14.12 3.88 16 2M8 2l1.88 1.88M9 7.13V6a3 3 0 1 1 6 0v1.13", example: "M3 5h.01M3 12h.01M3 19h.01M8 5h13M8 12h13M8 19h13", quote: "M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2zM5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z", fold: "m6 9 6 6 6-6" };
    const TYPE_MAP = { summary: "abstract", tldr: "abstract", hint: "tip", important: "tip", check: "success", done: "success", help: "question", faq: "question", caution: "warning", attention: "warning", fail: "failure", missing: "failure", error: "danger", cite: "quote" };
    const MENUS = [{ k: "note", n: "笔记", c: "8,109,221" }, { k: "info", n: "信息", c: "8,109,221" }, { k: "tip", n: "提示", c: "83,223,221" }, { k: "warning", n: "警告", c: "236,117,0" }, { k: "danger", n: "危险", c: "233,49,71" }, { k: "success", n: "成功", c: "68,207,110" }, { k: "question", n: "问题", c: "236,117,0" }, { k: "example", n: "示例", c: "120,82,238" }];
    const svg = d => `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon"><path d="${d}"/></svg>`;
    const RE = /^\[!(\w+)\]([+-])?(?:\s+([^<\n]+))?(?:<br\s*\/?>)?([\s\S]*)$/i;

    const render = (els) => {
        els.forEach(bq => {
            if (bq.classList.contains("oc-done") || bq.closest("blockquote.oc-done")) return;
            bq.classList.add("oc-done");
            const p = bq.querySelector(":scope > p");
            const m = (p?.innerHTML?.trim() || "").match(RE);
            if (!m) return;
            const [, type, fold, title, content] = m;
            const t = type.toLowerCase(), base = TYPE_MAP[t] || t, icon = ICONS[base] || ICONS.note;
            const isColl = fold === "+" || fold === "-", isCol = fold === "-";
            const wrap = document.createElement("div");
            wrap.className = `callout${isColl ? " is-collapsible" : ""}${isCol ? " is-collapsed" : ""}`;
            wrap.dataset.callout = t;
            const titleEl = document.createElement("div");
            titleEl.className = "callout-title";
            titleEl.innerHTML = `<div class="callout-icon">${svg(icon)}</div><div class="callout-title-inner">${title?.trim() || type[0].toUpperCase() + type.slice(1)}</div>`;
            if (isColl) {
                const foldEl = document.createElement("div");
                foldEl.className = `callout-fold${isCol ? " is-collapsed" : ""}`;
                foldEl.innerHTML = svg(ICONS.fold);
                titleEl.appendChild(foldEl);
                titleEl.onclick = () => { wrap.classList.toggle("is-collapsed"); foldEl.classList.toggle("is-collapsed"); };
            }
            wrap.appendChild(titleEl);
            const cont = document.createElement("div");
            cont.className = "callout-content";
            if (content?.trim()) { const pp = document.createElement("p"); pp.innerHTML = content.trim(); cont.appendChild(pp); }
            let sib = p.nextSibling;
            while (sib) { const next = sib.nextSibling; cont.appendChild(sib); sib = next; }
            if (cont.childNodes.length) wrap.appendChild(cont);
            bq.replaceWith(wrap);
        });
    };

    const insertCallout = (editor, type) => {
        const cm = editor.querySelector(".CodeMirror")?.CodeMirror;
        if (!cm) return;
        const doc = cm.getDoc();
        let cur = doc.getCursor();
        const lvl = (doc.getLine(cur.line).match(/^(>\s*)+/)?.[0].match(/>/g) || []).length;
        if (lvl > 0) {
            let last = cur.line;
            for (let i = cur.line + 1; i < doc.lineCount(); i++) { if (doc.getLine(i).match(/^>\s*/)) last = i; else break; }
            cur = { line: last, ch: doc.getLine(last).length };
        }
        const pre = lvl > 0 ? ">".repeat(lvl + 1) + " " : "> ";
        doc.replaceRange((lvl > 0 ? "\n" : "") + `${pre}[!${type}] \n${pre}`, cur);
        doc.setCursor({ line: cur.line + (lvl > 0 ? 1 : 0), ch: `${pre}[!${type}] `.length });
        cm.focus();
    };

    let clickBound = false;
    const createInserter = () => {
        const editor = $(".md-editor");
        const bar = editor?.querySelector(".mde-toolbar");
        if (!editor || !bar) return;

        const cleanupManagedSeps = () => {
            bar.querySelectorAll(".nsx-callout-sep").forEach(s => s.remove());
        };

        const ensureSepBetween = (left, right) => {
            if (!left || !right) return;
            if (left.parentElement !== right.parentElement) return;
            let cur = left.nextElementSibling;
            while (cur && cur !== right) {
                const next = cur.nextElementSibling;
                if (cur.classList?.contains("sep")) cur.remove();
                cur = next;
            }
            if (cur !== right) return;

            const sep = document.createElement("div");
            sep.className = "sep nsx-callout-sep";
            right.before(sep);
        };

        const isMobile = document.documentElement.classList.contains("nsx-mobile");
        const quickReplyWrap = bar.querySelector(".nsx-quick-reply-wrap");
        const existedWrap = bar.querySelector(".callout-inserter-wrapper");
        const aiSep = bar.querySelector(".nsx-ai-sep");
        if (existedWrap) {
            cleanupManagedSeps();
            if (quickReplyWrap && quickReplyWrap !== existedWrap) {
                if (!isMobile) {
                    if (quickReplyWrap.previousElementSibling !== existedWrap) {
                        quickReplyWrap.before(existedWrap);
                    }
                    ensureSepBetween(existedWrap, quickReplyWrap);
                } else {
                    if (quickReplyWrap.nextElementSibling !== existedWrap) {
                        quickReplyWrap.after(existedWrap);
                    }
                    ensureSepBetween(quickReplyWrap, existedWrap);
                }
            } else if (!isMobile && aiSep) {
                if (aiSep.previousElementSibling !== existedWrap) {
                    aiSep.before(existedWrap);
                }
            }
            return;
        }

        const vAttr = [...(bar.querySelector(".toolbar-item")?.attributes || [])].find(a => a.name.startsWith("data-v-"))?.name;
        const setV = el => vAttr && el.setAttribute(vAttr, "");

        const wrap = document.createElement("span");
        wrap.className = "callout-inserter-wrapper toolbar-item";
        wrap.title = "Callout - NodeSeek Pro Max";
        setV(wrap);

        const btn = document.createElement("span");
        btn.className = "callout-inserter-btn i-icon";
        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 48 48" fill="none"><path d="M44 8H4v30h15l5 5 5-5h15V8Z" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 18v10" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><circle cx="24" cy="33" r="2" fill="currentColor"/></svg>`;
        setV(btn);

        const drop = document.createElement("div");
        drop.className = "callout-inserter-dropdown";
        MENUS.forEach(t => {
            const item = document.createElement("div");
            item.className = "callout-inserter-item";
            item.innerHTML = `<span class="callout-inserter-dot" style="background:rgb(${t.c})"></span>${t.n}[${t.k}]`;
            item.onclick = e => { e.stopPropagation(); insertCallout(editor, t.k); drop.classList.remove("show"); };
            drop.appendChild(item);
        });

        btn.onclick = e => { e.stopPropagation(); drop.classList.toggle("show"); };
        if (!clickBound) { document.addEventListener("click", () => $$(".callout-inserter-dropdown.show").forEach(d => d.classList.remove("show"))); clickBound = true; }

        const sep = document.createElement("div");
        sep.className = "sep nsx-callout-sep";
        setV(sep);
        wrap.append(btn, drop);

        if (quickReplyWrap) {
            if (!isMobile) {
                quickReplyWrap.before(wrap);
                ensureSepBetween(wrap, quickReplyWrap);
            } else {
                quickReplyWrap.after(wrap);
                ensureSepBetween(quickReplyWrap, wrap);
            }
        } else {
            const aiWrap = bar.querySelector(".nsx-ai-wrap");
            const aiSep = bar.querySelector(".nsx-ai-sep");
            if (aiSep) {
                aiSep.before(wrap);
            } else if (aiWrap) {
                const prev = aiWrap.previousElementSibling;
                if (prev?.classList?.contains("sep")) aiWrap.before(wrap);
                else aiWrap.before(sep, wrap);
            } else {
                const last = bar.lastElementChild;
                if (last?.classList?.contains("sep")) bar.append(wrap);
                else bar.append(sep, wrap);
            }
        }
    };

    const callout = {
        id: "callout",
        order: 360,
        cfg: { callout: { enabled: true, style: "colorful" } },
        meta: { callout: { label: "Callout 语法支持", group: "🎨 视觉美化", fields: { style: { type: "RADIO", label: "风格", options: [{ value: "colorful", text: "绚丽" }, { value: "clean", text: "清新" }] } } } },
        match: ctx => (ctx.isPost || /^\/new-discussion/.test(location.pathname)) && ctx.store.get("callout.enabled", true),
        init(ctx) {
            const style = ctx.store.get("callout.style", "colorful");
            addStyle("nsx-callout", CSS_BASE + (style === "colorful" ? CSS_COLORFUL : ""));
            render($$(".post-content blockquote"));
            createInserter();
            document.addEventListener("click", e => { if (e.target?.closest?.(".md-editor")) requestAnimationFrame(createInserter); });
        },
        watch: () => [{ sel: ".post-content blockquote", fn: render, opts: { debounce: 80 } }, { sel: ".mde-toolbar", fn: createInserter, opts: { debounce: 80 } }]
    };

    const __vite_glob_0_5 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
        __proto__: null,
        default: callout
    }, Symbol.toStringTag, { value: 'Module' }));

    // 代码高亮 + 复制按钮

    const CSS$4 = `.post-content pre{position:relative}.post-content pre span.copy-code{position:absolute;right:.5em;top:.5em;cursor:pointer;color:#c1c7cd}.post-content pre .iconpark-icon{width:16px;height:16px;margin:3px}.post-content pre .iconpark-icon:hover{color:var(--link-hover-color)}.dark-layout .post-content pre code.hljs{padding:1em!important}`;

    const mark$1 = new WeakSet();
    const addCopyBtn = (els, ctx) => {
        els.forEach(code => {
            if (mark$1.has(code)) return;
            mark$1.add(code);
            const btn = document.createElement("span");
            btn.className = "copy-code";
            btn.title = "复制代码";
            btn.innerHTML = `<svg class="iconpark-icon"><use href="#copy"></use></svg>`;
            btn.onclick = async () => {
                let ok = false;
                const text = code.textContent || "";
                try {
                    if (navigator.clipboard?.writeText) {
                        await navigator.clipboard.writeText(text);
                        ok = true;
                    }
                } catch { }

                if (!ok) {
                    try {
                        const sel = getSelection(), range = document.createRange();
                        range.selectNodeContents(code);
                        sel.removeAllRanges();
                        sel.addRange(range);
                        ok = document.execCommand("copy");
                        sel.removeAllRanges();
                    } catch { ok = false; }
                }

                if (ok) {
                    btn.querySelector("use")?.setAttribute("href", "#check");
                    setTimeout(() => btn.querySelector("use")?.setAttribute("href", "#copy"), 1000);
                    ctx.ui.tips?.("复制成功", btn, { tips: 4, time: 1000 });
                } else {
                    ctx.ui.warning?.("复制失败，请手动复制");
                }
            };
            code.after(btn);
        });
    };

    /* ==========================================================================
       [ 🎨 视觉美化 ] - 代码高亮 + 复制按钮
       ========================================================================== */
    const codeHighlight = {
        id: "codeHighlight",
        deps: ["ui"],
        order: 140,
        cfg: { code_highlight: { enabled: true } },
        meta: { code_highlight: { label: "代码高亮", group: "🎨 视觉美化" } },
        match: ctx => ctx.store.get("code_highlight.enabled", true),
        init(ctx) {
            addStyle("nsx-hl-css", CSS$4);
            addCopyBtn($$(".post-content pre code"), ctx);
        },
        watch: ctx => ({ sel: ".post-content pre code", fn: els => addCopyBtn(els, ctx), opts: { debounce: 80 } })
    };

    const __vite_glob_0_6 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
        __proto__: null,
        default: codeHighlight
    }, Symbol.toStringTag, { value: 'Module' }));

    /* ==========================================================================
       [ 🧭 辅助工具 ] - 快捷键回复 (Ctrl+Enter)
       ========================================================================== */
    const commentShortcut = {
        id: "commentShortcut",
        order: 135,
        cfg: { comment_shortcut: { enabled: true } },
        meta: { comment_shortcut: { label: "快捷键快捷回复", group: "🧭 辅助工具" } },
        match: ctx => ctx.isPost && ctx.store.get("comment_shortcut.enabled", true),
        init(ctx) {
            const getBtn = () => $(".md-editor button.submit.btn.focus-visible");
            $$(".CodeMirror").forEach(cmEl => {
                const cm = cmEl?.CodeMirror;
                if (!cm || cm.__nsx) return;
                cm.__nsx = true;
                const bind = () => {
                    const btn = getBtn();
                    if (btn && !/Ctrl\+Enter/i.test(btn.textContent)) btn.textContent += "(Ctrl+Enter)";
                    if (btn && !cm.__nsxMap) {
                        cm.__nsxMap = { "Ctrl-Enter": () => getBtn()?.click() };
                        cm.addKeyMap(cm.__nsxMap);
                    } else if (!btn && cm.__nsxMap) {
                        cm.removeKeyMap(cm.__nsxMap);
                        cm.__nsxMap = null;
                    }
                };
                bind();
                cmEl.addEventListener("focusin", bind, true);
                cmEl.addEventListener("focusout", bind, true);
            });
        }
    };

    const __vite_glob_0_7 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
        __proto__: null,
        default: commentShortcut
    }, Symbol.toStringTag, { value: 'Module' }));

    /* ==========================================================================
       [ 🧭 辅助工具 ] - 回复后停留在当前楼层（cid 新增）
       NodeSeek 原生编辑器发表评论成功后执行 location = redirect + redirectHash，
       会跳到最后一页的新楼层。这里在页面环境包一层 fetch，只改写
       /api/content/new-comment 成功响应里的 redirect/redirectHash，
       让页面刷新回当前所在页，再按回复前视口顶部的楼层恢复滚动位置。
       ========================================================================== */
    const REPLY_STAY_KEY = "nsx_reply_keep_floor";
    const REPLY_STAY_PAGE_SCRIPT = `(()=>{if(window.__nsxReplyKeep)return;window.__nsxReplyKeep=1;
const KEY=${JSON.stringify(REPLY_STAY_KEY)};const orig=window.fetch;
const pick=()=>{for(const el of document.querySelectorAll('.content-item[id]')){if(!/^\\d+$/.test(el.id))continue;const r=el.getBoundingClientRect();if(r.height>0&&r.bottom>0)return{floor:+el.id,offset:r.top};}return null;};
window.fetch=function(input,init){
const url=typeof input==='string'?input:(input&&input.url)||'';
if(document.documentElement.dataset.nsxReplyKeep!=='1'||!/\\/api\\/content\\/new-comment(?:[?#]|$)/.test(url))return orig.apply(this,arguments);
const anchor=pick(),scrollY=window.scrollY,path=location.pathname;
return orig.apply(this,arguments).then(async res=>{try{
const data=await res.clone().json();
if(!data||data.success!==true||typeof data.redirect!=='string')return res;
const m=/^\\/post-(\\d+)-(\\d+)/.exec(path);if(!m)return res;
const per=Number(window.__config__&&window.__config__.commmentPerPage)||10;
const page=anchor?(anchor.floor===0?1:Math.floor((anchor.floor-1)/per)+1):Number(m[2]);
const target='/post-'+m[1]+'-'+page;
sessionStorage.setItem(KEY,JSON.stringify({t:Date.now(),path:target,anchor,scrollY:target===path?scrollY:null,newUrl:data.redirect+(data.redirectHash||'')}));
const headers=new Headers(res.headers);headers.delete('content-length');
return new Response(JSON.stringify(Object.assign({},data,{redirect:target,redirectHash:''})),{status:res.status,statusText:res.statusText,headers});
}catch(e){return res;}});
};})();`;

    function readReplyStayRecord(path) {
        let rec = null;
        try { rec = JSON.parse(sessionStorage.getItem(REPLY_STAY_KEY) || "null"); } catch { }
        if (!rec) return null;
        sessionStorage.removeItem(REPLY_STAY_KEY);
        if (typeof rec.t !== "number" || Date.now() - rec.t > 2 * 60 * 1000 || rec.path !== path) return null;
        return rec;
    }

    function replyStayScrollTop(rec, doc = document, win = window) {
        const floor = rec?.anchor?.floor;
        const el = Number.isInteger(floor) ? doc.querySelector(`.content-item[id="${floor}"]`) : null;
        if (el) return Math.max(0, el.getBoundingClientRect().top + win.scrollY - (Number(rec.anchor.offset) || 0));
        return Number.isFinite(rec?.scrollY) ? rec.scrollY : null;
    }

    function restoreReplyStay(rec, ctx) {
        let stopped = false;
        const stop = () => { stopped = true; };
        ["wheel", "touchstart", "keydown", "mousedown"].forEach(t => window.addEventListener(t, stop, { once: true, passive: true, capture: true }));
        const apply = () => {
            if (stopped) return;
            const top = replyStayScrollTop(rec);
            if (top !== null && Math.abs(window.scrollY - top) > 2) window.scrollTo({ top, left: 0, behavior: "instant" });
        };
        try { history.scrollRestoration = "manual"; } catch { }
        apply();
        requestAnimationFrame(apply);
        [120, 400, 900, 1600].forEach(ms => setTimeout(apply, ms));
        if (document.readyState !== "complete") window.addEventListener("load", () => setTimeout(apply, 0), { once: true });
        setTimeout(() => { try { history.scrollRestoration = "auto"; } catch { } }, 2500);
        const hash = /#(\d+)$/.exec(rec.newUrl || "");
        if (rec.newUrl && !document.querySelector(`.content-item[id="${hash?.[1]}"]`)) {
            const tip = document.createElement("div");
            tip.id = "nsx-reply-stay-tip";
            tip.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:100000;padding:8px 14px;border-radius:8px;background:rgba(0,0,0,.78);color:#fff;font-size:13px;box-shadow:0 4px 16px #0003";
            const a = document.createElement("a");
            a.href = rec.newUrl;
            a.style.cssText = "color:#8dbdff;margin-left:8px";
            a.textContent = hash ? `查看 #${hash[1]} 楼` : "查看";
            tip.append("回复已发布，已停留在当前楼层", a);
            document.body.appendChild(tip);
            setTimeout(() => tip.remove(), 6000);
        }
    }

    const replyStay = {
        id: "replyStay",
        order: 136,
        cfg: { reply_keep_floor: { enabled: true } },
        meta: { reply_keep_floor: { label: "回复后停留在当前楼层（不跳到最后一楼）", group: "🧭 辅助工具" } },
        match: ctx => ctx.isPost,
        init(ctx) {
            const enabled = ctx.store.get("reply_keep_floor.enabled", true);
            document.documentElement.dataset.nsxReplyKeep = enabled ? "1" : "0";
            const rec = readReplyStayRecord(location.pathname);
            if (!enabled) return;
            addScript("nsx-reply-keep-floor", REPLY_STAY_PAGE_SCRIPT);
            if (rec) restoreReplyStay(rec, ctx);
        }
    };

    const __vite_glob_0_cid_replyStay = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
        __proto__: null,
        default: replyStay
    }, Symbol.toStringTag, { value: 'Module' }));


    /* ==========================================================================
       [ 🎨 视觉美化 ] - 深色模式同步系统
       ========================================================================== */
    const darkMode = {
        id: "darkMode",
        order: 180,
        cfg: { dark_mode_sync: { enabled: true } },
        meta: { dark_mode_sync: { label: "深色模式皮肤同步", group: "🎨 视觉美化" } },
        init(ctx) {
            const body = document.body;
            if (!body) return;
            const lightHl = GM_getResourceURL("highlightStyle");
            const darkHl = GM_getResourceURL("highlightStyle_dark");

            const apply = () => {
                const dark = body.classList.contains("dark-layout");
                // 为 html 添加/移除 .dark 类以触发 layui 深色主题
                document.documentElement.classList.toggle("dark", dark);
                // 切换 highlight.js 样式（同时移除 start() 中注入的初始样式避免冲突）
                document.getElementById("hightlight-style")?.remove();
                document.getElementById("nsx-hl")?.remove();
                addStyle("nsx-hl", dark ? darkHl : lightHl);
            };
            apply();
            new MutationObserver(() => apply()).observe(body, { attributes: true, attributeFilter: ["class"] });
        }
    };

    const __vite_glob_0_8 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
        __proto__: null,
        default: darkMode
    }, Symbol.toStringTag, { value: 'Module' }));

    // 浏览历史

    const CSS$3 = `.nsx-history-header{display:flex;align-items:center;justify-content:space-between;padding:12px 12px 6px}.nsx-history-title{font-size:15px;font-weight:600}.nsx-history-action{border:0;background:0;color:#666;cursor:pointer;font-size:12px;padding:4px 8px;border-radius:6px}.nsx-history-action:hover{background:#f2f3f5}.nsx-history-search{display:flex;align-items:center;gap:6px;margin:0 12px 8px;border:1px solid #e1e1e1;border-radius:8px;padding:6px 8px}.nsx-history-search input{border:0;background:0;outline:0;width:100%;font-size:13px}.nsx-history-tabs{display:flex;gap:16px;padding:0 12px 6px;border-bottom:1px solid #f0f0f0}.nsx-history-tab{border:0;background:0;cursor:pointer;color:#6b6b6b;font-size:12px;padding:6px 0;font-weight:600;border-bottom:2px solid transparent}.nsx-history-tab.is-active{color:#0a62ff;border-bottom-color:#0a62ff}.nsx-history-list{flex:1;overflow-y:auto;padding:6px 8px 12px}.nsx-history-group{margin-bottom:10px}.nsx-history-group-title{display:flex;align-items:center;justify-content:space-between;padding:4px;color:#666;font-size:12px}.nsx-history-items{list-style:none;margin:0;padding:0}.nsx-history-item{display:flex;align-items:center;gap:8px;padding:6px;border-radius:8px}.nsx-history-item:hover{background:#f5f7fb}.nsx-history-link{display:flex;align-items:center;gap:8px;flex:1;min-width:0;text-decoration:none;color:inherit}.nsx-history-icon{width:20px;height:20px;border-radius:50%;background:#f0f0f0;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0}.nsx-history-icon img{width:100%;height:100%;object-fit:cover}.nsx-history-item-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.nsx-history-time{color:#9a9a9a;font-size:12px;margin-left:auto}.nsx-history-empty{padding:10px 6px;color:#999;font-size:12px}.nsx-history-close,.nsx-history-restore{border:0;background:0;cursor:pointer;font-size:12px;padding:2px 4px;border-radius:6px;display:none}.nsx-history-close{color:#999}.nsx-history-restore{color:#0a62ff}.nsx-history-item:hover .nsx-history-time{display:none}.nsx-history-item:hover .nsx-history-close,.nsx-history-item:hover .nsx-history-restore{display:block}.nsx-history-group-title .nsx-history-close{display:block;opacity:.9}.nsx-history-close:hover{color:#ff4d4f}.nsx-history-restore:hover{background:#eef3ff}.dark-layout .nsx-history-action{color:#999}.dark-layout .nsx-history-action:hover{background:#2a2a2a}.dark-layout .nsx-history-search{border-color:#3a3a3a}.dark-layout .nsx-history-search input{color:#e0e0e0}.dark-layout .nsx-history-tabs{border-bottom-color:#3a3a3a}.dark-layout .nsx-history-tab{color:#999}.dark-layout .nsx-history-group-title{color:#888}.dark-layout .nsx-history-item:hover{background:#2a2a2a}.dark-layout .nsx-history-icon{background:#3a3a3a}.dark-layout .nsx-history-time{color:#666}.dark-layout .nsx-history-empty{color:#666}`;

    const HKEY = "nsx_browsing_history", RKEY = "nsx_recently_closed";

    const pad = n => String(n).padStart(2, "0");
    const fmtDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const fmtTime = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const now = () => new Date().toISOString();
    const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

    /* ==========================================================================
       [ 🧭 辅助工具 ] - 浏览历史记录 (右侧面板)
       ========================================================================== */
    const history$1 = {
        id: "history",
        order: 400,
        cfg: { history: { enabled: true, limit: 100, days: 7 } },
        meta: { history: { label: "浏览历史记录", group: "🧭 辅助工具", fields: { limit: { type: "NUMBER", label: "保存上限", valueType: "number" }, days: { type: "NUMBER", label: "保存天数", valueType: "number" } } } },
        match: ctx => (ctx.isPost || ctx.isList) && ctx.store.get("history.enabled", true),
        init(ctx) {
            let maxItems = ctx.store.get("history.limit", 100) || 100;
            let maxAge = (ctx.store.get("history.days", 7) || 7) * 864e5;

            const prune = arr => {
                const t = Date.now();
                return (arr || []).filter(i => t - new Date(i.time).getTime() < maxAge).sort((a, b) => new Date(a.time) - new Date(b.time)).slice(-maxItems);
            };
            const load = k => { try { const r = JSON.parse(localStorage.getItem(k) || "[]"); const n = prune(r); if (n.length !== r.length) localStorage.setItem(k, JSON.stringify(n)); return n; } catch { return []; } };
            const save = (k, a) => localStorage.setItem(k, JSON.stringify(prune(a)));
            const getH = () => load(HKEY), saveH = a => save(HKEY, a);
            const getR = () => load(RKEY), saveR = a => save(RKEY, a);

            // 使用 postData 获取帖子信息
            const add = (pd, list, saveFn) => {
                if (!pd?.postId) return;
                const id = pd.postId;
                const h = list(), i = h.findIndex(x => x.postId === id);
                const e = { postId: id, title: pd.title || document.title, time: now(), uid: pd.op?.uid || null, author: pd.op?.name || null };
                i > -1 ? Object.assign(h[i], e) : h.push(e);
                saveFn(h);
            };

            addStyle("nsx-hist", CSS$3);
            let panel = null, trigger = null, state = { open: false, tab: "all", kw: "" };

            const head = $("#nsk-head");
            if (!head) return;
            const grp = ensureIconGroup();
            if (!grp) return;
            trigger = document.createElement("div");
            trigger.className = "history-dropdown-on";
            trigger.title = "历史记录";
            trigger.innerHTML = `<svg class="iconpark-icon" style="width:17px;height:17px"><use href="#history"></use></svg>`;
            grp.appendChild(trigger);

            const fmtDayTitle = day => {
                const d = new Date(`${day}T00:00:00`);
                const title = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${WEEK[d.getDay()]}`;
                return day === fmtDate(new Date()) ? `今天 - ${title}` : title;
            };

            const open = () => {
                if (!panel) {
                    panel = document.createElement("div");
                    panel.id = "nsx-history-panel";
                    panel.innerHTML = `<div class="nsx-history-header"><div class="nsx-history-title">历史记录</div><button class="nsx-history-action" data-a="clear">清空</button></div><div class="nsx-history-search">🔍<input placeholder="搜索"/></div><div class="nsx-history-tabs"><button class="nsx-history-tab is-active" data-t="all">全部</button><button class="nsx-history-tab" data-t="recent">最近关闭</button></div><div class="nsx-history-list"></div>`;
                    document.body.appendChild(panel);
                    panel.querySelector("input").oninput = e => { state.kw = e.target.value.toLowerCase(); render(); };
                    panel.onclick = e => {
                        e.stopPropagation();
                        const t = e.target.closest("[data-t]");
                        if (t) { state.tab = t.dataset.t; render(); return; }
                        const a = e.target.closest("[data-a]");
                        if (!a) return;
                        const act = a.dataset.a, id = a.dataset.id;
                        if (act === "clear") ctx.ui.confirm("确认", "确定要清空所有记录吗？", () => { localStorage.removeItem(state.tab === "recent" ? RKEY : HKEY); render(); });
                        if (act === "del") { state.tab === "recent" ? saveR(getR().filter(x => x.postId != id)) : saveH(getH().filter(x => x.postId != id)); render(); }
                        if (act === "clear-day") { const key = state.tab === "recent" ? RKEY : HKEY; save(key, load(key).filter(i => fmtDate(new Date(i.time)) !== a.dataset.day)); render(); }
                        if (act === "restore") window.open(`/post-${id}-1`, "_blank");
                    };
                    document.addEventListener("click", e => { if (state.open && !panel.contains(e.target) && !trigger.contains(e.target)) close(); });
                    document.addEventListener("keydown", e => { if (state.open && e.key === "Escape") close(); });
                }
                const r = trigger.getBoundingClientRect();
                panel.style.top = `${r.bottom + 8}px`;
                panel.style.height = `${innerHeight - r.bottom - 16}px`;
                render();
                panel.classList.add("show");
                state.open = true;
            };
            const close = () => { panel?.classList.remove("show"); state.open = false; };
            window.__nsxPanelCtrl ||= {};
            window.__nsxPanelCtrl.history = { close, isOpen: () => state.open };
            const toggle = () => state.open ? close() : open();

            const render = () => {
                let list = (state.tab === "recent" ? getR() : getH()).sort((a, b) => new Date(b.time) - new Date(a.time));
                if (state.kw) list = list.filter(i => (i.title || "").toLowerCase().includes(state.kw));
                panel.querySelectorAll(".nsx-history-tab").forEach(b => b.classList.toggle("is-active", b.dataset.t === state.tab));
                const lEl = panel.querySelector(".nsx-history-list");
                if (!list.length) { lEl.innerHTML = `<div class="nsx-history-empty">暂无记录</div>`; return; }
                const g = {};
                list.forEach(i => { const d = fmtDate(new Date(i.time)); (g[d] ||= []).push(i); });
                lEl.innerHTML = Object.entries(g).map(([day, items]) => {
                    const itemsHtml = items.map(i => {
                        if (!i.postId) return "";
                        const url = `/post-${i.postId}-1`;
                        const avatar = i.uid ? `<img src="/avatar/${i.uid}.png" onerror="this.style.display='none'">` : "";
                        const restore = state.tab === "recent" ? `<button class="nsx-history-restore" data-a="restore" data-id="${i.postId}" title="恢复">↗</button>` : "";
                        return `<li class="nsx-history-item"><a class="nsx-history-link" href="${url}"><span class="nsx-history-icon"${i.author ? ` title="@${esc(i.author)}"` : ""}>${avatar}</span><span class="nsx-history-item-title">${esc((i.title || "").slice(0, 32))}</span></a><span class="nsx-history-time">${fmtTime(new Date(i.time))}</span>${restore}<button class="nsx-history-close" data-a="del" data-id="${i.postId}">✖</button></li>`;
                    }).join("");
                    return `<div class="nsx-history-group"><div class="nsx-history-group-title"><span>${fmtDayTitle(day)}</span><button class="nsx-history-close" data-a="clear-day" data-day="${day}" title="清除当天">✕</button></div><ul class="nsx-history-items">${itemsHtml}</ul></div>`;
                }).join("");
            };

            trigger.onclick = e => {
                e.preventDefault();
                e.stopPropagation();
                if (!state.open) {
                    window.__nsxPanelCtrl.filter?.close?.();
                    window.__nsxPanelCtrl.relation?.close?.();
                }
                toggle();
            };

            // 记录当前页面
            const pd = ctx.uw?.__config__?.postData;
            if (pd) add(pd, getH, saveH);

            // 监听页面关闭
            addEventListener("beforeunload", () => {
                const pd = ctx.uw?.__config__?.postData;
                if (pd) add(pd, getR, saveR);
            }, { capture: true });

            window.__nsxRuntime ||= {};
            window.__nsxRuntime.refreshHistory = () => {
                maxItems = ctx.store.get("history.limit", 100) || 100;
                maxAge = (ctx.store.get("history.days", 7) || 7) * 864e5;
                const h = prune(getH());
                const r = prune(getR());
                localStorage.setItem(HKEY, JSON.stringify(h));
                localStorage.setItem(RKEY, JSON.stringify(r));
                if (panel && state.open) render();
            };
        }
    };

    const __vite_glob_0_9 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
        __proto__: null,
        default: history$1
    }, Symbol.toStringTag, { value: 'Module' }));

    /* ==========================================================================
       [ 🎨 视觉美化 ] - 图片沉浸预览 (灯箱效果)
       ========================================================================== */
    // 图片预览

    const mark = new WeakSet();
    const bind = (els, ctx) => {
        els.forEach(img => {
            const post = img.closest("article.post-content");
            if (!post || mark.has(img)) return;
            mark.add(img);
            const newImg = img.cloneNode(true);
            img.replaceWith(newImg);
            mark.add(newImg);
            newImg.addEventListener("click", e => {
                e.preventDefault();
                const imgs = [...post.querySelectorAll("img:not(.sticker)")];
                const data = imgs.map((x, i) => ({ alt: x.alt, pid: i + 1, src: x.src }));
                ctx.ui.layer?.photos({ photos: { title: "图片预览", start: imgs.indexOf(newImg), data } });
            }, true);
        });
    };

    const imageSlide = {
        id: "imageSlide",
        deps: ["ui"],
        order: 160,
        cfg: { image_slide: { enabled: true } },
        meta: { image_slide: { label: "图片沉浸预览", group: "🎨 视觉美化" } },
        match: ctx => ctx.isPost && ctx.store.get("image_slide.enabled", true),
        init(ctx) { bind($$("article.post-content img:not(.sticker)"), ctx); },
        watch: ctx => ({ sel: "article.post-content img:not(.sticker)", fn: els => bind(els, ctx), opts: { debounce: 80 } })
    };

    const __vite_glob_0_10 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
        __proto__: null,
        default: imageSlide
    }, Symbol.toStringTag, { value: 'Module' }));

    /* ==========================================================================
       [ 🧭 辅助工具 ] - 网页预加载 (Instant Page)
       ========================================================================== */
    const instantPage = {
        id: "instantPage",
        order: 320,
        cfg: { instant_page: { enabled: true } },
        meta: { instant_page: { label: "鼠标悬停预加载", group: "🧭 辅助工具" } },
        match: ctx => ctx.store.get("instant_page.enabled", true),
        init(ctx) {
            const done = new Set();
            const inflight = new Set();
            document.body.addEventListener("mouseover", e => {
                const a = e.target.closest("a");
                if (!a?.href?.startsWith(`${location.origin}/post-`) || done.has(a.href) || inflight.has(a.href)) return;
                setTimeout(() => {
                    if (!a.matches(":hover") || done.has(a.href) || inflight.has(a.href)) return;
                    const link = document.createElement("link");
                    link.rel = "prefetch";
                    link.href = a.href;
                    inflight.add(a.href);
                    const clear = () => {
                        done.add(a.href);
                        inflight.delete(a.href);
                        link.remove();
                    };
                    link.addEventListener("load", clear, { once: true });
                    link.addEventListener("error", clear, { once: true });
                    document.head.appendChild(link);
                    setTimeout(clear, 5000);
                }, 65);
            }, { passive: true });
        }
    };

    const __vite_glob_0_11 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
        __proto__: null,
        default: instantPage
    }, Symbol.toStringTag, { value: 'Module' }));

    // 等级标签已被移除
    const levelTag = {
        id: "levelTag",
        cfg: {},
        meta: {},
        match: ctx => false,
        init: () => { }
    };

    const __vite_glob_0_12 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
        __proto__: null,
        default: levelTag
    }, Symbol.toStringTag, { value: 'Module' }));

    /* ==========================================================================
       [ 系统核心 ] - 设置菜单 (高级设置面板)
       ========================================================================== */
    // 菜单系统（油猴菜单 + 高级设置面板）

    const CSS$1 = `#nsx-config-menu{height:100%;overflow-y:visible;border-right:1px solid #eee}#nsx-config-content{height:100%;overflow-y:auto;padding:0 15px;background:#f8f8f8}.nsx-config-card{margin-bottom:20px}.nsx-config-card .layui-card-header{display:flex;align-items:center;justify-content:space-between;font-weight:700}.nsx-config-card .header-checkbox{position:absolute;right:15px;top:50%;transform:translateY(-50%)}.nsx-config-card .layui-form-switch{margin-top:0!important}.nsx-config-card .layui-card-body:empty{padding-top:0;padding-bottom:0}.nsx-config-card .layui-form-label{width:110px!important;padding:9px 10px!important}.nsx-config-card .layui-input-block{margin-left:140px!important}.nsx-config-tools{display:flex;gap:10px;flex-wrap:wrap}.nsx-config-tools .layui-btn{min-width:120px}.nsx-config-tools-tip{margin-top:10px;font-size:12px;color:#888;line-height:1.6}.dark-layout #nsx-config-menu{border-right-color:#3a3a3a}.dark-layout #nsx-config-content{background:#1e1e1e}.dark-layout .nsx-config-tools-tip{color:#999}`;

    const el = (t, c, p, s) => { const e = document.createElement(t); if (c) e.className = c; if (s) e.style.cssText = s; if (p) p.appendChild(e); return e; };
    const BACKUP_SCHEMA_VERSION = 2;
    const BACKUP_LOCAL_KEYS = [
        "nsx_advanced_keywords",
        "nsx_browsing_history",
        "nsx_recently_closed",
        "nodeseek_quick_reply",
        "nodeseek_quick_reply_auto_submit",
        "nsx_advanced_friends",
        "nsx_advanced_blacklist",
        "nsx_visited_posts"
    ];
    const BACKUP_PLAIN_STRING_KEYS = new Set(["nodeseek_quick_reply_auto_submit"]);
    const BACKUP_NS_PREFERENCE_DB = "ns-preference-db";
    const BACKUP_NS_PREFERENCE_STORE = "ns-preference-store";
    const cloneData = v => {
        try { return JSON.parse(JSON.stringify(v)); } catch { return v; }
    };
    const normalizeSettingsForBackup = (settings) => {
        const normalized = cloneData(settings || {});
        merge(normalized, store.getDefaults());
        normalized.version = store.getDefaults().version;
        return normalized;
    };
    const readBackupLocalValue = key => {
        const raw = localStorage.getItem(key);
        if (raw == null) return null;
        if (BACKUP_PLAIN_STRING_KEYS.has(key)) return raw;
        try { return JSON.parse(raw); } catch { return raw; }
    };
    const writeBackupLocalValue = (key, value) => {
        if (value == null) localStorage.removeItem(key);
        else if (BACKUP_PLAIN_STRING_KEYS.has(key)) localStorage.setItem(key, String(value));
        else localStorage.setItem(key, JSON.stringify(value));
    };
    const readNsPreferenceConfig = () => new Promise(resolve => {
        try {
            const req = indexedDB.open(BACKUP_NS_PREFERENCE_DB);
            req.onerror = () => resolve(null);
            req.onupgradeneeded = () => resolve(null);
            req.onsuccess = e => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(BACKUP_NS_PREFERENCE_STORE)) {
                    db.close();
                    return resolve(null);
                }
                const tx = db.transaction(BACKUP_NS_PREFERENCE_STORE, "readonly");
                const store = tx.objectStore(BACKUP_NS_PREFERENCE_STORE);
                const getReq = store.get("configuration");
                getReq.onerror = () => { db.close(); resolve(null); };
                getReq.onsuccess = () => {
                    const cfg = getReq.result;
                    db.close();
                    resolve(cfg && typeof cfg === "object" ? cloneData(cfg) : null);
                };
            };
        } catch {
            resolve(null);
        }
    });
    const writeNsPreferenceConfig = (config) => new Promise(resolve => {
        try {
            const req = indexedDB.open(BACKUP_NS_PREFERENCE_DB);
            req.onerror = () => resolve(false);
            req.onsuccess = e => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(BACKUP_NS_PREFERENCE_STORE)) {
                    db.close();
                    return resolve(false);
                }
                const tx = db.transaction(BACKUP_NS_PREFERENCE_STORE, "readwrite");
                const store = tx.objectStore(BACKUP_NS_PREFERENCE_STORE);
                const putReq = store.put(config || {}, "configuration");
                putReq.onerror = () => { db.close(); resolve(false); };
                putReq.onsuccess = () => { db.close(); resolve(true); };
            };
            req.onupgradeneeded = e => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(BACKUP_NS_PREFERENCE_STORE)) {
                    db.createObjectStore(BACKUP_NS_PREFERENCE_STORE);
                }
            };
        } catch {
            resolve(false);
        }
    });
    const createBackupPayload = async () => ({
        format: "nsx-backup",
        schemaVersion: BACKUP_SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        scriptVersion: info.version,
        data: {
            settings: normalizeSettingsForBackup(store.init()),
            localStorage: BACKUP_LOCAL_KEYS.reduce((acc, key) => {
                const value = readBackupLocalValue(key);
                if (value !== null) acc[key] = cloneData(value);
                return acc;
            }, {}),
            indexedDB: {
                nsPreferenceConfiguration: await readNsPreferenceConfig()
            }
        }
    });
    const isValidBackupPayload = payload => {
        if (!payload || typeof payload !== "object") return false;
        if (payload.format !== "nsx-backup") return false;
        if (!payload.data || typeof payload.data !== "object") return false;
        if (!payload.data.settings || typeof payload.data.settings !== "object" || Array.isArray(payload.data.settings)) return false;
        const ls = payload.data.localStorage;
        if (!(ls === undefined || (ls && typeof ls === "object" && !Array.isArray(ls)))) return false;
        const idb = payload.data.indexedDB;
        return idb === undefined || (idb && typeof idb === "object" && !Array.isArray(idb));
    };
    const applyBackupPayload = async (payload) => {
        const importedSettings = normalizeSettingsForBackup(payload?.data?.settings || {});
        const importedLs = payload?.data?.localStorage || {};
        const importedIdb = payload?.data?.indexedDB || {};
        const schemaVersion = Number(payload?.schemaVersion || 1);
        const shouldClearMissingLocalKeys = schemaVersion >= BACKUP_SCHEMA_VERSION;
        cfgCache = null;
        GM_setValue("settings", importedSettings);
        BACKUP_LOCAL_KEYS.forEach(key => {
            if (Object.prototype.hasOwnProperty.call(importedLs, key)) writeBackupLocalValue(key, importedLs[key]);
            else if (shouldClearMissingLocalKeys) localStorage.removeItem(key);
        });
        if (Object.prototype.hasOwnProperty.call(importedIdb, "nsPreferenceConfiguration") && importedIdb.nsPreferenceConfiguration && typeof importedIdb.nsPreferenceConfiguration === "object") {
            await writeNsPreferenceConfig(importedIdb.nsPreferenceConfiguration);
        } else if (schemaVersion >= 2) {
            await writeNsPreferenceConfig({ openPostInNewPage: !!importedSettings?.open_post_in_new_tab?.enabled });
        }
        cfgCache = null;
    };
    const downloadBackupFile = payload => {
        const stamp = new Date().toISOString().replace(/[:T]/g, "-").replace(/\..+/, "");
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `NSX_Pro_backup_${stamp}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    const menus = {
        id: "menus",
        deps: ["ui"],
        order: 30,
        cfg: { open_post_in_new_tab: { enabled: false } },
        meta: { open_post_in_new_tab: { label: "新标签页打开帖子", group: "🧭 辅助工具" } },
        match: () => true,
        init(ctx) {
            const uw = ctx.uw, code = ctx.site?.code || "ns";
            const reSign = () => {
                if (!ctx.loggedIn || store.get(`sign_in.${code}.enabled`, true) === false) return ctx.ui.alert("提示", "签到已关闭");
                store.set(`sign_in.${code}.last_date`, "1753/1/1");
                nsxReloadPage();
            };

            const exportConfig = async () => {
                try {
                    const payload = await createBackupPayload();
                    downloadBackupFile(payload);
                    ctx.ui.success?.("配置已导出");
                } catch (e) {
                    env.error("Export config failed", e);
                    ctx.ui.error?.("导出失败，请稍后重试");
                }
            };

            const importConfig = () => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = "application/json,.json";
                input.style.display = "none";
                input.onchange = () => {
                    const file = input.files?.[0];
                    if (!file) return input.remove();
                    const reader = new FileReader();
                    reader.onload = () => {
                        try {
                            const payload = JSON.parse(String(reader.result || ""));
                            if (!isValidBackupPayload(payload)) throw new Error("备份文件格式不正确");
                            const proceed = async () => {
                                try {
                                    await applyBackupPayload(payload);
                                    ctx.ui.success?.("配置已还原，页面即将刷新");
                                    setTimeout(() => nsxReloadPage(), 600);
                                } catch (e) {
                                    env.error("Import config apply failed", e);
                                    ctx.ui.error?.("还原失败，请检查备份文件");
                                }
                            };
                            const msg = "将覆盖当前脚本设置、关键词、浏览历史、快捷回复和社交关系数据，是否继续？";
                            if (window.confirm(msg)) proceed();
                        } catch (e) {
                            env.error("Import config parse failed", e);
                            ctx.ui.error?.(e?.message || "备份文件解析失败");
                        } finally {
                            input.remove();
                        }
                    };
                    reader.onerror = () => {
                        input.remove();
                        ctx.ui.error?.("读取备份文件失败");
                    };
                    reader.readAsText(file, "utf-8");
                };
                document.body.appendChild(input);
                input.click();
            };

            const bindBackupTools = (root) => {
                for (const [action, callback] of [
                    ['retry-sign', reSign],
                    ['feedback', () => GM_openInTab('https://greasyfork.org/zh-CN/scripts/567109/feedback', { active: true, insert: true, setParent: true })]
                ]) {
                    const button = root?.querySelector?.(`[data-nsx-action="${action}"]`);
                    if (button && !button.dataset.nsxBound) {
                        button.dataset.nsxBound = '1';
                        button.addEventListener('click', event => { event.preventDefault(); callback(); });
                    }
                }
                const exportBtn = root?.querySelector?.("[data-nsx-action='export-config']");
                const importBtn = root?.querySelector?.("[data-nsx-action='import-config']");
                if (exportBtn && !exportBtn.dataset.nsxBound) {
                    exportBtn.dataset.nsxBound = "1";
                    exportBtn.addEventListener("click", e => {
                        e.preventDefault();
                        exportConfig();
                    });
                }
                if (importBtn && !importBtn.dataset.nsxBound) {
                    importBtn.dataset.nsxBound = "1";
                    importBtn.addEventListener("click", e => {
                        e.preventDefault();
                        importConfig();
                    });
                }
            };

            const advSettings = () => {
                if (!ctx.ui.layer || !window.layui) return;
                addStyle("nsx-cfg", CSS$1);

                // 获取所有模块的 cfg 和 meta
                const defs = store.getDefaults(), metas = store.getMeta();
                const ignore = new Set(["version", "debug", "ui"]);

                // 建立 meta key 到 order 的映射关系
                const metaToOrder = new Map();
                modules.forEach(m => {
                    if (m.meta) {
                        Object.keys(m.meta).forEach(k => metaToOrder.set(k, m.order || 999));
                    }
                });

                // 获取所有设置条目并附加 order
                const entries = Object.entries(metas)
                    .filter(([k]) => defs[k] && !ignore.has(k))
                    .map(([k, m]) => ({
                        key: k,
                        meta: m,
                        order: metaToOrder.get(k) || 999
                    }));

                // 核心：按照 order 从小到大排序
                entries.sort((a, b) => a.order - b.order);

                const groups = {};
                const groupOrder = []; // 记录分组出现的先后顺序
                entries.forEach(e => {
                    const g = e.meta.group || "其他设置";
                    if (!groups[g]) {
                        groups[g] = [];
                        groupOrder.push(g);
                    }
                    groups[g].push(e);
                });

                const cont = document.createElement("div");
                cont.className = "layui-row";
                cont.style.cssText = "display:flex;height:100%";
                const menuDiv = el("div", "layui-panel layui-col-xs3", cont);
                menuDiv.id = "nsx-config-menu";
                const menuList = el("ul", "layui-menu", menuDiv);
                const wrapper = el("div", "layui-col-xs9", cont);
                wrapper.id = "nsx-config-content";

                const isObj = v => v && typeof v === "object" && !Array.isArray(v);
                const inferType = (v, m) => m?.type || (Array.isArray(v) ? "TEXTAREA" : typeof v === "boolean" ? "SWITCH" : typeof v === "number" ? "NUMBER" : "TEXT");
                const inferVT = (v, m) => m?.valueType || (Array.isArray(v) ? "array" : typeof v === "number" ? "number" : typeof v === "boolean" ? "boolean" : "string");

                const makeField = (f, path, val, defaultCol = 12) => {
                    const col = f.col ?? defaultCol;
                    const w = el("div", `layui-col-md${col}`), item = el("div", "layui-form-item", w);
                    const lbl = el("label", "layui-form-label", item); lbl.textContent = f.label || f.key;
                    const blk = el("div", "layui-input-block", item);

                    if (f.type === "SWITCH") {
                        item.style.cssText = "display:flex;align-items:center;margin-bottom:15px;";
                        lbl.style.cssText = "float:none;display:inline-block;padding:0 15px 0 0;width:auto;text-align:left;line-height:normal;";
                        blk.style.cssText = "margin-left:0;min-height:auto;";
                        let inp = el("input", "", blk); inp.type = "checkbox"; if (val) inp.setAttribute("checked", ""); inp.setAttribute("lay-skin", "switch"); inp.setAttribute("lay-text", "开启|关闭"); inp.name = path;
                    }
                    else if (f.type === "RANGE") {
                        blk.style.cssText = "display:flex;align-items:center;gap:12px;min-height:38px";
                        const inp = el("input", "nsx-range-input", blk);
                        inp.type = "range"; inp.name = path; inp.min = "0"; inp.max = "100"; inp.step = "1";
                        const n = Number(val);
                        inp.setAttribute("value", String(Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 30));
                        inp.dataset.valueType = "number";
                        inp.setAttribute("aria-label", f.label || f.key);
                        inp.style.cssText = "flex:1;min-width:0;width:100%;accent-color:#555;cursor:pointer";
                        const out = el("output", "nsx-range-value", blk);
                        out.textContent = inp.getAttribute("value");
                        out.style.cssText = "min-width:3ch;text-align:right;font-variant-numeric:tabular-nums";
                    }
                    else if (f.type === "TEXTAREA") { let inp = el("textarea", "layui-textarea", blk); inp.setAttribute("placeholder", f.placeholder || ""); inp.textContent = Array.isArray(val) ? val.join("\n") : (val ?? ""); inp.name = path; }
                    else if (f.type === "RADIO" && f.options) {
                        f.options.forEach(opt => {
                            const r = el("input", "", blk); r.type = "radio"; r.name = path; r.setAttribute("value", opt.value);
                            r.dataset.valueType = f.valueType || "";
                            if (String(val) === String(opt.value)) r.setAttribute("checked", "");
                            r.setAttribute("title", opt.text);
                        });
                    }
                    else if (f.type === "SELECT" && f.options) {
                        const sel = el("select", "", blk); sel.name = path;
                        sel.dataset.valueType = f.valueType || "";
                        Object.entries(f.options).forEach(([k, v]) => {
                            const opt = el("option", "", sel);
                            opt.value = k; opt.textContent = v;
                            if (String(val) === String(k)) opt.setAttribute("selected", "selected");
                        });
                    }
                    else if (f.type === "COLOR") {
                        const inpWrap = el("div", "layui-input-inline", blk); inpWrap.style.width = "100px";
                        let inp = el("input", "layui-input", inpWrap);
                        inp.type = "text";
                        inp.setAttribute("name", path);
                        inp.setAttribute("value", val ?? "");
                        inp.readOnly = true;
                        inp.style.cssText = `background:${val || "#fff"};cursor:pointer;color:transparent`;
                        const cpWrap = el("div", "layui-inline", blk); cpWrap.style.left = "-11px";
                        const wrap = el("div", "", cpWrap);
                        wrap.setAttribute("data-color-path", path);
                        wrap.setAttribute("data-color-val", val ?? "");
                        wrap.setAttribute("data-color-inp", path);
                        wrap.setAttribute("data-color-default", f.defaultVal ?? "");
                    }
                    else {
                        let inp = el("input", "layui-input", blk);
                        inp.type = f.type === "NUMBER" ? "number" : "text";
                        inp.setAttribute("value", val ?? "");
                        inp.setAttribute("name", path);
                        inp.dataset.valueType = f.valueType || "";
                    }

                    const firstInp = w.querySelector("input, textarea");
                    if (firstInp && !firstInp.dataset.valueType) firstInp.dataset.valueType = f.valueType || "";
                    return w;
                };

                const makeCard = (entry, siteCode) => {
                    const m = entry.meta || {};
                    let base = entry.key, cfg = defs[entry.key];
                    if (entry.key === "sign_in") { cfg = defs.sign_in?.[siteCode] || defs.sign_in?.ns || {}; base = `sign_in.${siteCode}`; }
                    if (!isObj(cfg)) return null;
                    const card = el("div", "layui-card layui-form nsx-config-card");
                    card.setAttribute("lay-filter", `nsx-${entry.key}`);
                    const hdr = el("div", "layui-card-header", card); hdr.textContent = m.label || entry.key;
                    if (typeof cfg.enabled === "boolean") {
                        const cbW = el("div", "header-checkbox", hdr), cb = el("input", "", cbW);
                        cb.type = "checkbox"; cb.name = `${base}.enabled`; if (store.get(`${base}.enabled`, cfg.enabled)) cb.setAttribute("checked", "");
                        cb.setAttribute("lay-skin", "switch"); cb.setAttribute("lay-text", "开启|关闭");
                        cb.setAttribute("lay-filter", "nsx-main-switch");
                    }
                    const body = el("div", "layui-card-body layui-row layui-col-space10", card);
                    const fields = m.fields || {}, hidden = new Set(m.hidden || []);
                    const cols = m.cols || 1, defaultCol = Math.floor(12 / cols);
                    Object.keys(cfg).filter(k => k !== "enabled" && !isObj(cfg[k]) && !hidden.has(k)).forEach(k => {
                        const fm = fields[k] || {};
                        const f = { key: k, label: fm.label || k, type: inferType(cfg[k], fm), options: fm.options, placeholder: fm.placeholder, valueType: inferVT(cfg[k], fm), col: fm.col, defaultVal: cfg[k] };
                        let cur = store.get(`${base}.${k}`, cfg[k]);
                        // 处理旧版本 hide -> official 的映射
                        if (k === 'blacklist_mode' && cur === 'hide') cur = 'official';

                        const fe = makeField(f, `${base}.${k}`, cur, defaultCol);
                        if (fe) body.appendChild(fe);
                    });
                    return card;
                };

                // 按照排好序的分组进行渲染
                groupOrder.forEach((g, i) => {
                    const list = groups[g];
                    const fs = el("fieldset", "layui-elem-field layui-field-title", wrapper); fs.id = `group-${i}`;
                    const lg = el("legend", "", fs); lg.textContent = g;
                    const fd = el("div", "layui-form", wrapper);
                    list.forEach(e => { const c = makeCard(e, code); if (c) fd.appendChild(c); });
                    const mi = el("li", "", menuList); if (i === 0) mi.classList.add("layui-menu-item-checked");
                    const mb = el("div", "layui-menu-body-title", mi), a = el("a", "", mb); a.href = `#group-${i}`; a.textContent = g;
                });

                const backupIdx = groupOrder.length;
                const backupFs = el("fieldset", "layui-elem-field layui-field-title", wrapper); backupFs.id = `group-${backupIdx}`;
                const backupLg = el("legend", "", backupFs); backupLg.textContent = "管理与工具";
                const backupWrap = el("div", "layui-form", wrapper);
                const backupCard = el("div", "layui-card layui-form nsx-config-card", backupWrap);
                const backupHdr = el("div", "layui-card-header", backupCard); backupHdr.textContent = "配置备份与常用操作";
                const backupBody = el("div", "layui-card-body", backupCard);
                backupBody.innerHTML = `<div class="nsx-config-tools"><button type="button" class="layui-btn layui-btn-primary" data-nsx-action="retry-sign">重试签到</button><button type="button" class="layui-btn layui-btn-primary" data-nsx-action="feedback">反馈与建议</button><button type="button" class="layui-btn layui-btn-normal" data-nsx-action="export-config">导出配置</button><button type="button" class="layui-btn layui-btn-primary" data-nsx-action="import-config">还原配置</button></div><div class="nsx-config-tools-tip">会备份设置面板中的开关、颜色、数值等配置，以及关键词、历史记录、快捷回复、好友和黑名单等本地数据。</div>`;
                const backupMi = el("li", "", menuList);
                const backupMb = el("div", "layui-menu-body-title", backupMi), backupA = el("a", "", backupMb);
                backupA.href = `#group-${backupIdx}`;
                backupA.textContent = "管理与工具";

                // 底部提示
                const endFs = el("fieldset", "layui-elem-field layui-field-title", wrapper, "text-align:center");
                const endLg = el("legend", "", endFs, "font-size:0.8em;opacity:0.5");
                endLg.textContent = "到底了";

                const w = window.layui.device().mobile ? "100%" : "620px";
                ctx.ui.layer.open({
                    type: 1, offset: "r", anim: "slideLeft", area: [w, "100%"], scrollbar: false, shade: 0.1, shadeClose: false,
                    btn: ["保存设置", "取消"], btnAlign: "r", title: "NodeSeek Pro Max 设置", id: "setting-layer-direction-r", content: cont.outerHTML,
                    success: ly => {
                        const r = ly?.[0] || ly;
                        try { window.layui.form?.render(); } catch { }
                        bindBackupTools(r);
                        r?.addEventListener("input", event => {
                            if (event.target.matches?.(".nsx-range-input")) {
                                event.target.nextElementSibling.textContent = event.target.value;
                            }
                        });
                        // 滚动同步：右侧滚动时高亮左侧菜单
                        const content = r?.querySelector?.("#nsx-config-content");
                        const menu = r?.querySelector?.("#nsx-config-menu");
                        if (content && menu) {
                            const items = menu.querySelectorAll("li");
                            content.addEventListener("scroll", () => {
                                const groups = content.querySelectorAll("fieldset[id^='group-']");
                                let activeIdx = 0;
                                groups.forEach((g, i) => { if (g.offsetTop - content.scrollTop <= 50) activeIdx = i; });
                                items.forEach((li, i) => li.classList.toggle("layui-menu-item-checked", i === activeIdx));
                            }, { passive: true });
                        }
                        // 主开关联动
                        const toggleCard = (card, on) => {
                            card.querySelectorAll(".layui-card-body input,.layui-card-body select,.layui-card-body textarea").forEach(el => {
                                el.disabled = !on;
                                el.closest(".layui-form-item")?.classList.toggle("layui-disabled", !on);
                            });
                            window.layui.form?.render(null, card.getAttribute("lay-filter"));
                        };
                        // 初始 + 监听
                        r?.querySelectorAll?.(".header-checkbox input").forEach(cb => !cb.checked && toggleCard(cb.closest(".nsx-config-card"), false));
                        window.layui.form?.on("switch(nsx-main-switch)", d => toggleCard(d.elem.closest(".nsx-config-card"), d.elem.checked));
                        window.layui.use("colorpicker", () => {
                            const cp = window.layui.colorpicker;
                            r?.querySelectorAll?.("[data-color-path]").forEach(wrap => {
                                const path = wrap.getAttribute("data-color-inp");
                                const inp = r.querySelector(`input[name="${path}"]`);
                                const init = wrap.getAttribute("data-color-val") || "";
                                const def = wrap.getAttribute("data-color-default") || "";
                                if (!inp) return;

                                const setBg = c => { inp.style.background = c || ""; };
                                cp.render({
                                    elem: wrap, color: init, alpha: true, predefine: true, format: "rgb",
                                    change: setBg,
                                    done(c) {
                                        const final = c || def;
                                        inp.value = final;
                                        setBg(final);
                                    },
                                    cancel: setBg
                                });
                            });
                        });
                    },
                    yes: async (idx, ly) => {
                        const r = ly?.[0] || ly, sc = r?.querySelector ? r : document;
                        const changedKeys = [];
                        sc.querySelectorAll("input,select,textarea").forEach(el => {
                            if (!el.name) return;
                            // radio 只保存选中的那个
                            if (el.type === "radio" && !el.checked) return;
                            let v;
                            const vt = el.dataset.valueType;
                            if (el.type === "checkbox") v = el.checked;
                            else if (el.type === "radio") v = vt === "number" ? Number(el.value) : el.value;
                            else if (el.tagName === "TEXTAREA") v = vt === "array" ? el.value.split("\n").map(s => s.trim()).filter(Boolean) : el.value;
                            else if (el.type === "number" || vt === "number") { const n = Number(el.value); v = Number.isFinite(n) ? n : 0; }
                            else v = el.value;
                            if (v !== undefined) {
                                const oldV = store.get(el.name);
                                const o = typeof oldV === "object" ? JSON.stringify(oldV) : String(oldV);
                                const n = typeof v === "object" ? JSON.stringify(v) : String(v);
                                if (o !== n) changedKeys.push(el.name);
                                store.set(el.name, v);
                            }
                        });
                        if (changedKeys.includes('open_post_in_new_tab.enabled')) {
                            const preference = await readNsPreferenceConfig() || {};
                            preference.openPostInNewPage = !!store.get('open_post_in_new_tab.enabled', false);
                            await writeNsPreferenceConfig(preference);
                        }
                        applyRuntimeSettings(ctx, changedKeys);
                        ctx.ui.layer.msg(changedKeys.length ? "设置已保存，即将刷新生效" : "设置已保存");
                        setTimeout(() => {
                            ctx.ui.layer.close(idx);
                            if (changedKeys.length) nsxReloadPage();
                        }, 400);
                    }
                });
            };

            GM_registerMenuCommand("⚙️ 设置", advSettings);

        }
    };

    const __vite_glob_0_13 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
        __proto__: null,
        default: menus
    }, Symbol.toStringTag, { value: 'Module' }));

    /* ==========================================================================
       [ 🧭 辅助工具 ] - 快捷评论 (快捷回复区)
       ========================================================================== */

    const quickComment = {
        id: "quickComment",
        order: 120,
        cfg: { quick_comment: { enabled: true } },
        meta: { quick_comment: { label: "快捷评论", group: "🧭 辅助工具" } },
        match: ctx => ctx.loggedIn && ctx.isPost && ctx.store.get("quick_comment.enabled", true),
        init(ctx) {
            const editor = $(".md-editor"), parent = $("#back-to-parent"), group = $("#fast-nav-button-group");
            if (!editor || !parent || !group) return;
            let open = false;
            addStyle("nsx-quick-reply", `
.mde-toolbar > .sep{width:2px !important;height:20px !important;background:#e5e7eb !important;margin:0 6px !important;flex-shrink:0 !important;display:inline-block !important}
.nsx-quick-reply-wrap{position:relative;display:inline-flex;align-items:center}
.nsx-quick-reply-btn{height:auto;line-height:1;border:none;background:transparent;color:var(--text-color,#333);padding:0;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px}
.nsx-quick-reply-btn:hover{color:#1677ff}
.nsx-quick-reply-menu{position:absolute;left:0;top:36px;z-index:1002;min-width:280px;max-width:min(500px,88vw);background:var(--bg-color,#fff);border:1px solid var(--border-color,#e5e7eb);border-radius:10px;box-shadow:0 8px 22px rgba(0,0,0,.12);padding:8px;display:none}
.nsx-quick-reply-menu.show{display:block}
.nsx-quick-reply-tabs-wrap{display:flex;align-items:flex-start;gap:6px;padding-bottom:11px;margin-bottom:6px;border-bottom:1px solid #eee}
.nsx-quick-reply-tabs{flex:1;display:flex;gap:6px;overflow:auto hidden;scrollbar-width:thin;overflow-y:hidden}
.nsx-quick-reply-tab{flex:0 0 calc((100% - 12px)/3);max-width:calc((100% - 12px)/3);border:1px solid #e4e6eb;background:#fff;border-radius:999px;padding:3px 8px;cursor:pointer;font-size:12px;white-space:nowrap;overflow:hidden;text-align:center;display:flex;align-items:center;justify-content:center;gap:6px}
.nsx-quick-reply-tab .nsx-quick-reply-tab-text{min-width:0;overflow:hidden;text-overflow:ellipsis}
.nsx-quick-reply-tab .nsx-quick-reply-tab-del{flex:0 0 auto;border:0;background:transparent;color:#999;cursor:pointer;line-height:1;padding:0 2px;font-size:12px}
.nsx-quick-reply-tab .nsx-quick-reply-tab-del:hover{color:#ff4d4f}
.nsx-quick-reply-tab.active{background:#1677ff;color:#fff;border-color:#1677ff}
.nsx-quick-reply-tab.active .nsx-quick-reply-tab-del{color:rgba(255,255,255,.85)}
.nsx-quick-reply-tab.active .nsx-quick-reply-tab-del:hover{color:#fff}
.nsx-quick-reply-tab-add-fixed{flex:0 0 auto;border:1px dashed #1677ff;background:#fff;color:#1677ff;border-radius:999px;padding:3px 10px;cursor:pointer;font-size:12px;white-space:nowrap}
.nsx-quick-reply-list{height:216px;overflow-y:auto;overflow-x:hidden;padding-right:2px}
.nsx-quick-reply-item{display:flex;align-items:center;width:100%;text-align:left;border:0;background:transparent;color:inherit;cursor:pointer;border-radius:8px;padding:0 6px 0 10px;height:36px;box-sizing:border-box}
.nsx-quick-reply-item .nsx-quick-reply-item-text{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
.nsx-quick-reply-item .nsx-quick-reply-item-del{flex:0 0 auto;border:0;background:transparent;color:#999;cursor:pointer;line-height:1;padding:4px 6px;font-size:12px;border-radius:6px}
.nsx-quick-reply-item .nsx-quick-reply-item-del:hover{color:#ff4d4f;background:rgba(255,77,79,.12)}
.nsx-quick-reply-item:hover{background:var(--hover-color,#f3f4f6)}
.nsx-quick-reply-empty{padding:10px;color:#999;font-size:12px}
.nsx-quick-reply-foot{display:flex;justify-content:space-between;align-items:center;padding-top:6px;margin-top:6px;border-top:1px solid #eee}
.nsx-quick-reply-autosend-wrap{display:flex;align-items:center;gap:4px;font-size:12px;color:#666}
.nsx-quick-reply-autosend-check{width:14px;height:14px;cursor:pointer;accent-color:#1677ff}
.nsx-quick-reply-autosend-label{cursor:pointer;user-select:none}
.nsx-quick-reply-op{border:1px solid #e4e6eb;background:#fff;border-radius:6px;padding:2px 8px;cursor:pointer;font-size:12px}
.nsx-quick-reply-op:disabled{opacity:.45;cursor:not-allowed}
.nsx-quick-reply-add{border:1px solid #1677ff;background:#1677ff;color:#fff;border-radius:6px;padding:2px 8px;cursor:pointer;font-size:12px}
.dark-layout .mde-toolbar > .sep{background:#666 !important}
.dark-layout .nsx-quick-reply-btn:hover{color:#64b5f6}
.dark-layout .nsx-quick-reply-menu{background:#222;border-color:#3a3a3a;box-shadow:0 8px 22px rgba(0,0,0,.35)}
.dark-layout .nsx-quick-reply-tabs-wrap{border-bottom-color:#3a3a3a}
.dark-layout .nsx-quick-reply-tabs{border-bottom-color:#3a3a3a}
.dark-layout .nsx-quick-reply-tab{background:#2a2a2a;border-color:#444;color:#ddd}
.dark-layout .nsx-quick-reply-tab.active{background:#1677ff;border-color:#1677ff;color:#fff}
.dark-layout .nsx-quick-reply-tab-add-fixed{background:#2a2a2a;border-color:#1677ff;color:#8dbdff}
.dark-layout .nsx-quick-reply-item .nsx-quick-reply-item-del:hover{background:rgba(255,77,79,.18)}
.dark-layout .nsx-quick-reply-item:hover{background:#333}
.dark-layout .nsx-quick-reply-foot{border-top-color:#3a3a3a}
.dark-layout .nsx-quick-reply-autosend-wrap{color:#aaa}
.dark-layout .nsx-quick-reply-op{background:#2a2a2a;border-color:#444;color:#ddd}
`);

            const show = e => {
                if (open) return;
                e?.preventDefault?.();
                editor.style.cssText = `position:fixed;bottom:0;margin:0;width:100%;max-width:${editor.clientWidth || 720}px;z-index:999`;
                addClose();
                open = true;
            };

            const btn = parent.cloneNode(true);
            btn.id = "back-to-comment";
            btn.innerHTML = `<svg class="iconpark-icon" style="width:24px;height:24px"><use href="#comments"></use></svg>`;
            btn.onclick = show;
            parent.before(btn);

            $$(".nsk-post .comment-menu,.comment-container .comments").forEach(el => el.addEventListener("click", e => {
                if (["引用", "回复", "编辑"].includes(e.target?.textContent)) show(e);
            }, true));

            mountQuickReplyMenu();

            function addClose() {
                const tb = $("#editor-body .window_header > :last-child");
                if (!tb || $(".nsx-close-editor")) return;
                const cb = tb.cloneNode(true);
                cb.classList.add("nsx-close-editor");
                cb.title = "关闭";
                const sp = cb.querySelector("span");
                if (sp) {
                    sp.classList.replace("i-icon-full-screen-one", "i-icon-close");
                    sp.innerHTML = `<svg width="16" height="16" viewBox="0 0 48 48" fill="none"><path d="M8 8L40 40M8 40L40 8" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
                }
                cb.onclick = () => { editor.style.cssText = ""; cb.remove(); open = false; };
                tb.after(cb);
            }

            function mountQuickReplyMenu() {
                const bar = editor.querySelector(".mde-toolbar");
                if (!bar || bar.querySelector(".nsx-quick-reply-wrap")) return;
                const state = { groupIdx: 0 };

                const sep = document.createElement("div");
                const wrap = document.createElement("div");
                wrap.className = "nsx-quick-reply-wrap toolbar-item";
                const btn = document.createElement("span");
                btn.className = "nsx-quick-reply-btn i-icon";
                btn.title = "快捷回复 - NodeSeek Pro Max";
                btn.textContent = "快捷回复";
                const menu = document.createElement("div");
                menu.className = "nsx-quick-reply-menu";

                // 让菜单始终可见：窗口缩放/滚动时自动贴边，避免跑出视窗外
                const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
                const placeMenu = () => {
                    if (!menu.classList.contains("show")) return;

                    // 覆盖 CSS 里的 absolute，避免父容器溢出/裁剪导致看不到
                    menu.style.position = "fixed";
                    menu.style.margin = "0";

                    const pad = 8;
                    const vw = window.innerWidth || document.documentElement.clientWidth || 0;
                    const vh = window.innerHeight || document.documentElement.clientHeight || 0;

                    const bRect = btn.getBoundingClientRect();
                    const mRect = menu.getBoundingClientRect();
                    const w = mRect.width || Math.min(500, Math.max(280, vw * 0.88));
                    const h = mRect.height || 320;

                    let left = clamp(bRect.left, pad, Math.max(pad, vw - w - pad));
                    let top = bRect.bottom + 6;

                    // 优先显示在按钮下方；放不下就翻到上方
                    if (top + h + pad > vh && bRect.top - 6 - h - pad >= 0) {
                        top = bRect.top - 6 - h;
                    }
                    top = clamp(top, pad, Math.max(pad, vh - h - pad));

                    menu.style.left = `${left}px`;
                    menu.style.top = `${top}px`;
                };

                // 支持拖拽移动：按住标签栏区域拖动菜单
                let dragOn = false, dragStartX = 0, dragStartY = 0, dragLeft = 0, dragTop = 0;
                const onDragMove = (e) => {
                    if (!dragOn) return;
                    const pad = 8;
                    const vw = window.innerWidth || document.documentElement.clientWidth || 0;
                    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
                    const r = menu.getBoundingClientRect();
                    const nextLeft = clamp(dragLeft + (e.clientX - dragStartX), pad, Math.max(pad, vw - r.width - pad));
                    const nextTop = clamp(dragTop + (e.clientY - dragStartY), pad, Math.max(pad, vh - r.height - pad));
                    menu.style.left = `${nextLeft}px`;
                    menu.style.top = `${nextTop}px`;
                };
                const onDragEnd = () => { dragOn = false; };

                const tabsWrap = document.createElement("div");
                tabsWrap.className = "nsx-quick-reply-tabs-wrap";
                const tabs = document.createElement("div");
                tabs.className = "nsx-quick-reply-tabs";
                const addGroupTab = document.createElement("button");
                addGroupTab.type = "button";
                addGroupTab.className = "nsx-quick-reply-tab-add-fixed";
                addGroupTab.textContent = "+ 分组";
                addGroupTab.onclick = e => {
                    e.preventDefault();
                    e.stopPropagation();
                    openAddGroupDialog(() => {
                        state.groupIdx = Math.max(0, getQuickReplyGroups().length - 1);
                        state.page = 1;
                        renderMenu();
                    });
                };
                const list = document.createElement("div");
                list.className = "nsx-quick-reply-list";
                const foot = document.createElement("div");
                foot.className = "nsx-quick-reply-foot";
                tabsWrap.append(tabs, addGroupTab);
                menu.append(tabsWrap, list, foot);

                tabsWrap.style.cursor = "move";
                tabsWrap.addEventListener("pointerdown", (e) => {
                    if (!menu.classList.contains("show")) return;
                    if (e.button !== 0) return;
                    if (e.target?.closest?.("button,input,select,textarea,a,.nsx-quick-reply-tab,.nsx-quick-reply-tab-add-fixed")) return;
                    e.preventDefault();
                    e.stopPropagation();

                    placeMenu();
                    const r = menu.getBoundingClientRect();
                    dragOn = true;
                    dragStartX = e.clientX;
                    dragStartY = e.clientY;
                    dragLeft = r.left;
                    dragTop = r.top;
                    try { tabsWrap.setPointerCapture(e.pointerId); } catch { }
                }, { passive: false });
                tabsWrap.addEventListener("pointermove", onDragMove);
                tabsWrap.addEventListener("pointerup", onDragEnd);
                tabsWrap.addEventListener("pointercancel", onDragEnd);

                const renderMenu = () => {
                    const groups = getQuickReplyGroups();
                    tabs.innerHTML = "";
                    list.innerHTML = "";
                    foot.innerHTML = "";
                    if (!groups.length) {
                        const empty = document.createElement("div");
                        empty.className = "nsx-quick-reply-empty";
                        empty.textContent = "未找到快捷回复，请先在快捷回复面板中配置。";
                        list.appendChild(empty);
                        const addBtn = document.createElement("button");
                        addBtn.type = "button";
                        addBtn.className = "nsx-quick-reply-add";
                        addBtn.textContent = "新增";
                        addBtn.onclick = () => openAddDialog("", () => {
                            state.groupIdx = 0;
                            renderMenu();
                        });
                        foot.appendChild(addBtn);
                        return;
                    }

                    state.groupIdx = Math.max(0, Math.min(state.groupIdx, groups.length - 1));
                    groups.forEach((g, i) => {
                        // 不要在 button 里嵌套 button（浏览器行为不一致，可能导致误触发关闭）
                        const t = document.createElement("div");
                        t.className = `nsx-quick-reply-tab${i === state.groupIdx ? " active" : ""}`;
                        t.setAttribute("role", "button");
                        t.tabIndex = 0;

                        const label = g.name || `分组${i + 1}`;
                        const text = document.createElement("span");
                        text.className = "nsx-quick-reply-tab-text";
                        text.textContent = label;

                        const del = document.createElement("span");
                        del.className = "nsx-quick-reply-tab-del";
                        del.title = "删除分组";
                        del.textContent = "✕";
                        del.setAttribute("role", "button");
                        del.tabIndex = 0;
                        del.onclick = (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const groupName = g.name || "";
                            if (!groupName) return;
                            const doDel = () => {
                                let parsed = {};
                                try { parsed = JSON.parse(localStorage.getItem("nodeseek_quick_reply") || "{}") || {}; } catch { parsed = {}; }
                                delete parsed[groupName];
                                localStorage.setItem("nodeseek_quick_reply", JSON.stringify(parsed));
                                state.groupIdx = Math.max(0, Math.min(state.groupIdx, Object.keys(parsed).length - 1));
                                renderMenu();
                            };
                            if (ctx.ui?.confirm) ctx.ui.confirm("确认删除?", `确定要删除分组【${groupName}】吗？（该分组下的快捷回复会一起删除）`, doDel);
                            else if (window.confirm(`确定要删除分组【${groupName}】吗？（该分组下的快捷回复会一起删除）`)) doDel();
                        };

                        const pick = (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            state.groupIdx = i;
                            renderMenu();
                        };
                        t.onclick = pick;
                        t.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") pick(e); };

                        t.append(text, del);
                        tabs.appendChild(t);
                    });
                    const curGroup = groups[state.groupIdx];
                    const curItems = curGroup.items || [];
                    if (!curItems.length) {
                        const empty = document.createElement("div");
                        empty.className = "nsx-quick-reply-empty";
                        empty.textContent = "当前分组暂无内容，点击右下角“新增”添加。";
                        list.appendChild(empty);
                    }

                    const curGroupName = curGroup?.name || "";
                    curItems.forEach((item, idx) => {
                        // 同理：避免在 button 里嵌套 button
                        const it = document.createElement("div");
                        it.className = "nsx-quick-reply-item";
                        it.setAttribute("role", "button");
                        it.tabIndex = 0;
                        it.title = item.text;

                        const text = document.createElement("span");
                        text.className = "nsx-quick-reply-item-text";
                        text.textContent = item.label;

                        const del = document.createElement("span");
                        del.className = "nsx-quick-reply-item-del";
                        del.title = "删除";
                        del.textContent = "✕";
                        del.setAttribute("role", "button");
                        del.tabIndex = 0;
                        del.onclick = (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!curGroupName) return;
                            const doDel = () => {
                                let parsed = {};
                                try { parsed = JSON.parse(localStorage.getItem("nodeseek_quick_reply") || "{}") || {}; } catch { parsed = {}; }
                                const raw = parsed[curGroupName];
                                const arr = normalizeItems(raw).map(x => ({ title: x.label, content: x.text }));
                                arr.splice(idx, 1);
                                parsed[curGroupName] = arr;
                                localStorage.setItem("nodeseek_quick_reply", JSON.stringify(parsed));
                                renderMenu();
                            };
                            if (ctx.ui?.confirm) ctx.ui.confirm("确认删除?", `确定要删除这条快捷回复吗？`, doDel);
                            else if (window.confirm("确定要删除这条快捷回复吗？")) doDel();
                        };

                        it.append(text, del);
                        const doInsert = (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            insertReplyText(item.text);
                            menu.classList.remove("show");
                            // 检查是否自动点击提交按钮
                            const autoSendCheck = document.getElementById("nsx-quick-reply-autosend");
                            if (autoSendCheck && autoSendCheck.checked) {
                                setTimeout(() => {
                                    const submitBtn = editor.querySelector(".md-editor button.submit.btn");
                                    if (submitBtn) submitBtn.click();
                                }, 100);
                            }
                        };
                        it.onclick = doInsert;
                        it.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") doInsert(e); };
                        list.appendChild(it);
                    });

                    // 自动发送勾选框
                    const autoSendWrap = document.createElement("div");
                    autoSendWrap.className = "nsx-quick-reply-autosend-wrap";
                    const autoSendCheck = document.createElement("input");
                    autoSendCheck.type = "checkbox";
                    autoSendCheck.id = "nsx-quick-reply-autosend";
                    autoSendCheck.className = "nsx-quick-reply-autosend-check";
                    // 从localStorage读取上次设置（兼容NS综合.js的key）
                    const savedAutoSend = localStorage.getItem("nodeseek_quick_reply_auto_submit") === "true";
                    autoSendCheck.checked = savedAutoSend;
                    const autoSendLabel = document.createElement("label");
                    autoSendLabel.htmlFor = "nsx-quick-reply-autosend";
                    autoSendLabel.className = "nsx-quick-reply-autosend-label";
                    autoSendLabel.textContent = "自动提交";
                    // 保存设置到localStorage（使用NS综合.js的key保持兼容）
                    autoSendCheck.onchange = () => {
                        localStorage.setItem("nodeseek_quick_reply_auto_submit", autoSendCheck.checked);
                    };
                    autoSendWrap.append(autoSendCheck, autoSendLabel);

                    const addBtn = document.createElement("button");
                    addBtn.type = "button";
                    addBtn.className = "nsx-quick-reply-add";
                    addBtn.textContent = "新增";
                    addBtn.onclick = () => openAddDialog(curGroup.name || "", () => renderMenu());
                    foot.append(autoSendWrap, addBtn);
                };

                btn.onclick = e => {
                    e.preventDefault();
                    e.stopPropagation();
                    renderMenu();
                    menu.classList.toggle("show");
                    if (menu.classList.contains("show")) requestAnimationFrame(placeMenu);
                };

                document.addEventListener("click", e => {
                    // 当 layui 弹窗打开时（例如“新建分组”的确认/取消），不要自动关闭快捷回复面板
                    // 处理两类情况：1) 点击发生在 layer 内部；2) layer 存在时点击落在外部但仍希望保持面板不被误关
                    if (e.target?.closest?.(".layui-layer,.layui-layer-page,.layui-layer-dialog,.layui-layer-content,.layui-layer-btn,.layui-layer-shade,.layui-colorpicker,.layui-form-select")) return;
                    if (menu.classList.contains("show") && document.querySelector(".layui-layer")) return;
                    if (!wrap.contains(e.target)) menu.classList.remove("show");
                });

                // 窗口变化时重新定位，避免面板被挤出屏幕
                addEventListener("resize", placeMenu, { passive: true });
                addEventListener("scroll", placeMenu, { passive: true });

                sep.className = "sep";
                wrap.append(btn, menu);
                const lastEl = bar.lastElementChild;
                if (lastEl?.classList?.contains("sep")) {
                    bar.append(wrap);
                } else {
                    bar.append(sep, wrap);
                }
            }

            function insertReplyText(text) {
                if (!text) return;
                const cm = editor.querySelector(".CodeMirror")?.CodeMirror;
                if (cm) {
                    const doc = cm.getDoc();
                    const cur = doc.getCursor();
                    doc.replaceRange(text, cur);
                    cm.focus();
                    return;
                }
                const ta = editor.querySelector("textarea");
                if (!ta) return;
                const start = ta.selectionStart ?? ta.value.length;
                const end = ta.selectionEnd ?? ta.value.length;
                ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
                const pos = start + text.length;
                ta.setSelectionRange(pos, pos);
                ta.dispatchEvent(new Event("input", { bubbles: true }));
                ta.focus();
            }

            function getQuickReplyGroups() {
                const raw = localStorage.getItem("nodeseek_quick_reply");
                if (!raw) return [];
                let parsed;
                try { parsed = JSON.parse(raw); } catch { return []; }
                if (!parsed || typeof parsed !== "object") return [];
                const groups = [];
                Object.entries(parsed).forEach(([name, val]) => {
                    const items = normalizeItems(val);
                    groups.push({ name, items });
                });
                return groups;
            }

            function openAddGroupDialog(onDone) {
                const layer = ctx.ui?.layer;
                if (!layer) {
                    const val = window.prompt("请输入分组名：", "默认");
                    const groupName = String(val ?? "").trim();
                    if (!groupName) return;
                    ensureQuickReplyGroup(groupName);
                    ctx.ui?.success?.("分组已创建");
                    onDone?.();
                    return;
                }
                layer.prompt({ title: "新建分组", formType: 0, value: "默认" }, (val, idx) => {
                    const groupName = String(val ?? "").trim();
                    if (!groupName) return ctx.ui?.warning?.("分组名不能为空");
                    ensureQuickReplyGroup(groupName);
                    layer.close(idx);
                    ctx.ui?.success?.("分组已创建");
                    onDone?.();
                });
            }

            function openAddDialog(defaultGroupName, onDone) {
                const layer = ctx.ui?.layer;
                let groups = getQuickReplyGroups().map(g => g.name).filter(Boolean);
                if (!layer || !window.layui) {
                    const ask = (label, def = "") => {
                        const v = window.prompt(label, def);
                        return v == null ? null : String(v).trim();
                    };
                    const group = ask("请输入分组名：", defaultGroupName || groups[0] || "默认");
                    if (group == null) return;
                    if (!group) { ctx.ui?.warning?.("分组名不能为空"); return; }
                    const content = ask("请输入快捷回复内容：", "");
                    if (content == null) return;
                    if (!content.trim()) { ctx.ui?.warning?.("内容不能为空"); return; }
                    const title = ask("请输入标题（可留空自动截断内容）：", "") || shrink(content);
                    saveQuickReplyItem(group, { title, content: content.trim() });
                    ctx.ui?.success?.("快捷回复已添加");
                    onDone?.();
                    return;
                }

                // 没有任何分组时，先创建一个默认分组，避免下拉为空无法选择
                if (!groups.length) {
                    ensureQuickReplyGroup("默认");
                    groups = getQuickReplyGroups().map(g => g.name).filter(Boolean);
                }

                const escHtml = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
                const defaultGroup = defaultGroupName || groups[0] || "默认";
                const optsHtml = groups.map(g => `<option value="${escHtml(g)}"${g === defaultGroup ? " selected" : ""}>${escHtml(g)}</option>`).join("");
                const html = `
                    <style>
                        .nsx-qr-form .layui-form-label{width:70px}
                        .nsx-qr-form .layui-input-block{margin-left:100px}
                        .nsx-qr-tip{font-size:12px;color:#999;margin-top:4px}
                    </style>
                    <div class="layui-form nsx-qr-form" style="padding:16px 16px 0;">
                        <div class="layui-form-item">
                            <label class="layui-form-label">分组</label>
                            <div class="layui-input-block">
                                <select id="nsx-qr-group">
                                    ${optsHtml}
                                </select>
                                <div class="nsx-qr-tip">需要新分组请点工具栏右侧的“+ 分组”。</div>
                            </div>
                        </div>
                        <div class="layui-form-item">
                            <label class="layui-form-label">内容</label>
                            <div class="layui-input-block">
                                <textarea id="nsx-qr-content" class="layui-textarea" style="min-height:130px" placeholder="输入快捷回复正文"></textarea>
                                <div class="nsx-qr-tip">支持多行文本，插入时会保持换行。标题将自动使用内容前 28 字。</div>
                            </div>
                        </div>
                    </div>
                `;
                layer.open({
                    type: 1,
                    title: "新增快捷回复",
                    area: [window.layui.device().mobile ? "95%" : "560px", "420px"],
                    btn: ["保存", "取消"],
                    content: html,
                    success: ly => {
                        const r = ly?.[0] || ly;
                        if (window.layui?.form) {
                            layui.use("form", () => {
                                const form = layui.form;
                                form.render("select");
                            });
                        }
                        const c = r?.querySelector?.("#nsx-qr-content");
                        c?.focus?.();
                    },
                    yes: idx => {
                        const r = document.getElementById("layui-layer" + idx) || document;
                        const group = r.querySelector("#nsx-qr-group")?.value?.trim() || "";
                        const content = r.querySelector("#nsx-qr-content")?.value || "";
                        if (!group) return ctx.ui?.warning?.("分组名不能为空");
                        if (!content.trim()) return ctx.ui?.warning?.("内容不能为空");
                        const title = shrink(content);
                        saveQuickReplyItem(group, { title, content: content.trim() });
                        layer.close(idx);
                        ctx.ui?.success?.("快捷回复已添加");
                        onDone?.();
                    }
                });
            }

            function ensureQuickReplyGroup(groupName) {
                let parsed = {};
                try { parsed = JSON.parse(localStorage.getItem("nodeseek_quick_reply") || "{}") || {}; } catch { parsed = {}; }
                if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) parsed = {};
                if (!Object.prototype.hasOwnProperty.call(parsed, groupName)) parsed[groupName] = [];
                localStorage.setItem("nodeseek_quick_reply", JSON.stringify(parsed));
            }

            function saveQuickReplyItem(groupName, item) {
                let parsed = {};
                try { parsed = JSON.parse(localStorage.getItem("nodeseek_quick_reply") || "{}") || {}; } catch { parsed = {}; }
                if (!parsed[groupName]) parsed[groupName] = [];
                if (Array.isArray(parsed[groupName])) {
                    parsed[groupName].push(item);
                } else if (parsed[groupName] && typeof parsed[groupName] === "object") {
                    const arr = normalizeItems(parsed[groupName]).map(i => ({ title: i.label, content: i.text }));
                    arr.push(item);
                    parsed[groupName] = arr;
                } else {
                    parsed[groupName] = [item];
                }
                localStorage.setItem("nodeseek_quick_reply", JSON.stringify(parsed));
            }

            function normalizeItems(src) {
                const arr = Array.isArray(src) ? src : (src && typeof src === "object" ? Object.values(src) : []);
                return arr.map(v => {
                    if (typeof v === "string") return { label: shrink(v), text: v };
                    if (!v || typeof v !== "object") return null;
                    const text = String(v.content ?? v.text ?? v.value ?? "").trim();
                    if (!text) return null;
                    const label = String(v.title ?? v.name ?? v.label ?? shrink(text));
                    return { label, text };
                }).filter(Boolean);
            }

            function shrink(s) {
                const t = String(s).replace(/\s+/g, " ").trim();
                return t.length > 28 ? `${t.slice(0, 28)}...` : t;
            }
        }
    };

    const __vite_glob_0_14 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
        __proto__: null,
        default: quickComment
    }, Symbol.toStringTag, { value: 'Module' }));

    /* ==========================================================================
       [ 🤖 AI美化 ] - AI 主题美化功能
       ========================================================================== */
    const aiComment = {
        id: "aiComment",
        order: 121,
        deps: ["quickComment"],
        cfg: { ai_comment: { enabled: false, api_type: "openai", api_key: "", api_url: "", model: "gpt-3.5-turbo", system_prompt: "你是 NodeSeek 发帖润色助手。请将用户输入的主题内容进行美化与优化，保持原意不跑题，输出结构清晰、可直接发布的版本。要求：1) 使用 Markdown 语法（标题、列表、引用、代码块按需使用）；2) 语言自然、有可读性；3) 可适度加入 Emoji 提升表达（每段 0-2 个，避免堆砌）；4) 不编造事实，不添加广告或引战内容；5) 若信息不足，用一句简短提示提醒补充关键细节。" } },
        meta: {
            ai_comment: {
                label: "AI美化",
                group: "🧭 辅助工具",
                fields: {
                    api_type: { type: "SELECT", label: "API类型", options: { openai: "OpenAI", custom: "自定义API" } },
                    api_url: { type: "INPUT", label: "API地址" },
                    model: { type: "INPUT", label: "模型名称" },
                    api_key: { type: "INPUT", label: "API密钥" },
                    system_prompt: { type: "TEXTAREA", label: "系统提示词" }
                }
            }
        },
        match: ctx => location.pathname.startsWith("/new-discussion") && ctx.store.get("ai_comment.enabled", false),
        init(ctx) {
            const editor = $(".md-editor");
            const bar = editor?.querySelector(".mde-toolbar");
            if (!bar) return;
            if (bar.querySelector(".nsx-ai-wrap")) return;
            const vAttr = [...(bar.querySelector(".toolbar-item")?.attributes || [])].find(a => a.name.startsWith("data-v-"))?.name;
            const setV = el => vAttr && el.setAttribute(vAttr, "");

            addStyle("nsx-ai-reply", `
    .nsx-ai-reply-btn{display:flex;align-items:center;gap:4px;color:#1677ff;cursor:pointer;font-size:12px;transition:all .2s}
    .nsx-ai-reply-btn:hover{color:#4096ff}
    .nsx-ai-reply-btn.loading{opacity:.6;cursor:not-allowed}
    .nsx-ai-reply-btn svg{width:16px;height:16px}
    .nsx-ai-reply-icon{animation:aiSpin 1s linear infinite}
    @keyframes aiSpin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
    .dark-layout .nsx-ai-reply-btn{color:#64b5f6}
    .dark-layout .nsx-ai-reply-btn:hover{color:#90caf9}
    `);

            const sep = document.createElement("div");
            sep.className = "sep nsx-ai-sep";
            setV(sep);

            const wrap = document.createElement("div");
            wrap.className = "nsx-ai-wrap toolbar-item";
            setV(wrap);

            const btn = document.createElement("span");
            btn.className = "nsx-ai-reply-btn i-icon";
            btn.title = "AI美化 - NodeSeek Pro Max";
            btn.innerHTML = `<svg viewBox="0 0 48 48" fill="none"><path d="M24 4C13 4 4 13 4 24s9 20 20 20 20-9 20-20S35 4 24 4z" stroke="currentColor" stroke-width="4"/><path d="M24 14v10m0 4v6" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>AI美化`;
            setV(btn);

            wrap.append(btn);
            // 插入到快捷回复按钮后面（分隔符 + 自动回复按钮）
            const quickReplyWrap = bar.querySelector(".nsx-quick-reply-wrap");
            if (quickReplyWrap) {
                const next = quickReplyWrap.nextElementSibling;
                if (next?.classList?.contains("sep")) {
                    next.after(wrap);
                } else {
                    quickReplyWrap.after(sep, wrap);
                }
            } else {
                const last = bar.lastElementChild;
                if (last?.classList?.contains("sep")) bar.append(wrap);
                else bar.append(sep, wrap);
            }

            btn.onclick = async (e) => {
                e.preventDefault();
                e.stopPropagation();

                if (btn.classList.contains("loading")) return;

                // 打开配置面板
                const apiKey = ctx.store.get("ai_comment.api_key") || "";
                if (!apiKey) {
                    openConfigPanel(ctx);
                    return;
                }

                await generateAIReply(ctx, editor, btn);
            };

            function openConfigPanel(ctx) {
                const escHtml = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

                const apiType = ctx.store.get("ai_comment.api_type", "openai");
                const apiUrl = ctx.store.get("ai_comment.api_url", apiType === "openai" ? "https://api.openai.com/v1/chat/completions" : "");
                const model = ctx.store.get("ai_comment.model", "gpt-3.5-turbo");
                const sysPrompt = ctx.store.get("ai_comment.system_prompt", "你是 NodeSeek 发帖润色助手。请将用户输入的主题内容进行美化与优化，保持原意不跑题，输出结构清晰、可直接发布的版本。要求：1) 使用 Markdown 语法（标题、列表、引用、代码块按需使用）；2) 语言自然、有可读性；3) 可适度加入 Emoji 提升表达；4) 不编造事实，不添加广告或引战内容；5) 若信息不足，用一句简短提示提醒补充关键细节。");

                const html = `
                    <style>
                        .nsx-ai-form .layui-form-label{width:90px;padding-left:0}
                        .nsx-ai-form .layui-input-block{margin-left:120px}
                        .nsx-ai-tip{font-size:12px;color:#999;margin-top:4px}
                    </style>
                    <div class="layui-form nsx-ai-form" style="padding:16px 16px 0;">
                        <div class="layui-form-item">
                            <label class="layui-form-label">API类型</label>
                            <div class="layui-input-block">
                                <select id="nsx-ai-type" lay-filter="nsx-ai-type">
                                    <option value="openai" ${apiType === 'openai' ? 'selected' : ''}>OpenAI</option>
                                    <option value="custom" ${apiType === 'custom' ? 'selected' : ''}>自定义API</option>
                                </select>
                            </div>
                        </div>
                        <div class="layui-form-item">
                            <label class="layui-form-label">API地址</label>
                            <div class="layui-input-block">
                                <input type="text" id="nsx-ai-url" class="layui-input" value="${escHtml(apiUrl)}" placeholder="如 https://api.openai.com/v1/chat/completions">
                            </div>
                        </div>
                        <div class="layui-form-item">
                            <label class="layui-form-label">模型名称</label>
                            <div class="layui-input-block">
                                <input type="text" id="nsx-ai-model" class="layui-input" value="${escHtml(model)}" placeholder="如 gpt-3.5-turbo">
                                <div class="nsx-ai-tip">请输入您的API所使用的模型名称</div>
                            </div>
                        </div>
                        <div class="layui-form-item">
                            <label class="layui-form-label">API密钥</label>
                            <div class="layui-input-block">
                                <input type="password" id="nsx-ai-key" class="layui-input" value="${escHtml(apiKey)}" placeholder="sk-...">
                                <div class="nsx-ai-tip">您的API密钥将仅保存在本地浏览器中</div>
                            </div>
                        </div>
                        <div class="layui-form-item">
                            <label class="layui-form-label">系统提示词</label>
                            <div class="layui-input-block">
                                <textarea id="nsx-ai-prompt" class="layui-textarea" style="min-height:80px" placeholder="自定义AI美化风格">${escHtml(sysPrompt)}</textarea>
                                <div class="nsx-ai-tip">设置AI的美化风格</div>
                            </div>
                        </div>
                    </div>
                `;

                ctx.ui.layer.open({
                    title: 'AI美化配置',
                    content: html,
                    area: ['min(600px,94vw)', 'min(500px,90vh)'],
                    btn: ['保存', '测试连接', '取消'],
                    success: (layero) => {
                        layui.use(['form'], function () {
                            const form = layui.form;
                            form.render('select');
                            form.on('select(nsx-ai-type)', function (data) {
                                const typeInput = layero.find('#nsx-ai-url');
                                if (data.value === 'openai') {
                                    typeInput.val('https://api.openai.com/v1/chat/completions');
                                }
                            });
                        });
                    },
                    yes: (idx) => {
                        const r = document.getElementById("layui-layer" + idx) || document;
                        const type = r.querySelector("#nsx-ai-type")?.value || "openai";
                        const url = r.querySelector("#nsx-ai-url")?.value?.trim() || "";
                        const modelVal = r.querySelector("#nsx-ai-model")?.value?.trim() || "gpt-3.5-turbo";
                        const key = r.querySelector("#nsx-ai-key")?.value?.trim() || "";
                        const prompt = r.querySelector("#nsx-ai-prompt")?.value?.trim() || "";

                        if (!key) return ctx.ui?.warning?.("请输入API密钥");
                        if (!url) return ctx.ui?.warning?.("请输入API地址");
                        if (!modelVal) return ctx.ui?.warning?.("请输入模型名称");

                        ctx.store.set("ai_comment.api_type", type);
                        ctx.store.set("ai_comment.api_url", url);
                        ctx.store.set("ai_comment.model", modelVal);
                        ctx.store.set("ai_comment.api_key", key);
                        ctx.store.set("ai_comment.system_prompt", prompt);

                        ctx.ui.layer.close(idx);
                        ctx.ui?.success?.("配置已保存");
                    },
                    btn2: async (idx) => {
                        const r = document.getElementById("layui-layer" + idx) || document;
                        const url = r.querySelector("#nsx-ai-url")?.value?.trim() || "";
                        const key = r.querySelector("#nsx-ai-key")?.value?.trim() || "";
                        const modelVal = r.querySelector("#nsx-ai-model")?.value?.trim() || "";

                        if (!url || !key) return ctx.ui?.warning?.("请先填写API地址和密钥");

                        try {
                            await testConnection(url, key, modelVal);
                            ctx.ui?.success?.("连接成功！");
                        } catch (err) {
                            ctx.ui?.error?.("连接失败: " + err.message);
                        }
                        return false;
                    }
                });
            }

            async function generateAIReply(ctx, editor, btn) {
                // 获取帖子/评论内容
                const postContent = getPostContent();
                if (!postContent.text) {
                    ctx.ui?.error?.("无法获取帖子内容");
                    return;
                }

                btn.classList.add("loading");
                const originalHtml = btn.innerHTML;
                btn.innerHTML = `<svg class="nsx-ai-reply-icon" viewBox="0 0 48 48" fill="none"><path d="M24 4C13 4 4 13 4 24s9 20 20 20 20-9 20-20S35 4 24 4z" stroke="currentColor" stroke-width="4"/><path d="M24 14v10m0 4v6" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>生成中...`;

                try {
                    const apiType = ctx.store.get("ai_comment.api_type", "openai");
                    let apiUrl = ctx.store.get("ai_comment.api_url", "");
                    const apiKey = ctx.store.get("ai_comment.api_key", "");
                    const model = ctx.store.get("ai_comment.model", "gpt-3.5-turbo");
                    const systemPrompt = ctx.store.get("ai_comment.system_prompt", "");

                    // 智能补全 API 地址：自动追加 /v1/chat/completions
                    apiUrl = apiUrl.replace(/\/+$/, ""); // 去掉末尾斜杠
                    if (!apiUrl.includes("/chat/completions")) {
                        if (apiUrl.endsWith("/v1")) {
                            apiUrl += "/chat/completions";
                        } else {
                            apiUrl += "/v1/chat/completions";
                        }
                    }

                    // 构建消息内容：仅基于文本美化
                    const promptText = `请根据以下主题内容进行润色美化，输出可直接发布的 Markdown 成稿：\n\n${postContent.text}`;

                    await new Promise((resolve, reject) => {
                        GM_xmlhttpRequest({
                            method: "POST",
                            url: apiUrl,
                            headers: {
                                "Content-Type": "application/json",
                                "Authorization": `Bearer ${apiKey}`
                            },
                            data: JSON.stringify({
                                model: model,
                                messages: [
                                    { role: "system", content: systemPrompt },
                                    { role: "user", content: promptText }
                                ],
                                max_tokens: 500,
                                temperature: 0.7,
                                stream: false
                            }),
                            onload: (xhr) => {
                                try {
                                    // 先检查 HTTP 状态码
                                    if (xhr.status < 200 || xhr.status >= 300) {
                                        let errMsg = `HTTP ${xhr.status}`;
                                        try {
                                            const errBody = JSON.parse(xhr.responseText || "{}");
                                            if (errBody.error?.message) errMsg = errBody.error.message;
                                        } catch { }
                                        throw new Error(errMsg);
                                    }
                                    let responseText = (xhr.responseText || "").trim();
                                    let result;

                                    // 尝试直接解析 JSON
                                    try {
                                        result = JSON.parse(responseText);
                                    } catch (_) {
                                        // 如果直接解析失败，尝试按 SSE (Server-Sent Events) 格式解析
                                        // SSE 格式形如: data: {...}\ndata: {...}\ndata: [DONE]
                                        const lines = responseText.split("\n").filter(l => l.startsWith("data: ") && !l.includes("[DONE]"));
                                        if (lines.length > 0) {
                                            // 非流式：取最后一个完整的 data 行
                                            const lastLine = lines[lines.length - 1].replace(/^data:\s*/, "");
                                            result = JSON.parse(lastLine);
                                            // 如果是流式 SSE，拼接所有 delta content
                                            if (!result.choices?.[0]?.message && result.choices?.[0]?.delta) {
                                                let fullContent = "";
                                                for (const line of lines) {
                                                    try {
                                                        const chunk = JSON.parse(line.replace(/^data:\s*/, ""));
                                                        fullContent += chunk.choices?.[0]?.delta?.content || "";
                                                    } catch { }
                                                }
                                                result = { choices: [{ message: { content: fullContent } }] };
                                            }
                                        } else {
                                            throw new Error("无法解析API响应: " + responseText.substring(0, 200));
                                        }
                                    }

                                    if (result.choices && result.choices[0]) {
                                        const msg = result.choices[0].message || result.choices[0].delta;
                                        const aiReply = (msg?.content || "").trim();
                                        if (aiReply) {
                                            insertReplyText(editor, aiReply);
                                            ctx.ui?.success?.("AI美化已完成");
                                        } else {
                                            throw new Error("AI返回内容为空");
                                        }
                                    } else if (result.error) {
                                        throw new Error(result.error.message || "API返回错误");
                                    } else {
                                        throw new Error("API返回格式异常");
                                    }
                                    resolve();
                                } catch (err) {
                                    reject(err);
                                }
                            },
                            onerror: (err) => reject(new Error("请求失败: " + err))
                        });
                    });
                } catch (err) {
                    ctx.ui?.error?.("AI美化失败: " + err.message);
                } finally {
                    btn.classList.remove("loading");
                    btn.innerHTML = originalHtml;
                }
            }

            function getPostContent() {
                const isNewDiscussion = location.pathname.startsWith("/new-discussion");
                let text = "";
                let title = "";
                let contentText = "";

                if (isNewDiscussion) {
                    const titleEl = document.querySelector('input[name="title"], input[placeholder*="标题"], .md-editor input[type="text"]');
                    title = titleEl?.value?.trim?.() || "";

                    const cm = editor?.querySelector(".CodeMirror")?.CodeMirror;
                    if (cm && typeof cm.getValue === "function") {
                        contentText = (cm.getValue() || "").trim();
                    }
                    if (!contentText) {
                        const ta = editor?.querySelector("textarea") || document.querySelector("#editor textarea, .md-editor textarea, textarea");
                        contentText = ta?.value?.trim?.() || "";
                    }

                    if (title) text += "标题: " + title + "\n\n";
                    if (contentText) text += "内容: " + contentText;
                } else {
                    // 兼容帖子页
                    const titleEl = $(".nsk-post h1, .post-title, .post-content-title");
                    const contentEl = $(".nsk-post .post-content, .post-detail-content");
                    if (titleEl) text += "标题: " + titleEl.textContent.trim() + "\n\n";
                    if (contentEl) text += "内容: " + contentEl.textContent.trim();
                    if (!text) text = document.querySelector(".post-content")?.textContent || "";
                }

                return { text };
            }

            function insertReplyText(editor, text) {
                if (!text) return;
                const cm = editor.querySelector(".CodeMirror")?.CodeMirror;
                if (cm) {
                    const doc = cm.getDoc();
                    doc.setValue(text);
                    doc.setCursor(doc.lineCount(), 0);
                    cm.focus();
                    return;
                }
                const ta = editor.querySelector("textarea");
                if (!ta) return;
                ta.value = text;
                const pos = ta.value.length;
                ta.setSelectionRange(pos, pos);
                ta.dispatchEvent(new Event("input", { bubbles: true }));
                ta.focus();
            }

            async function testConnection(url, key, model) {
                return new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: "POST",
                        url: url,
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${key}`
                        },
                        data: JSON.stringify({
                            model: model,
                            messages: [{ role: "user", content: "Hello" }],
                            max_tokens: 10
                        }),
                        onload: (xhr) => {
                            if (xhr.status === 200) resolve({ status: xhr.status });
                            else reject(new Error(`HTTP ${xhr.status}`));
                        },
                        onerror: (err) => reject(err)
                    });
                });
            }
        }
    };

    const __vite_glob_0_15 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
        __proto__: null,
        default: aiComment
    }, Symbol.toStringTag, { value: 'Module' }));

    /* ==========================================================================
       [ 🚀 基础功能 ] - 自动签到系统
       ========================================================================== */
    const attendanceInFlight = new Set();
    // The attendance API also reports an already-completed day as success:false.
    // Match its explicit message, rather than treating arbitrary failures as done.
    const isAttendanceAlreadyDone = response => typeof response?.message === 'string' &&
        /^今天已完成签到[，,]请勿重复操作[。.!！]?$/.test(response.message.replace(/\s+/g, ''));
    const signIn = {
        id: "signIn",
        deps: ["ui"],
        order: 80,
        cfg: {
            sign_in: {
                ns: { enabled: true, method: 1, last_date: "", ignore_date: "" },
                df: { enabled: true, method: 1, last_date: "", ignore_date: "" }
            }
        },
        meta: {
            sign_in: {
                label: "自动签到", group: "🚀 基础功能",
                fields: { method: { type: "RADIO", label: "签到方式", valueType: "number", options: [{ value: 1, text: "随机🍗" }, { value: 2, text: "5个🍗" }] } },
                hidden: ["last_date", "ignore_date"]
            }
        },
        match: ctx => ctx.site && ctx.loggedIn && ctx.store.get(`sign_in.${ctx.site.code}.enabled`, true),
        async init(ctx) {
            const code = ctx.site.code;
            const method = ctx.store.get(`sign_in.${code}.method`, 1);
            const now = (() => {
                const off = new Date().getTimezoneOffset() + 480;
                const bj = new Date(Date.now() + off * 60000);
                return `${bj.getFullYear()}/${bj.getMonth() + 1}/${bj.getDate()}`;
            })();
            if (ctx.store.get(`sign_in.${code}.last_date`) === now || attendanceInFlight.has(code)) return;
            attendanceInFlight.add(code);
            try {
                const r = await net.post(`/api/attendance?random=${method === 1}`);
                if (r?.success === true) {
                    ctx.store.set(`sign_in.${code}.last_date`, now);
                    ctx.ui.success?.(`签到成功！+${r.gain}🍗，共${r.current}🍗`);
                } else if (isAttendanceAlreadyDone(r)) {
                    ctx.store.set(`sign_in.${code}.last_date`, now);
                    // Background attendance should stay quiet when the server confirms done.
                } else {
                    ctx.ui.info?.(r?.message || "签到失败");
                }
            } catch (e) { ctx.ui.info?.(e?.message || "签到错误"); }
            finally { attendanceInFlight.delete(code); }
        }
    };

    const __vite_glob_0_16 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
        __proto__: null,
        default: signIn
    }, Symbol.toStringTag, { value: 'Module' }));

    /* ==========================================================================
       [ 🚀 基础功能 ] - 签到过期提醒
       ========================================================================== */

    const CSS = `.nsplus-tip{background:rgba(255,217,0,.8);padding:3px;text-align:center;animation:blink 5s ease infinite}.nsplus-tip p,.nsplus-tip p a{color:#f00}.nsplus-tip p a:hover{color:#0ff}`;

    const signinTips = {
        id: "signinTips",
        deps: ["ui"],
        order: 79,
        cfg: { signin_tips: { enabled: true } },
        meta: { signin_tips: { label: "签到提示", group: "🚀 基础功能" } },
        match(ctx) {
            if (!ctx.site || !ctx.loggedIn || !ctx.store.get("signin_tips.enabled", true)) return false;
            return ctx.store.get(`sign_in.${ctx.site.code}.enabled`, true) === false;
        },
        init(ctx) {
            addStyle("nsx-signtip", CSS);
            const code = ctx.site.code;
            const now = (() => { const d = new Date(Date.now() + (new Date().getTimezoneOffset() + 480) * 6e4); return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`; })();
            if (now === ctx.store.get(`sign_in.${code}.ignore_date`) || now === ctx.store.get(`sign_in.${code}.last_date`)) return;

            const header = $("header");
            if (!header) return;
            const tip = document.createElement("div");
            tip.className = "nsplus-tip";
            tip.innerHTML = `<p>今天还没签到！【<a class="nsx-sign" data-r="1">随机🍗</a>】【<a class="nsx-sign" data-r="0">5个🍗</a>】【<a class="nsx-ign">今天不提示</a>】</p>`;
            header.appendChild(tip);

            const signLinks = $$(".nsx-sign", tip);
            signLinks.forEach(a => a.onclick = async e => {
                e.preventDefault();
                if (attendanceInFlight.has(code)) return;
                attendanceInFlight.add(code);
                signLinks.forEach(link => { link.setAttribute('aria-disabled', 'true'); link.setAttribute('aria-busy', 'true'); });
                try {
                    const r = await net.post(`/api/attendance?random=${a.dataset.r === "1"}`);
                    if (r?.success === true) {
                        ctx.store.set(`sign_in.${code}.last_date`, now);
                        tip.remove();
                        ctx.ui.success?.(`签到成功！+${r.gain}🍗`);
                    } else if (isAttendanceAlreadyDone(r)) {
                        ctx.store.set(`sign_in.${code}.last_date`, now);
                        tip.remove();
                        ctx.ui.info?.(r.message);
                    } else {
                        ctx.ui.info?.(r?.message || "签到失败，请重试");
                    }
                } catch (e) { ctx.ui.warning?.(e?.message || "签到失败，请重试"); }
                finally {
                    attendanceInFlight.delete(code);
                    signLinks.forEach(link => { link.removeAttribute('aria-disabled'); link.removeAttribute('aria-busy'); });
                }
            });
            $(".nsx-ign", tip).onclick = e => { e.preventDefault(); tip.remove(); ctx.store.set(`sign_in.${code}.ignore_date`, now); };
        }
    };

    const __vite_glob_0_17 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
        __proto__: null,
        default: signinTips
    }, Symbol.toStringTag, { value: 'Module' }));

    /* ==========================================================================
       [ 🧭 辅助工具 ] - 网页平滑滚动
       ========================================================================== */
    const smoothScroll = {
        id: "smoothScroll",
        order: 340,
        cfg: { smooth_scroll: { enabled: true } },
        meta: { smooth_scroll: { label: "网页平滑滚动", group: "🧭 辅助工具" } },
        match: ctx => ctx.store.get("smooth_scroll.enabled", true),
        init() {
            addStyle("nsx-smooth", "html{scroll-behavior:smooth}");
        }
    };

    const __vite_glob_0_18 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
        __proto__: null,
        default: smoothScroll
    }, Symbol.toStringTag, { value: 'Module' }));

    /* ==========================================================================
       [ 🧭 辅助工具 ] - 侧边卡片通知增强
       ========================================================================== */

    class Broadcast {
        static ins = new Map();
        constructor(name) {
            if (Broadcast.ins.has(name)) return Broadcast.ins.get(name);
            this.myId = `${Date.now()}-${Math.random()}`;
            this.recv = [];
            this.KEY = `nsx_tab_${name}`;
            try { this.ch = new BroadcastChannel(name); this.ch.onmessage = e => this.recv.forEach(f => f(e.data)); } catch { this.ch = null; }
            addEventListener("storage", e => { if (e.key === this.KEY) { e.newValue || localStorage.setItem(this.KEY, this.myId); this._up(); } });
            addEventListener("beforeunload", () => { if (this.active) localStorage.removeItem(this.KEY); });
            localStorage.setItem(this.KEY, this.myId);
            this._up();
            Broadcast.ins.set(name, this);
        }
        _up() { this.active = localStorage.getItem(this.KEY) === this.myId; }
        on(fn) { this.recv.push(fn); }
        send(data) { if (!this.ch) return; const m = { sender: this.myId, data }; this.ch.postMessage(m); this.recv.forEach(f => f(m)); }
        task(fn, ms) {
            let timer = null;
            let backoff = 1;
            const run = async () => {
                if (!this.active || document.hidden) {
                    timer = setTimeout(run, ms);
                    return;
                }
                try {
                    const d = await fn();
                    if (d !== undefined) this.send(d);
                    backoff = 1;
                } catch {
                    backoff = Math.min(backoff * 2, 6);
                }
                timer = setTimeout(run, ms * backoff);
            };
            run();
            return () => timer && clearTimeout(timer);
        }
    }

    const userCardExt = {
        id: "userCardExt",
        order: 200,
        cfg: { user_card_ext: { enabled: true } },
        meta: { user_card_ext: { label: "侧边卡片通知增强", group: "🧭 辅助工具" } },
        match: ctx => ctx.loggedIn && (ctx.isPost || ctx.isList) && ctx.store.get("user_card_ext.enabled", true),
        async init(ctx) {
            const bn = new Broadcast("nsx_notify");
            const card = $(".user-card .user-stat");
            const last = card?.querySelector(".stat-block:first-child > :last-child");
            if (!card || !last) return;

            const atEl = last.cloneNode(true), msgEl = last.cloneNode(true);
            last.after(atEl);
            card.querySelector(".stat-block:last-child")?.append(msgEl);

            const up = (el, href, icon, text, cnt) => {
                const a = el.querySelector("a");
                if (!a) return;
                a.href = href;
                el.querySelector("a svg use")?.setAttribute("href", icon);
                const t = el.querySelector("a > :nth-child(2)");
                if (t) t.textContent = `${text} `;
                const c = el.querySelector("a > :last-child");
                if (c) { c.textContent = cnt; c.classList.toggle("notify-count", cnt > 0); }
            };
            const upAll = c => { up(atEl, "/notification#/atMe", "#at-sign", "我", c.atMe); up(msgEl, "/notification#/message?mode=list", "#envelope-one", "私信", c.message); up(last, "/notification#/reply", "#remind-6nce9p47", "回复", c.reply); };

            bn.on(({ data }) => { if (data?.type === "unreadCount" && data.counts) upAll(data.counts); });
            bn.send({ type: "unreadCount", counts: ctx.user?.unViewedCount || {}, timestamp: Date.now() });
            bn.task(async () => {
                const r = await fetch("/api/notification/unread-count", { credentials: "include" });
                if (!r.ok) throw 0;
                const d = await r.json();
                if (d?.success && d.unreadCount) return { type: "unreadCount", counts: d.unreadCount, timestamp: Date.now() };
                throw 0;
            }, 5000);
        }
    };

    const __vite_glob_0_19 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
        __proto__: null,
        default: userCardExt
    }, Symbol.toStringTag, { value: 'Module' }));

    /* ==========================================================================
       [ 🎨 视觉美化 ] - 已访问帖子链接染色
       ========================================================================== */

    const DEFAULT_LIGHT = "#afb9c1";
    const DEFAULT_DARK = "#393f4e";
    const VISITED_POSTS_KEY = "nsx_visited_posts";
    const VISITED_POSTS_LIMIT = 4000;

    const getVisitedPostKey = (href) => {
        if (!href) return "";
        try {
            const url = new URL(href, location.origin);
            const id = url.pathname.match(/^\/post-(\d+)/)?.[1];
            return id ? `post:${id}` : `${url.origin}${url.pathname}`;
        } catch {
            return "";
        }
    };

    const readVisitedPosts = () => {
        try {
            const parsed = JSON.parse(localStorage.getItem(VISITED_POSTS_KEY) || "[]");
            return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
        } catch {
            return [];
        }
    };

    const writeVisitedPosts = (items) => {
        const uniq = [...new Set((items || []).filter(Boolean))];
        localStorage.setItem(VISITED_POSTS_KEY, JSON.stringify(uniq.slice(-VISITED_POSTS_LIMIT)));
    };

    const markVisitedPostLink = (link, visitedSet) => {
        if (!link) return;
        const key = getVisitedPostKey(link.href);
        if (!key) return;
        if (visitedSet?.has(key)) link.classList.add("nsx-visited-link");
        else link.classList.remove("nsx-visited-link");
    };

    const visitedColor = {
        id: "visitedColor",
        order: 350,
        cfg: { visited_color: { enabled: true, light: DEFAULT_LIGHT, dark: DEFAULT_DARK } },
        meta: {
            visited_color: {
                label: "已访问颜色",
                group: "🎨 视觉美化",
                // cols: 2,
                fields: {
                    light: { type: "COLOR", label: "浅色模式" },
                    dark: { type: "COLOR", label: "深色模式" }
                }
            }
        },
        match: ctx => ctx.isList && ctx.store.get("visited_color.enabled", true),
        init(ctx) {
            const light = ctx.store.get("visited_color.light", DEFAULT_LIGHT);
            const dark = ctx.store.get("visited_color.dark", DEFAULT_DARK);
            addStyle("nsx-visited-color", `.post-list .post-title a:visited,.post-list .post-title a.nsx-visited-link{color:${light}}body.dark-layout .post-list .post-title a:visited,body.dark-layout .post-list .post-title a.nsx-visited-link{color:${dark}}`);

            const applyVisitedState = (links = $$(".post-list .post-title a[href*='/post-']")) => {
                const visitedSet = new Set(readVisitedPosts());
                links.forEach(link => markVisitedPostLink(link, visitedSet));
            };

            const persistVisitedLink = (link) => {
                const key = getVisitedPostKey(link?.href);
                if (!key) return;
                const list = readVisitedPosts();
                if (list.includes(key)) {
                    link.classList.add("nsx-visited-link");
                    return;
                }
                list.push(key);
                writeVisitedPosts(list);
                link.classList.add("nsx-visited-link");
            };

            applyVisitedState();
            document.addEventListener("click", (e) => {
                const link = e.target.closest(".post-list .post-title a[href*='/post-']");
                if (!link) return;
                persistVisitedLink(link);
            }, true);
            document.addEventListener("auxclick", (e) => {
                const link = e.target.closest(".post-list .post-title a[href*='/post-']");
                if (!link) return;
                persistVisitedLink(link);
            }, true);

            window.__nsxRuntime ||= {};
            window.__nsxRuntime.refreshVisitedColor = applyVisitedState;
        },
        watch: () => ({ sel: ".post-list .post-title a[href*='/post-']", fn: els => window.__nsxRuntime?.refreshVisitedColor?.(els), opts: { debounce: 100 } })
    };

    const __vite_glob_0_20 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
        __proto__: null,
        default: visitedColor
    }, Symbol.toStringTag, { value: 'Module' }));

    /* ==========================================================================
       [ 🧭 辅助工具 ] - 邮箱导航入口
       ========================================================================== */
    const EMAIL_LINK_URL = "https://seek.li/";

    const emailNavLink = {
        id: "emailNavLink",
        order: 205,
        cfg: { email_nav_link: { enabled: true } },
        meta: { email_nav_link: { label: "邮箱入口", group: "🧭 辅助工具" } },
        match: ctx => ctx.store.get("email_nav_link.enabled", true),
        init(ctx) {
            const TEXT_LINK_ID = "nsx-email-nav";
            const ICON_LINK_ID = "nsx-email-icon-link";

            const isMobile = document.documentElement.classList.contains("nsx-mobile");

            const ensureEntry = () => {
                const headerLinks = [...document.querySelectorAll("header a")];
                const deepFloodLink = headerLinks.find(a => {
                    const t = a.textContent.trim();
                    return t === "DeepFlood" || t === "DF";
                });
                const textLink = document.getElementById(TEXT_LINK_ID);
                const iconLink = document.getElementById(ICON_LINK_ID);

                // 手机端或找到 DF/DeepFlood 链接时，使用文字链接
                if (deepFloodLink || isMobile) {
                    iconLink?.remove();
                    if (textLink) {
                        if (deepFloodLink && textLink.previousElementSibling !== deepFloodLink) deepFloodLink.after(textLink);
                        return true;
                    }

                    const newLink = document.createElement("a");
                    newLink.id = TEXT_LINK_ID;
                    newLink.href = EMAIL_LINK_URL;
                    newLink.textContent = "邮箱";
                    newLink.target = "_blank";
                    newLink.rel = "noopener noreferrer";
                    if (deepFloodLink) {
                        newLink.className = deepFloodLink.className;
                        newLink.style.marginLeft = "16px";
                        deepFloodLink.after(newLink);
                    } else {
                        // 手机端没有 DF 链接时，追加到 header 导航最后
                        const navLinks = document.querySelector("header .nav-links, header nav, #nsk-head .header-nav");
                        if (navLinks) {
                            const lastLink = [...navLinks.querySelectorAll("a")].pop();
                            if (lastLink) {
                                newLink.className = lastLink.className;
                                newLink.style.marginLeft = "16px";
                                lastLink.after(newLink);
                            } else {
                                navLinks.appendChild(newLink);
                            }
                        }
                    }
                    return true;
                }

                // 桌面端无 DeepFlood 链接时，使用图标
                const grp = ensureIconGroup();
                if (!grp) return false;

                if (textLink) textLink.remove();
                if (iconLink) return true;

                const newIconLink = document.createElement("a");
                newIconLink.id = ICON_LINK_ID;
                newIconLink.href = EMAIL_LINK_URL;
                newIconLink.target = "_blank";
                newIconLink.rel = "noopener noreferrer";
                newIconLink.className = "email-dropdown-on";
                newIconLink.title = "邮箱";
                newIconLink.innerHTML = `<svg class="iconpark-icon" style="width:17px;height:17px"><use href="#envelope-one"></use></svg>`;
                grp.appendChild(newIconLink);
                return true;
            };

            ensureEntry();

            const header = document.querySelector("header");
            if (!header) return;
            const syncEntry = debounce(() => { ensureEntry(); }, 120);
            new MutationObserver(syncEntry).observe(header, { childList: true, subtree: true });
        }
    };

    const __vite_glob_0_22 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
        __proto__: null,
        default: emailNavLink
    }, Symbol.toStringTag, { value: 'Module' }));

    /* ==========================================================================
       [ 🎨 视觉美化 ] - 相对时间中文化
       ========================================================================== */
    const timeChinese = {
        id: "timeChinese",
        order: 110,
        cfg: { time_chinese: { enabled: true } },
        meta: { time_chinese: { label: "时间中文化", group: "🎨 视觉美化" } },
        match: ctx => ctx.store.get("time_chinese.enabled", true),
        init(ctx) {
            const trans = (text) => {
                if (!text) return text;
                let res = text.trim();
                const lower = res.toLowerCase();
                if (lower.includes('just now')) return '刚刚';

                let prefix = "";
                if (lower.startsWith('edited')) {
                    prefix = "编辑于 ";
                    res = res.substring(6).trim();
                }

                res = res.replace(/(\d+)\s*y(ears?)?/gi, '$1年');
                res = res.replace(/(\d+)\s*mo(nths?)?/gi, '$1月');
                res = res.replace(/(\d+)\s*d(ays?)?/gi, '$1天');
                res = res.replace(/(\d+)\s*h(ours?)?/gi, '$1小时');
                res = res.replace(/(\d+)\s*min(utes?)?/gi, '$1分钟');
                res = res.replace(/(\d+)\s*s(econds?)?(?!\w)/gi, '$1秒');
                res = res.replace(/ago/gi, '前');

                return prefix + res.replace(/\s+/g, '');
            };
            const run = (els) => {
                els.forEach(el => {
                    const target = el.tagName === 'TIME' ? el : (el.querySelector('time') || el);
                    if (target.dataset.nsxTime) return;
                    const orig = target.textContent.trim();
                    if (!orig || /^\d{4}-\d{2}-\d{2}/.test(orig)) return;

                    const translated = trans(orig);
                    if (orig !== translated) {
                        target.dataset.nsxTime = orig;
                        target.textContent = translated;
                    }
                });
            };
            const sels = 'time, .date-created, .date-updated, .post-info, .comment-info';
            const doRun = () => run(ctx.$$(sels));
            doRun();
            ctx.watch(sels, doRun, { debounce: 200 });
        }
    };

    const __vite_glob_0_21 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
        __proto__: null,
        default: timeChinese
    }, Symbol.toStringTag, { value: 'Module' }));


    // ===== SVG 图标 =====
    const SVG_SPRITE = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">
<symbol id="copy" viewBox="0 0 48 48"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="4" d="M13 12.432v-4.62A2.813 2.813 0 0 1 15.813 5h24.374A2.813 2.813 0 0 1 43 7.813v24.375A2.813 2.813 0 0 1 40.188 35h-4.672M7.813 13h24.374A2.813 2.813 0 0 1 35 15.813v24.374A2.813 2.813 0 0 1 32.188 43H7.813A2.813 2.813 0 0 1 5 40.188V15.813A2.813 2.813 0 0 1 7.813 13Z"/></symbol>
<symbol id="check" viewBox="0 0 48 48"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="4" d="m4 24 5-5 10 10L39 9l5 5-25 25L4 24Z"/></symbol>
<symbol id="history" viewBox="0 0 48 48"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="4"><path d="M5.818 6.727V14h7.273"/><path d="M4 24c0 11.046 8.954 20 20 20s20-8.954 20-20S35.046 4 24 4c-7.32 0-13.715 3.932-17.192 9.8"/><path d="M24 12v14l9.33 9.33"/></g></symbol>
<symbol id="comments" viewBox="0 0 48 48"><g fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="4"><path d="M44 6H4v30h8.5v7l9-7H44V6Z"/><path stroke-linecap="round" d="M14 19.5h20M14 27.5h12"/></g></symbol>
<symbol id="at-sign" viewBox="0 0 48 48"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="4"><path d="M24 44c11.046 0 20-8.954 20-20S35.046 4 24 4 4 12.954 4 24s8.954 20 20 20"/><path d="M32 24c0 4.418-3.582 10-8 10s-8-5.582-8-10 3.582-8 8-8 8 3.582 8 8m0 0v10c0 3 3 6 6 6"/></g></symbol>
<symbol id="envelope-one" viewBox="0 0 48 48"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="4"><path d="M4 39h40V9H4z"/><path d="m4 9 20 15L44 9"/></g></symbol>
<symbol id="remind-6nce9p47" viewBox="0 0 48 48"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="4"><path d="M24 44c1.387 0 2.732-.123 4.023-.357M44 24a20 20 0 0 0-40 0c0 4.59 1.55 8.82 4.157 12.194L4 44l7.806-4.157A19.9 19.9 0 0 0 24 44a20 20 0 0 0 4.023-.357"/><path d="M33.805 40a6 6 0 1 0 5.857-9.805"/></g></symbol>
<symbol id="down" viewBox="0 0 48 48"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="4" d="m36 18-12 12-12-12"/></symbol>
</svg>`;

    // ===== 基础 CSS =====
    const BASE_CSS = `.blocked-post{display:none!important}#nsx-toggle-autoload{display:flex;justify-content:center;align-items:center}#back-to-comment{display:flex}#fast-nav-button-group .nav-item-btn:nth-last-child(4){bottom:120px}#fast-nav-button-group .nav-item-btn:nth-last-child(5){bottom:160px}#fast-nav-button-group .nav-item-btn:nth-last-child(6){bottom:200px}#fast-nav-button-group .nav-item-btn:nth-last-child(7){bottom:240px}#nsx-icon-group{display:flex;align-items:center;gap:0!important;list-style:none;border-left:1px solid var(--border-color,#e5e7eb);margin-left:6px!important;padding-left:6px!important;height:30px}#nsx-icon-group>.filter-dropdown-on,#nsx-icon-group>.relation-dropdown-on,#nsx-icon-group>.history-dropdown-on,#nsx-icon-group>.email-dropdown-on{cursor:pointer;display:flex!important;align-items:center;justify-content:center;height:30px!important;padding:0 6px!important;min-width:auto!important;width:auto!important;margin:0!important;position:relative!important;top:0!important;transition:opacity .1s;color:inherit;text-decoration:none}#nsx-icon-group>.filter-dropdown-on svg,#nsx-icon-group>.relation-dropdown-on svg,#nsx-icon-group>.history-dropdown-on svg,#nsx-icon-group>.email-dropdown-on svg{display:block!important;width:16px!important;height:16px!important;transform:translateY(0)!important}#nsx-icon-group>.filter-dropdown-on:hover,#nsx-icon-group>.relation-dropdown-on:hover,#nsx-icon-group>.history-dropdown-on:hover,#nsx-icon-group>.email-dropdown-on:hover{opacity:.6}#nsx-filter-panel,#nsx-history-panel,#nsx-rel-panel{position:fixed;right:12px;top:60px;width:min(380px,94vw);height:min(700px,80vh);background:#fff;border:1px solid #e4e4e4;border-radius:12px;box-shadow:0 16px 32px rgba(0,0,0,.12);z-index:99999;display:none;flex-direction:column;overflow:hidden}#nsx-filter-panel.show,#nsx-history-panel.show,#nsx-rel-panel.show{display:flex}.nsx-mode-layer .layui-layer-content{overflow:visible!important;padding-bottom:8px}.nsx-mode-layer .layui-form-select dl{z-index:999999!important}.dark-layout #nsx-filter-panel,.dark-layout #nsx-history-panel,.dark-layout #nsx-rel-panel{background:#1e1e1e;border-color:#3a3a3a;color:#e0e0e0}.dark-layout #nsx-icon-group{border-left-color:#3a3a3a}.msc-overlay{background-color:var(--bg-sub-color)}.nsx-mobile .md-editor .mde-toolbar{display:flex;flex-wrap:wrap;align-items:center;height:auto!important;min-height:40px;padding-right:4px;overflow:visible}.nsx-mobile .md-editor .mde-toolbar>*{flex:0 0 auto}.nsx-mobile .md-editor .mde-toolbar .toolbar-item{height:30px;line-height:30px}.nsx-mobile .md-editor .mde-toolbar .toolbar-item.right{margin-left:auto}.nsx-mobile .md-editor .mde-toolbar .toolbar-tabs{width:100%;order:-1}.nsx-mobile .layui-layer{max-width:94vw!important}.nsx-mobile .layui-layer .layui-form-label{width:auto!important;float:none!important;text-align:left!important;padding:0 0 4px!important}.nsx-mobile .layui-layer .layui-input-block{margin-left:0!important}.nsx-mobile .nsx-ai-form .layui-form-label{width:auto!important;float:none!important;text-align:left!important;padding:0 0 4px!important}.nsx-mobile .nsx-ai-form .layui-input-block{margin-left:0!important}`;

    const applyRuntimeSettings = (ctx, changedKeys = []) => {
        const changed = new Set(changedKeys || []);
        const has = (prefix) => [...changed].some(k => k === prefix || k.startsWith(prefix + "."));

        if (has("block_posts")) window.__nsxRuntime?.reapplyKeywords?.();
        if (has("relation")) window.__nsxRuntime?.reapplyRelation?.();
        if (has("history")) window.__nsxRuntime?.refreshHistory?.();
        if (has("visited_color")) {
            const styleId = "nsx-visited-color";
            const enabled = ctx.store.get("visited_color.enabled", true);
            const old = document.getElementById(styleId);
            if (!enabled) {
                old?.remove();
            } else {
                const light = ctx.store.get("visited_color.light", DEFAULT_LIGHT);
                const dark = ctx.store.get("visited_color.dark", DEFAULT_DARK);
                const css = `.post-list .post-title a:visited,.post-list .post-title a.nsx-visited-link{color:${light}}body.dark-layout .post-list .post-title a:visited,body.dark-layout .post-list .post-title a.nsx-visited-link{color:${dark}}`;
                if (old && old.tagName === "STYLE") {
                    old.textContent = css;
                } else {
                    old?.remove();
                    const el = document.createElement("style");
                    el.id = styleId;
                    el.textContent = css;
                    document.head?.appendChild(el);
                }
            }
            window.__nsxRuntime?.refreshVisitedColor?.();
        }

        if (has("button_pos") || has("layout") || has("ui")) {
            addStyle("nsx-icon-pos-runtime", ``);
        }
    };

    // ===== Observer =====
    class Observer {
        constructor() { this.listeners = []; this.mo = null; }
        watch(sel, fn, opts = {}) {
            this.listeners.push({ sel, fn, opts });
            if (!this.mo) {
                this.mo = new MutationObserver(debounce((muts) => {
                    if (!muts?.some(m => m.addedNodes?.length)) return;
                    this._run();
                }, 50));
                this.mo.observe(document.body, { childList: true, subtree: true });
            }
        }
        _run() {
            this.listeners.forEach(({ sel, fn, opts }) => {
                const els = $$(sel);
                if (els.length) fn(els, opts);
            });
        }
    }

    // ===== 创建 ctx =====
    function createCtx(obs) {
        const uw = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
        return {
            env, $, $$, addStyle, store, net,
            uw,
            get loggedIn() { return !!uw?.__config__?.user; },
            get user() { return uw?.__config__?.user; },
            get uid() { return uw?.__config__?.user?.member_id; },
            site: env.site,
            isPost: /^\/post-/.test(location.pathname),
            isList: /^\/(categories\/|page|award|search|$)/.test(location.pathname),
            watch: obs.watch.bind(obs),
            ui: {}
        };
    }

    // ===== 启动 =====
    function start() {
        const isMobileClient = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.matchMedia?.("(hover: none) and (pointer: coarse)")?.matches;
        if (isMobileClient) document.documentElement.classList.add("nsx-mobile");

        // 注入资源
        document.body?.insertAdjacentHTML("beforeend", SVG_SPRITE);
        addStyle("nsx-base", BASE_CSS);
        // layui CSS
        addStyle("nsx-layui-css", "https://s.cfn.pp.ua/layui/2.10.3/css/layui.css");
        addStyle("nsx-layui-dark", "https://s.cfn.pp.ua/layui/theme-dark/2.10.3/css/layui-theme-dark-selector.css");

        // highlight.js 脚本
        addScript("nsx-hljs-script", "https://s4.zstatic.net/ajax/libs/highlight.js/11.9.0/highlight.min.js");
        // highlight.js 样式
        addStyle("hightlight-style", GM_getResourceURL("highlightStyle"));
        // hljs 初始化
        addScript("nsx-hljs-onload", `(()=>{const r=()=>{if(window.hljs&&typeof hljs.highlightAll==="function")hljs.highlightAll()};document.readyState==="complete"?r():window.addEventListener("load",r,{once:true})})()`);

        // 加载模块
        const mods = /* #__PURE__ */ Object.assign({ "./features/autoJump.js": __vite_glob_0_0, "./features/autoLoading.js": __vite_glob_0_1, "./features/callout.js": __vite_glob_0_5, "./features/codeHighlight.js": __vite_glob_0_6, "./features/commentShortcut.js": __vite_glob_0_7, "./features/replyStay.js": __vite_glob_0_cid_replyStay, "./features/darkMode.js": __vite_glob_0_8, "./features/history.js": __vite_glob_0_9, "./features/imageSlide.js": __vite_glob_0_10, "./features/instantPage.js": __vite_glob_0_11, "./features/levelTag.js": __vite_glob_0_12, "./features/menus.js": __vite_glob_0_13, "./features/quickComment.js": __vite_glob_0_14, "./features/aiComment.js": __vite_glob_0_15, "./features/signIn.js": __vite_glob_0_16, "./features/signinTips.js": __vite_glob_0_17, "./features/smoothScroll.js": __vite_glob_0_18, "./features/userCardExt.js": __vite_glob_0_19, "./features/visitedColor.js": __vite_glob_0_20, "./features/timeChinese.js": __vite_glob_0_21, "./features/emailNavLink.js": __vite_glob_0_22 });
        Object.values(mods).forEach(m => {
            const mod = m?.default;
            if (!mod) return;
            if (!AI && mod.id === "aiComment") return;
            define(mod);
        });

        // 创建 Observer & ctx
        const obs = new Observer();
        const ctx = createCtx(obs);
        ensureIconGroup();
        const headEl = document.querySelector('#nsk-head');
        if (headEl) {
            let syncingIconGroup = false;
            const syncIconGroup = debounce(() => {
                if (syncingIconGroup) return;
                syncingIconGroup = true;
                try { ensureIconGroup(); } finally { syncingIconGroup = false; }
            }, 120);
            new MutationObserver(syncIconGroup).observe(headEl, { childList: true });
        }

        // 初始化 UI (依赖 layui)
        const initUI = () => {
            if (!window.layui?.layer) return (ctx.ui = {});
            const layer = window.layui.layer, uw = ctx.uw;
            ctx.ui = {
                layer,
                toast: (text, style) => { const idx = layer.msg(text, { offset: 't', area: ['100%', 'auto'], anim: 'slideDown' }); layer.style(idx, Object.assign({ opacity: 0.9 }, style)); return idx; },
                info: msg => ctx.ui.toast(msg, { "background-color": "#4D82D6" }),
                success: msg => ctx.ui.toast(msg, { "background-color": "#57BF57" }),
                warning: msg => ctx.ui.toast(msg, { "background-color": "#D6A14D" }),
                error: msg => ctx.ui.toast(msg, { "background-color": "#E1715B" }),
                alert: (t, c, fn) => uw?.mscAlert ? (c === undefined ? uw.mscAlert(t) : uw.mscAlert(t, c)) : layer.alert(c, { title: t, icon: 0, btn: ["确定"] }, fn),
                confirm: (t, c, y, n) => uw?.mscConfirm ? uw.mscConfirm(t, c, y, n) : layer.confirm(c, { title: t, icon: 0, btn: ["确定", "取消"] }, y, n),
                tips: (msg, el, opts) => layer.tips(msg, el, opts)
            };
        };
        initUI();
        if (!ctx.ui.layer) {
            const timer = setInterval(() => { if (window.layui?.layer) { initUI(); clearInterval(timer); } }, 100);
            setTimeout(() => clearInterval(timer), 5000);
        }

        // 启动所有模块
        /* ==========================================================================
           [ 🚀 基础功能 ] - 图床上传助手 (NodeImage)
           ========================================================================== */
        const imageUpload = {
            id: "imageUpload",
            deps: ["ui"],
            order: 150,
            cfg: { image_upload: { enabled: true, api_key: "" } },
            meta: {
                image_upload: {
                    label: "图床上传助手",
                    group: "🚀 基础功能",
                    fields: {
                        api_key: { type: "TEXT", label: "NodeImage API Key", placeholder: "留空或填写 API Key" }
                    }
                }
            },
            match: ctx => (ctx.isPost || location.pathname.startsWith('/new-discussion') || location.pathname.startsWith('/notification')) && ctx.store.get("image_upload.enabled", true),
            init(ctx) {
                const APP = {
                    api: {
                        key: ctx.store.get("image_upload.api_key", ""),
                        setKey: key => {
                            ctx.store.set("image_upload.api_key", key);
                            APP.api.key = key;
                            UI.updateState();
                        },
                        clearKey: () => {
                            ctx.store.set("image_upload.api_key", "");
                            APP.api.key = '';
                            UI.updateState();
                        },
                        endpoints: {
                            upload: 'https://api.nodeimage.com/api/upload',
                            apiKey: 'https://api.nodeimage.com/api/user/api-key'
                        }
                    },
                    site: { url: 'https://www.nodeimage.com' },
                    storage: {
                        keys: { loginCheck: 'nodeimage_login_check', loginStatus: 'nodeimage_login_status', logout: 'nodeimage_logout' },
                        get: key => localStorage.getItem(APP.storage.keys[key]),
                        set: (key, value) => localStorage.setItem(APP.storage.keys[key], value),
                        remove: key => localStorage.removeItem(APP.storage.keys[key])
                    },
                    retry: { max: 2, delay: 1000 },
                    statusTimeout: 2000,
                    auth: { recentLoginGracePeriod: 30000, loginCheckInterval: 3000, loginCheckTimeout: 300000 }
                };

                const SELECTORS = { editor: '.CodeMirror', toolbar: '.mde-toolbar', imgBtn: '.toolbar-item.i-icon.i-icon-pic[title="图片"]', container: '#nodeimage-toolbar-container' };

                const STATUS = {
                    SUCCESS: { class: 'success', color: '#42d392' },
                    ERROR: { class: 'error', color: '#f56c6c' },
                    WARNING: { class: 'warning', color: '#e6a23c' },
                    INFO: { class: 'info', color: '#0078ff' }
                };

                const MESSAGE = { READY: '图床已就绪', UPLOADING: '上传中...', UPLOAD_SUCCESS: '上传成功！', LOGIN_EXPIRED: '图床登录已失效', LOGOUT: '图床已退出登录', RETRY: (c, m) => `重试 (${c}/${m})` };

                const DOM = {
                    editor: null,
                    statusElements: new Set(),
                    loginButtons: new Set(),
                    getEditor: () => DOM.editor?.CodeMirror
                };

                addStyle("nsx-image-upload", `
                #nodeimage-status { margin-left: 10px; display: inline-block; font-size: 13px; height: 28px; line-height: 28px; transition: all 0.3s ease; }
                #nodeimage-status.success { color: ${STATUS.SUCCESS.color}; }
                #nodeimage-status.error { color: ${STATUS.ERROR.color}; }
                #nodeimage-status.warning { color: ${STATUS.WARNING.color}; }
                #nodeimage-status.info { color: ${STATUS.INFO.color}; }
                .nodeimage-login-btn { cursor: pointer; margin-left: 10px; color: ${STATUS.WARNING.color}; font-size: 13px; background: rgba(230,162,60,0.1); padding: 3px 8px; border-radius: 4px; border: 1px solid rgba(230,162,60,0.2); }
                .nodeimage-toolbar-container { display: flex; align-items: center; margin-left: auto; margin-right: 10px; }
            `);

                const Utils = {
                    waitForElement: selector => new Promise(res => {
                        const el = document.querySelector(selector);
                        if (el) return res(el);
                        new MutationObserver((_, o) => { const found = document.querySelector(selector); if (found) { o.disconnect(); res(found); } }).observe(document.body, { childList: true, subtree: true });
                    }),
                    isEditingInEditor: () => { const a = document.activeElement; return a && (a.classList.contains('CodeMirror') || a.closest('.CodeMirror') || a.tagName === 'TEXTAREA'); },
                    getActiveCodeMirror: (evtTarget = null) => {
                        const fromTarget = evtTarget?.closest?.('.CodeMirror')?.CodeMirror;
                        if (fromTarget) return fromTarget;
                        const active = document.activeElement;
                        const fromActive = active?.closest?.('.CodeMirror')?.CodeMirror || (active?.classList?.contains('CodeMirror') ? active.CodeMirror : null);
                        if (fromActive) return fromActive;
                        return DOM.getEditor();
                    },
                    createFileInput: cb => { const i = Object.assign(document.createElement('input'), { type: 'file', multiple: true, accept: 'image/*' }); i.onchange = e => cb([...e.target.files]); i.click(); },
                    delay: ms => new Promise(r => setTimeout(r, ms))
                };

                const API = {
                    request: ({ url, method = 'GET', data = null, headers = {}, withAuth = false }) => {
                        return new Promise((resolve, reject) => {
                            GM_xmlhttpRequest({
                                method, url,
                                headers: { 'Accept': 'application/json', ...(withAuth && APP.api.key ? { 'X-API-Key': APP.api.key } : {}), ...headers },
                                data, withCredentials: true, responseType: 'json',
                                onload: response => { if (response.status === 200 && response.response) resolve(response.response); else reject(response); },
                                onerror: reject
                            });
                        });
                    },
                    checkLoginAndGetKey: async () => {
                        try {
                            const response = await API.request({ url: APP.api.endpoints.apiKey });
                            if (response.api_key) { APP.api.setKey(response.api_key); return true; }
                            if (response.error) APP.api.clearKey();
                            return false;
                        } catch (error) { APP.api.clearKey(); return false; }
                    },
                    uploadImage: async (file, retries = 0) => {
                        try {
                            const formData = new FormData();
                            formData.append('image', file);
                            const result = await API.request({ url: APP.api.endpoints.upload, method: 'POST', data: formData, withAuth: true });
                            if (result.success) return { url: result.links.direct, markdown: result.links.markdown };
                            else {
                                const errorMsg = result.error || '未知错误';
                                if (errorMsg.toLowerCase().match(/unauthorized|invalid api key|未授权|无效的api密钥/)) { APP.api.clearKey(); throw new Error(MESSAGE.LOGIN_EXPIRED); }
                                throw new Error(errorMsg);
                            }
                        } catch (error) {
                            if (error.status === 401 || error.status === 403) { APP.api.clearKey(); throw new Error(MESSAGE.LOGIN_EXPIRED); }
                            if (retries < APP.retry.max) {
                                setStatus(STATUS.WARNING.class, MESSAGE.RETRY(retries + 1, APP.retry.max));
                                await Utils.delay(APP.retry.delay);
                                return API.uploadImage(file, retries + 1);
                            }
                            throw error instanceof Error ? error : new Error(String(error));
                        }
                    }
                };

                const setStatus = (cls, msg, ttl = 0) => { DOM.statusElements.forEach(el => { el.className = cls; el.textContent = msg; }); if (ttl) return Utils.delay(ttl).then(UI.updateState); };

                const UI = {
                    updateState: () => {
                        const isLoggedIn = Boolean(APP.api.key);
                        DOM.loginButtons.forEach(btn => { btn.style.display = isLoggedIn ? 'none' : 'inline-block'; });
                        DOM.statusElements.forEach(el => {
                            if (isLoggedIn) { el.className = STATUS.SUCCESS.class; el.textContent = MESSAGE.READY; }
                            else { el.textContent = ''; }
                        });
                    },
                    openLogin: () => { APP.storage.set('loginStatus', 'login_pending'); window.open(APP.site.url, '_blank'); },
                    setupToolbar: toolbar => {
                        if (!toolbar || toolbar.querySelector(SELECTORS.container)) return;
                        const container = document.createElement('div'); container.id = 'nodeimage-toolbar-container'; container.className = 'nodeimage-toolbar-container';

                        const fullScreenBtn = toolbar.querySelector('.i-icon-full-screen-one')?.parentElement || toolbar.querySelector('.i-icon-off-screen-one')?.parentElement || toolbar.querySelector('.toolbar-item.right');
                        if (fullScreenBtn) {
                            toolbar.insertBefore(container, fullScreenBtn);
                        } else {
                            toolbar.appendChild(container);
                        }

                        const imgBtn = toolbar.querySelector(SELECTORS.imgBtn);
                        if (imgBtn) {
                            const newBtn = imgBtn.cloneNode(true);
                            imgBtn.parentNode.replaceChild(newBtn, imgBtn);
                            newBtn.addEventListener('click', async () => {
                                DOM.editor = document.activeElement?.closest?.('.CodeMirror') || DOM.editor;
                                if (!APP.api.key || !(await Auth.checkLoginIfNeeded())) { UI.openLogin(); return; }
                                const targetCm = Utils.getActiveCodeMirror();
                                Utils.createFileInput(files => ImageHandler.handleFiles(files, targetCm));
                            });
                        }

                        const statusEl = document.createElement('div'); statusEl.id = 'nodeimage-status'; statusEl.className = STATUS.INFO.class;
                        container.appendChild(statusEl); DOM.statusElements.add(statusEl);
                        const loginBtn = document.createElement('div'); loginBtn.className = 'nodeimage-login-btn'; loginBtn.textContent = '登录 NodeImage';
                        loginBtn.addEventListener('click', UI.openLogin); loginBtn.style.display = 'none';
                        container.appendChild(loginBtn); DOM.loginButtons.add(loginBtn);
                        UI.updateState();
                    }
                };

                const ImageHandler = {
                    handlePaste: e => {
                        if (!Utils.isEditingInEditor()) return;
                        const targetCm = Utils.getActiveCodeMirror(e.target);
                        if (targetCm?.getWrapperElement) DOM.editor = targetCm.getWrapperElement();
                        const dt = e.clipboardData || e.originalEvent?.clipboardData; if (!dt) return;
                        let files = [];
                        if (dt.files && dt.files.length) { files = Array.from(dt.files).filter(f => f.type.startsWith('image/')); }
                        else if (dt.items && dt.items.length) { files = Array.from(dt.items).filter(i => i.kind === 'file' && i.type.startsWith('image/')).map(i => i.getAsFile()).filter(Boolean); }
                        if (files.length) {
                            e.preventDefault(); e.stopPropagation();
                            if (!APP.api.key) { UI.openLogin(); return; }
                            ImageHandler.handleFiles(files, targetCm);
                        }
                    },
                    handleFiles: (files, targetCm = null) => {
                        if (!APP.api.key) { UI.openLogin(); return; }
                        files.filter(file => file?.type.startsWith('image/')).forEach(file => ImageHandler.uploadAndInsert(file, targetCm));
                    },
                    uploadAndInsert: async (file, targetCm = null) => {
                        setStatus(STATUS.INFO.class, MESSAGE.UPLOADING);
                        try {
                            const result = await API.uploadImage(file);
                            ImageHandler.insertMarkdown(result.markdown, targetCm);
                            await setStatus(STATUS.SUCCESS.class, MESSAGE.UPLOAD_SUCCESS, APP.statusTimeout);
                        } catch (error) {
                            if (error.message === MESSAGE.LOGIN_EXPIRED) await Auth.checkLoginIfNeeded(true);
                            console.error('[NodeImage]', error);
                            await setStatus(STATUS.ERROR.class, `上传失败: ${error.message}`, APP.statusTimeout);
                            ctx.ui.error?.(`图片上传失败: ${error.message}`);
                        }
                    },
                    insertMarkdown: (markdown, preferredCm = null) => {
                        const cm = preferredCm || Utils.getActiveCodeMirror();
                        if (cm) { const cursor = cm.getCursor(); cm.replaceRange(`\n${markdown}\n`, cursor); }
                    }
                };

                const Auth = {
                    checkLoginIfNeeded: async (forceCheck = false) => {
                        if (APP.api.key && !forceCheck) return true;
                        const isLoggedIn = await API.checkLoginAndGetKey();
                        if (!isLoggedIn && APP.api.key) setStatus(STATUS.WARNING.class, MESSAGE.LOGIN_EXPIRED);
                        UI.updateState();
                        return isLoggedIn;
                    },
                    checkLogoutFlag: () => { if (APP.storage.get('logout') === 'true') { APP.api.clearKey(); APP.storage.remove('logout'); setStatus(STATUS.WARNING.class, MESSAGE.LOGOUT); } },
                    checkRecentLogin: async () => { const lastLoginCheck = APP.storage.get('loginCheck'); if (lastLoginCheck && (Date.now() - parseInt(lastLoginCheck) < APP.auth.recentLoginGracePeriod)) { await API.checkLoginAndGetKey(); APP.storage.remove('loginCheck'); } },
                    setupStorageListener: () => {
                        window.addEventListener('storage', event => {
                            const { loginStatus, logout } = APP.storage.keys;
                            if (event.key === loginStatus && event.newValue === 'login_success') { API.checkLoginAndGetKey(); localStorage.removeItem(loginStatus); }
                            else if (event.key === logout && event.newValue === 'true') { APP.api.clearKey(); localStorage.removeItem(logout); }
                        });
                    }
                };

                const initModule = async () => {
                    document.addEventListener('paste', ImageHandler.handlePaste, true);
                    window.addEventListener('focus', () => Auth.checkLoginIfNeeded());
                    Utils.waitForElement(SELECTORS.editor).then(editor => {
                        DOM.editor = editor;
                        editor.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
                        editor.addEventListener('drop', e => {
                            e.preventDefault();
                            const targetCm = Utils.getActiveCodeMirror(e.target);
                            if (targetCm?.getWrapperElement) DOM.editor = targetCm.getWrapperElement();
                            ImageHandler.handleFiles(Array.from(e.dataTransfer.files), targetCm);
                        });
                    });
                    Utils.waitForElement(SELECTORS.toolbar).then(UI.setupToolbar);
                    ctx.watch(SELECTORS.toolbar, () => {
                        const toolbar = document.querySelector(SELECTORS.toolbar);
                        if (toolbar && !toolbar.querySelector(SELECTORS.container)) UI.setupToolbar(toolbar);
                    }, { debounce: 200 });
                    const observer = new MutationObserver(() => {
                        const editor = document.querySelector(SELECTORS.editor);
                        if (editor) DOM.editor = editor;
                        const toolbar = document.querySelector(SELECTORS.toolbar);
                        if (toolbar && !toolbar.querySelector(SELECTORS.container)) UI.setupToolbar(toolbar);
                    });
                    observer.observe(document.body, {
                        childList: true,
                        subtree: true,
                        attributes: true,
                        attributeFilter: ['class', 'style']
                    });
                    document.addEventListener('click', e => {
                        if (e.target.closest('.tab-option')) {
                            setTimeout(() => {
                                const editor = document.querySelector(SELECTORS.editor);
                                if (editor) DOM.editor = editor;
                                const toolbar = document.querySelector(SELECTORS.toolbar);
                                if (toolbar && !toolbar.querySelector(SELECTORS.container)) UI.setupToolbar(toolbar);
                            }, 100);
                        }
                    });

                    Auth.checkLogoutFlag(); Auth.setupStorageListener(); await Auth.checkRecentLogin(); await Auth.checkLoginIfNeeded();
                };

                initModule();
            }
        };
        define(imageUpload);

        /* ==========================================================================
           [ 🧭 辅助工具 ] - 新标签页打开链接修复
           ========================================================================== */
        const openInNewTabFix = {
            id: "openInNewTabFix",
            order: 390,
            match: ctx => ctx.store.get("open_post_in_new_tab.enabled", false),
            meta: { open_post_in_new_tab: { label: "新标签页打开帖子", group: "🧭 辅助工具" } },
            init(ctx) {
                const addTarget = (els) => {
                    els.forEach(a => {
                        if (a.getAttribute("target") !== "_blank") {
                            a.setAttribute("target", "_blank");
                        }
                    });
                };
                addTarget(document.querySelectorAll('a[href^="/post-"]'));
                ctx.watch('a[href^="/post-"]', addTarget, { debounce: 100 });
            }
        };
        define(openInNewTabFix);

        const postPreview = {
            id: 'postPreview', order: 386,
            cfg: { post_preview: { enabled: true } },
            meta: { post_preview: { label: '列表帖子预览', group: '🧭 辅助工具' } },
            match: ctx => !ctx.isPost && ctx.store.get('post_preview.enabled', true),
            init(ctx) {
                const rows = '.post-list-item, .post-list .list-item';
                const states = new Map();
                let nextId = 0;
                addStyle('nsx-post-preview-style', `
                    .nsx-preview-row{position:relative!important;min-height:62px;box-sizing:border-box}
                    .nsx-preview-row>.post-list-content,.nsx-preview-content{flex:1 1 0%!important;min-width:0!important;width:0;max-width:100%;box-sizing:border-box;align-self:stretch}
                    .nsx-preview-heading{display:block!important;min-width:0;width:100%;box-sizing:border-box;padding-right:88px!important;min-height:26px}
                    .nsx-preview-heading>a,.nsx-preview-heading>span{display:inline!important;float:none!important;flex:none!important;width:auto!important;margin-left:0!important}
                    .nsx-preview-toggle{position:absolute;top:6px;right:16px;z-index:2;box-sizing:border-box;min-width:68px;height:23px;padding:0 9px;color:#000!important;background:#fff!important;border:1px solid #ccc!important;border-radius:4px;font:inherit;font-size:11px;font-weight:500;line-height:21px;cursor:pointer;white-space:nowrap;transition:background .15s ease,border-color .15s ease,color .15s ease}
                    .nsx-preview-toggle:hover{color:#000!important;background:#fff!important;border-color:#999!important}
                    .nsx-preview-toggle:focus-visible{outline:2px solid #86868b;outline-offset:2px}
                    .nsx-preview-toggle[aria-expanded="true"]{color:#000!important;background:#fff!important;border-color:#999!important}
                    .nsx-preview-toggle[aria-expanded="true"]:hover{color:#000!important;background:#fff!important;border-color:#666!important}
                    .dark-layout .nsx-preview-toggle,.dark .nsx-preview-toggle,.dark-layout .nsx-preview-toggle:hover,.dark .nsx-preview-toggle:hover,.dark-layout .nsx-preview-toggle[aria-expanded="true"],.dark .nsx-preview-toggle[aria-expanded="true"],.dark-layout .nsx-preview-toggle[aria-expanded="true"]:hover,.dark .nsx-preview-toggle[aria-expanded="true"]:hover{color:#000!important;background:#fff!important;border-color:#ccc!important}
                    .nsx-preview-panel{width:100%!important;align-self:stretch;margin:10px 0;padding:12px;border-radius:12px;background:rgba(125,140,160,.07);box-sizing:border-box;min-width:0;max-width:100%;font-size:13px;line-height:1.7}
                    .nsx-preview-panel[hidden]{display:none!important}
                    .nsx-preview-body{max-height:540px;max-height:min(540px,65vh);overflow:auto;overscroll-behavior:auto;scrollbar-gutter:stable;overflow-wrap:anywhere}
                    .nsx-preview-body img{max-width:100%;height:auto;border-radius:6px}
                    .nsx-preview-body pre{white-space:pre-wrap;overflow-wrap:anywhere;padding:10px;background:#8881;border-radius:6px}
                    .nsx-preview-body table{display:block;max-width:100%;overflow:auto}
                    .nsx-preview-body blockquote{margin:8px 0;padding:6px 12px;border-left:2px solid #8885}
                    .nsx-preview-entry{padding:10px;margin-bottom:8px;border-radius:9px;background:rgba(128,140,155,.06)}
                    .nsx-preview-author{display:flex;align-items:center;gap:7px;font-weight:600;margin-bottom:5px;color:var(--link-color,#4679aa)}
                    .nsx-preview-nav{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:10px}
                    .nsx-preview-nav button{border:0;border-radius:5px;background:#8882;color:inherit;padding:4px 9px;cursor:pointer}
                    .nsx-preview-status{font-size:12px;opacity:.8;margin-bottom:6px}
                    .nsx-preview-nav a{margin-left:auto}
                    .nsx-list-before-author{position:static!important;display:inline-flex!important;vertical-align:middle;width:auto!important;max-width:100%;margin:0 5px 0 0!important}
                `);
                const samePost = (value, id) => {
                    try { const u = new URL(value, location.origin); return u.origin === location.origin && new RegExp(`^/post-${id}-[1-9]\\d*/?$`).test(u.pathname) ? u : null; } catch { return null; }
                };
                // Rebuild a passive HTML subset. Never insert fetched scripts, handlers, forms or frames.
                const safeContent = (source, base) => {
                    const allowed = new Set('P DIV SPAN BR HR STRONG B EM I U S DEL BLOCKQUOTE PRE CODE UL OL LI H1 H2 H3 H4 H5 H6 TABLE THEAD TBODY TR TH TD A IMG DETAILS SUMMARY'.split(' '));
                    const blocked = new Set('SCRIPT STYLE IFRAME OBJECT EMBED FORM INPUT BUTTON TEXTAREA SELECT SVG MATH LINK META BASE'.split(' '));
                    const clean = node => {
                        if (node.nodeType === 3) return document.createTextNode(node.textContent);
                        const fragment = document.createDocumentFragment();
                        if (node.nodeType !== 1 || blocked.has(node.tagName)) return fragment;
                        const target = allowed.has(node.tagName) ? document.createElement(node.tagName.toLowerCase()) : fragment;
                        if (node.tagName === 'A' || node.tagName === 'IMG') {
                            const attr = node.tagName === 'A' ? 'href' : 'src';
                            const raw = node.getAttribute(attr);
                            try {
                                const url = raw && new URL(raw, base);
                                if (url && ['https:', 'http:'].includes(url.protocol)) {
                                    target.setAttribute(attr, url.href);
                                    if (attr === 'href') { target.target = '_blank'; target.rel = 'noopener noreferrer'; }
                                    else { target.loading = 'lazy'; target.referrerPolicy = 'no-referrer'; target.alt = node.getAttribute('alt') || ''; }
                                }
                            } catch {}
                        }
                        for (const child of node.childNodes) target.append(clean(child));
                        return target;
                    };
                    return clean(source);
                };
                // cid3：预览里的黑名单评论隐藏（官方 /api/block-list/list + 本插件「高级黑名单」）。
                const previewBlock = { ids: new Set(), names: new Set(), at: 0, failAt: 0, pending: null };
                const previewNorm = v => String(v || '').trim().toLowerCase();
                const loadPreviewBlock = () => {
                    const now = Date.now();
                    if ((previewBlock.at && now - previewBlock.at < 60000) || (previewBlock.failAt && now - previewBlock.failAt < 15000)) return Promise.resolve();
                    if (previewBlock.pending) return previewBlock.pending;
                    previewBlock.pending = (async () => {
                        try {
                            const r = await fetch('/api/block-list/list', { credentials: 'include', headers: { Accept: 'application/json' } });
                            const d = await r.json().catch(() => null);
                            if (!r.ok || !d || d.success === false || !Array.isArray(d.data)) throw Error('block-list unavailable');
                            const ids = new Set(), names = new Set();
                            for (const item of d.data) {
                                if (item?.block_member_id != null) ids.add(String(item.block_member_id));
                                const n = previewNorm(item?.block_member_name); if (n) names.add(n);
                            }
                            previewBlock.ids = ids; previewBlock.names = names; previewBlock.at = Date.now(); previewBlock.failAt = 0;
                        } catch { previewBlock.failAt = Date.now(); } // 失败时沿用上次成功的名单（首次失败则不隐藏）
                        finally { previewBlock.pending = null; }
                    })();
                    return previewBlock.pending;
                };
                const previewLocalBlacklist = () => {
                    if (!ctx.store.get('relation.blacklist_enabled', true)) return null;
                    try { const m = JSON.parse(localStorage.getItem('nsx_advanced_blacklist') || '{}'); return m && typeof m === 'object' ? m : null; } catch { return null; }
                };
                const isPreviewBlocked = (uid, name, record, local) => {
                    if (record?.blocked === true) return true;
                    const id = /^\d+$/.test(String(uid ?? '')) ? String(uid) : '';
                    const n = String(name || '').trim();
                    if (id && previewBlock.ids.has(id)) return true;
                    if (n && previewBlock.names.has(previewNorm(n))) return true;
                    if (!local) return false;
                    const globalMode = ctx.store.get('relation.blacklist_mode', 'fold');
                    for (const [un, info] of Object.entries(local)) {
                        if (!((n && un === n) || (id && info?.userId != null && String(info.userId) === id))) continue;
                        const raw = info?.mode === 'hide' ? 'official' : (info?.mode || (globalMode === 'hide' ? 'official' : globalMode));
                        if (raw !== 'mark') return true; // 「标记模式」只做标记，不隐藏
                    }
                    return false;
                };
                const setup = row => {
                    if (states.has(row) || row.closest('.nsx-preview-panel')) return;
                    const heading = row.querySelector('.post-title');
                    const link = heading?.querySelector('a[href]');
                    const match = link?.pathname?.match(/^\/post-(\d+)-\d+\/?$/);
                    if (!match || link.origin !== location.origin) return;
                    const id = match[1], first = `/post-${id}-1`;
                    const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'nsx-preview-toggle'; toggle.textContent = '打开预览'; toggle.setAttribute('aria-expanded','false');
                    const panel = document.createElement('section'); panel.className = 'nsx-preview-panel'; panel.id = `nsx-preview-${++nextId}`; panel.hidden = true; panel.setAttribute('aria-label','帖子正文与评论预览'); toggle.setAttribute('aria-controls',panel.id);
                    const status = document.createElement('div'); status.className = 'nsx-preview-status'; status.setAttribute('role','status');
                    const body = document.createElement('div'); body.className = 'nsx-preview-body'; body.tabIndex = 0;
                    const nav = document.createElement('div'); nav.className = 'nsx-preview-nav'; panel.append(status,body,nav);
                    row.classList.add('nsx-preview-row');
                    const contentColumn = row.querySelector('.post-list-content') || heading.parentElement;
                    if (contentColumn !== row) contentColumn.classList.add('nsx-preview-content');
                    heading.classList.add('nsx-preview-heading'); row.append(toggle); heading.after(panel);
                    // Use native chaining on touch, and forward excess wheel movement immediately.
                    body.addEventListener('wheel', event => {
                        if(event.ctrlKey || event.defaultPrevented || Math.abs(event.deltaX)>Math.abs(event.deltaY))return;
                        const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?body.clientHeight:1);
                        const max=Math.max(0,body.scrollHeight-body.clientHeight);
                        const next=Math.max(0,Math.min(max,body.scrollTop+delta));
                        const remainder=delta-(next-body.scrollTop);
                        if(Math.abs(remainder)>.5 && event.cancelable){
                            event.preventDefault();body.scrollTop=next;
                            window.scrollBy({top:remainder,left:0,behavior:'instant'});
                        }
                    },{passive:false});
                    const state = { controller: null, generation: 0, loaded: false, url: first }; states.set(row,state);
                    const load = async destination => {
                        const url = samePost(destination,id); if (!url) return;
                        state.controller?.abort(); const controller = new AbortController(); state.controller = controller;
                        const generation = ++state.generation; const timer = setTimeout(()=>controller.abort(),15000);
                        status.textContent = '正在加载正文和评论…'; panel.setAttribute('aria-busy','true');
                        const blockReady = loadPreviewBlock();
                        try {
                            const response = await fetch(url.href,{credentials:'same-origin',signal:controller.signal});
                            if (!response.ok || !samePost(response.url,id)) throw Error('无法读取帖子，请打开原帖检查登录或访问权限');
                            const doc = new DOMParser().parseFromString(await response.text(),'text/html');
                            let bootstrap = {};
                            try {
                                const encoded = doc.querySelector('#temp-script')?.textContent.trim();
                                if (encoded) bootstrap = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded), char => char.charCodeAt(0))));
                            } catch {}
                            const postData = bootstrap.postData || {};
                            const commentData = Array.isArray(postData.comments) ? postData.comments : [];
                            const main = doc.querySelector('.nsk-post .post-content, .post-detail-content, .post-content');
                            const comments = [...doc.querySelectorAll('ul.comments > li, .comments > .content-item')];
                            if (!main && !comments.length) throw Error('未找到正文或评论，请打开原帖查看');
                            if (generation !== state.generation || panel.hidden || !row.isConnected) return;
                            const fragment = document.createDocumentFragment();
                            const appendEntry = (node,label,userId) => {
                                const entry=document.createElement('article');entry.className='nsx-preview-entry';
                                const title=document.createElement('div');title.className='nsx-preview-author';
                                if (/^\d+$/.test(String(userId||''))) {
                                    const avatar=document.createElement('img');avatar.src=`/avatar/${userId}.png`;avatar.alt='';avatar.style.cssText='width:24px;height:24px;border-radius:6px;object-fit:cover';
                                    const authorLink=document.createElement('a');authorLink.href=`/space/${userId}`;authorLink.target='_blank';authorLink.rel='noopener noreferrer';authorLink.textContent=label;
                                    title.append(avatar,authorLink);
                                } else title.textContent=label;
                                entry.append(title,safeContent(node,url.href));fragment.append(entry);
                            };
                            if (main && !main.closest('.comments')) appendEntry(main,'帖子正文',null);
                            await blockReady;
                            if (generation !== state.generation || panel.hidden || !row.isConnected) return;
                            const localBlacklist = previewLocalBlacklist();
                            let blockedCount = 0;
                            for (const [index,comment] of comments.entries()) {
                                const floorKey = /^\d+$/.test(comment.id || '') ? comment.id : comment.querySelector('.floor-link')?.textContent.trim().replace(/^#/, '');
                                const blockRecord = commentData.find(c => floorKey && String(c?.floorIndex) === floorKey) || null;
                                const blockUid = comment.querySelector('a[href*="/space/"]')?.getAttribute('href')?.match(/\/space\/(\d+)/)?.[1] || blockRecord?.poster?.uid;
                                const blockName = comment.querySelector('.author-name')?.textContent || [...comment.querySelectorAll('a[href*="/space/"]')].find(a=>a.textContent.trim())?.textContent || blockRecord?.poster?.name;
                                if (isPreviewBlocked(blockUid, blockName, blockRecord, localBlacklist)) { blockedCount++; continue; }
                                const content = comment.querySelector('.post-content, .comment-content, .content') || comment;
                                const authorLink = [...comment.querySelectorAll('a[href*="/space/"]')].find(a=>a.textContent.trim());
                                const record=commentData[index] || {};
                                const person=record.author || record.user || record.member || record.op || {};
                                const idFromDOM=comment.querySelector('a[href*="/space/"]')?.getAttribute('href')?.match(/\/space\/(\d+)/)?.[1];
                                const uid=idFromDOM || person.uid || person.member_id || person.id || record.member_id || record.uid;
                                const named=[authorLink?.textContent,comment.querySelector('.author-name, .username, .user-name')?.textContent,typeof person==='string'?person:null,person.name,person.username,person.member_name,record.username,record.member_name].find(v=>typeof v==='string'&&v.trim());
                                const floor=comment.querySelector('.floor-link')?.textContent.trim();
                                const label=(named?.trim() || (/^\d+$/.test(String(uid||''))?`用户 ${uid}`:'评论者信息未提供'))+(floor?' · '+floor:'');
                                appendEntry(content,label,uid);
                            }
                            body.replaceChildren(fragment);body.scrollTop=0;nav.replaceChildren();
                            const currentPage = Number(url.pathname.match(/-(\d+)\/?$/)[1]);
                            const pages = new Map([[1,'1'],[currentPage,String(currentPage)]]);
                            const addPage = value => {const n=Number(value);if(Number.isSafeInteger(n)&&n>0&&n<=100000)pages.set(n,String(n));};
                            for (const anchor of doc.querySelectorAll('a[href]')) {
                                const target=samePost(anchor.getAttribute('href'),id);
                                if(target)addPage(target.pathname.match(/-(\d+)\/?$/)[1]);
                            }
                            for(const pager of doc.querySelectorAll('.nsk-pager,.pagination,.pager')) {
                                for(const control of pager.querySelectorAll('a,button,[data-page]')) {
                                    if(control.matches('.disabled,[disabled],[aria-disabled="true"]'))continue;
                                    const number=control.getAttribute('data-page') || control.textContent.trim();
                                    if(/^\d+$/.test(number))addPage(number);
                                    else if(control.matches('.pager-next,[rel="next"]'))addPage(currentPage+1);
                                    else if(control.matches('.pager-prev,[rel="prev"]')&&currentPage>1)addPage(currentPage-1);
                                }
                            }
                            // Use explicit page totals only; a displayed "1" never implies a second page.
                            const pagination=postData.pagination || bootstrap.pagination || {};
                            const totalPages=Number(pagination.totalPages ?? pagination.pageCount ?? postData.pageCount ?? bootstrap.pageCount);
                            if(Number.isSafeInteger(totalPages)&&totalPages>0&&totalPages<=100000){
                                addPage(totalPages);
                                for(let n=Math.max(1,currentPage-2);n<=Math.min(totalPages,currentPage+2);n++)addPage(n);
                            }
                            const knownPages=[...pages.keys()].sort((a,b)=>a-b);
                            const pageButton = (page,label) => {const button=document.createElement('button');button.type='button';button.textContent=label;button.disabled=page===currentPage;if(button.disabled)button.setAttribute('aria-current','page');button.onclick=e=>{e.preventDefault();e.stopPropagation();load(`/post-${id}-${page}`);};nav.append(button);};
                            if(currentPage>1)pageButton(currentPage-1,'上一页');
                            for(const page of knownPages)pageButton(page,String(page));
                            if(knownPages.some(page=>page>currentPage))pageButton(currentPage+1,'下一页');
                            const original=document.createElement('a');original.href=url.href;original.target='_blank';original.rel='noopener noreferrer';original.textContent='打开原帖 ↗';nav.append(original);
                            state.url=url.href;state.loaded=true;status.textContent=`第 ${currentPage} 页 · 本页 ${comments.length} 条评论`+(blockedCount?`（已隐藏黑名单 ${blockedCount} 条）`:'');
                        } catch(error) {
                            if(generation!==state.generation||panel.hidden)return;
                            status.textContent=controller.signal.aborted?'加载超时，请重试':error.message;
                            nav.replaceChildren();const retry=document.createElement('button');retry.type='button';retry.textContent='重试';retry.onclick=()=>load(url.href);const original=document.createElement('a');original.href=url.href;original.target='_blank';original.rel='noopener noreferrer';original.textContent='打开原帖 ↗';nav.append(retry,original);
                        } finally { clearTimeout(timer);if(generation===state.generation)panel.removeAttribute('aria-busy'); }
                    };
                    toggle.onclick=e=>{e.preventDefault();e.stopPropagation();panel.hidden=!panel.hidden;toggle.textContent=panel.hidden?'打开预览':'关闭预览';toggle.setAttribute('aria-expanded',String(!panel.hidden));if(panel.hidden){state.generation++;state.controller?.abort();panel.removeAttribute('aria-busy');}else if(!state.loaded)load(state.url);};
                };
                const scan = root => { if(root.matches?.(rows))setup(root);root.querySelectorAll?.(rows).forEach(setup); };
                scan(document);
                const observer=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1&&!node.closest('.nsx-preview-panel'))scan(node);for(const [row,state]of states)if(!row.isConnected){state.controller?.abort();states.delete(row);}});
                observer.observe(document.body,{childList:true,subtree:true});
                window.addEventListener('pagehide',()=>{for(const state of states.values())state.controller?.abort();});
            }
        };
        define(postPreview);



        /* ==========================================================================
           [ 🎨 视觉美化 ] - 社区成就分 (Reputation System)
           ========================================================================== */
        const inlineUserInfo = {
            id: "inlineUserInfo",
            deps: ["ui"],
            order: 390,
            cfg: { card_appearance: { frost: 30 }, badge_appearance: { list_style: "liquid", post_style: "liquid", show_list: true, show_post: true }, inline_user_info: { enabled: true, show_op: true, show_cmt: true, show_list: true, simple_lv_style: false, simple_lv_color: "rgba(0, 206, 209, 1)" } },
            meta: {
                card_appearance: {
                    label: "名片卡外观", group: "🎨 视觉美化",
                    fields: { frost: { type: "RANGE", label: "磨砂强度", valueType: "number" } }
                },
                badge_appearance: {
                    label: "名片风格", group: "🎨 视觉美化",
                    fields: {
                        list_style: { type: "SELECT", label: "列表页名片风格", options: { text: "纯文本", ios: "ios风格", liquid: "ios27液态玻璃风格", tech: "科技风格" } },
                        post_style: { type: "SELECT", label: "帖子页名片风格", options: { text: "纯文本", ios: "ios风格", liquid: "ios27液态玻璃风格", tech: "科技风格" } },
                        show_list: { type: "SWITCH", label: "列表页显示名片" },
                        show_post: { type: "SWITCH", label: "帖子内容页显示名片" }
                    }
                },
                inline_user_info: {
                    label: "用户资料与账号参考分",
                    group: "🧭 辅助工具",
                    fields: {
                        show_op: { type: "SWITCH", label: "作用于楼主" },
                        show_cmt: { type: "SWITCH", label: "作用于评论" },
                        show_list: { type: "SWITCH", label: "作用于帖子列表作者" }
                    }
                }
            },
            match: ctx => ctx.loggedIn && (
                (ctx.isPost && (ctx.store.get("inline_user_info.enabled", true) || ctx.store.get("relation.show_friend_btn", true) || ctx.store.get("relation.show_block_btn", true))) ||
                (ctx.store.get("inline_user_info.enabled", true) && ctx.store.get("inline_user_info.show_list", true) &&
                    (ctx.isList || !!document.querySelector('.post-list-item, .post-list .list-item')))
            ),
            init(ctx) {
                const showOp = ctx.store.get("inline_user_info.show_op", true);
                const showCmt = ctx.store.get("inline_user_info.show_cmt", true);
                const showList = ctx.store.get("inline_user_info.show_list", true) && ctx.store.get("badge_appearance.show_list", true);
                const escapeInfo = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
                // BEGIN ACHIEVEMENT MODEL
                // Achievement score v4 draft. Official level replaces the withdrawn extra-coin estimate.
                const RULES = Object.freeze({
                  version:'achievement-v4.1-draft',
                  weights:{main:70,breadth:20,fans:5,level:5},
                  initialCoin:90,forumUTCOffsetHours:8,
                  levelThresholds:[0,100,400,900,1600,2500,3600],
                  post:[[0,0],[5,.10],[20,.25],[50,.45],[100,.65],[300,.85],[1000,1]],
                  comment:[[0,0],[20,.10],[100,.25],[300,.45],[1000,.65],[3000,.85],[10000,1]],
                  maturity:[[0,.30],[7,.40],[30,.60],[90,.80],[180,.90],[365,1]],
                  fans:[[0,0],[5,.5],[20,1.5],[50,2.5],[100,3.5],[300,5]],
                  tiers:[[0,'深度隐匿'],[20,'籍籍无名'],[40,'初露锋芒'],[60,'活跃精英'],[75,'声名大噪'],[90,'名震天下']]
                });
                function interpolate(value,nodes){
                  if(value<=nodes[0][0])return nodes[0][1];
                  for(let i=1;i<nodes.length;i++){
                    const [x1,y1]=nodes[i], [x0,y0]=nodes[i-1];
                    if(value<=x1)return y0+(y1-y0)*(value-x0)/(x1-x0);
                  }
                  return nodes[nodes.length-1][1];
                }
                function forumRegistrationDays(createdAt,now=Date.now()){
                  let timestamp;
                  if(typeof createdAt==='number'&&Number.isFinite(createdAt))timestamp=Math.abs(createdAt)<1e11?createdAt*1000:createdAt;
                  else if(typeof createdAt==='string'&&createdAt.trim())timestamp=Date.parse(createdAt);
                  else return null;
                  if(!Number.isFinite(timestamp)||!Number.isFinite(now)||timestamp>now)return null;
                  const shift=RULES.forumUTCOffsetHours*3600000,day=86400000;
                  return Math.floor((now+shift)/day)-Math.floor((timestamp+shift)/day);
                }
                function officialLevelFromBalance(coin){
                  if(!Number.isSafeInteger(coin))return null;
                  for(let level=6;level>0;level--)if(coin>=RULES.levelThresholds[level])return level;
                  return 0;
                }
                function achievementTitle(value){
                  if(!Number.isFinite(value)||value<0||value>100)return null;
                  let title=null;for(const [floor,label]of RULES.tiers)if(value>=floor)title=label;
                  return title;
                }
                function achievementScore(profile){
                  const missing=[],invalid=[];
                  const valid=(key,negative=false)=>{
                    const value=profile[key];
                    if(value===null||value===undefined||value===''){missing.push(key);return false}
                    if(typeof value!=='number'||!Number.isSafeInteger(value)||(!negative&&value<0)){invalid.push(key);return false}
                    return true;
                  };
                  const dOK=valid('days'),pOK=valid('nPost'),rOK=valid('nComment'),fOK=valid('fans');
                  const supplied=value=>value!==undefined&&value!==null&&value!=='';
                  let level=null,levelSource=null;
                  if(supplied(profile.rank)){
                    if(Number.isSafeInteger(profile.rank)&&profile.rank>=0&&profile.rank<=6){level=profile.rank;levelSource='official'}
                    else invalid.push('rank');
                  }else if(supplied(profile.coin)){
                    if(Number.isSafeInteger(profile.coin)){level=officialLevelFromBalance(profile.coin);levelSource='balance'}
                    else invalid.push('coin');
                  }else missing.push('rank');
                  const levelOK=level!==null;
                  const coreComplete=dOK&&pOK&&rOK;
                  const p=pOK?interpolate(profile.nPost,RULES.post):null;
                  const r=rOK?interpolate(profile.nComment,RULES.comment):null;
                  const factor=dOK?interpolate(profile.days,RULES.maturity):null;
                  const tenths=value=>Math.floor(Math.max(0,value)*10+1e-9);
                  const pair=pOK&&rOK;
                  const rawMain=pair?RULES.weights.main*Math.max(p,r):null;
                  const rawBreadth=pair?RULES.weights.breadth*Math.min(p,r):null;
                  const components=[
                    {key:'main',label:'发帖/评论积累',max:70,raw:rawMain,tenths:coreComplete?tenths(rawMain*factor):null},
                    {key:'breadth',label:'参与广度',max:20,raw:rawBreadth,tenths:coreComplete?tenths(rawBreadth*factor):null},
                    {key:'fans',label:'社区关注',max:5,raw:fOK?interpolate(profile.fans,RULES.fans):null,tenths:fOK?tenths(interpolate(profile.fans,RULES.fans)):null},
                    {key:'level',label:'当前等级',max:5,raw:levelOK?5*level/6:null,tenths:levelOK?Math.floor(50*level/6):null}
                  ].map(part=>({...part,score:part.tenths===null?null:part.tenths/10}));
                  const complete=missing.length===0&&invalid.length===0;
                  const knownTenths=components.reduce((sum,part)=>sum+(part.tenths??0),0);
                  // Missing auxiliary fields yield a bounded interval, never a rescaled score.
                  const optionalUnknown=(!fOK?RULES.weights.fans:0)+(!levelOK?RULES.weights.level:0);
                  const rangeValid=coreComplete&&invalid.length===0;
                  const minimum=rangeValid?knownTenths/10:null;
                  const maximum=rangeValid?Math.min(100,minimum+optionalUnknown):null;
                  const score=complete?knownTenths/10:null;
                  return {version:RULES.version,complete,coreComplete,score,range:rangeValid?[minimum,maximum]:null,
                    tier:complete?achievementTitle(score):null,components,missing,invalid,knownScore:knownTenths/10,
                    postProgress:p,commentProgress:r,maturity:factor,level,levelSource,
                    mainDirection:pair?(p===r?'均衡参与':p>r?'主题':'评论'):null};
                }
                // Account-reference v1: stage rules; independent of the achievement score above.
                function accountReferenceScore(profile) {
                    const { days:d, nPost:p, nComment:c, coin:b, stardust:s, rank:l } = profile;
                    if (![d,p,c,b,s,l].every(Number.isSafeInteger) || d <= 0 || p < 0 || c < 0 || s < 0 || l < 0 || l > 6) return null;
                    const postRate = p/d, commentRate = c/d, coinRate = b/d;
                    // Integer comparisons keep exact rate boundaries stable (e.g. 0.33 and 3).
                    const post = p===0 ? 0 : p*100<11*d ? .5 : p*100<22*d ? .7 : p*100<33*d ? .9 : p*100<67*d ? 1 : p<2*d ? .9 : p<3*d ? .7 : p===3*d ? .5 : p<=4*d ? .2 : 0;
                    const comment = c<d ? 0 : c<5*d ? .25 : c<11*d ? .5 : c<15*d ? .75 : 1;
                    const star = l===0 ? 0 : Math.min(5,Math.floor(s/l))/5;
                    const coin = (5-Math.min(5,Math.ceil(Math.abs(b-20*d)/(4*d))))/5;
                    const age = Math.floor(100*Math.min(d,365)/365)/100;
                    const parts = { days:2.5*(post+comment+star+coin)+10*age, post:20*post, comment:15*comment, coin:25*coin, star:20*star };
                    return { total:Math.round(Object.values(parts).reduce((a,b)=>a+b,0)*10)/10, parts, postRate, commentRate, coinRate };
                }
                // END ACHIEVEMENT MODEL
                // Public profile cache: isolated by site/account, bounded, and valid for 12 hours.
                const PROFILE_TTL = 12 * 60 * 60 * 1000;
                const PROFILE_LIMIT = 500;
                const REQUEST_TIMEOUT = 10000;
                const REQUEST_GAP = 300;
                const MAX_ATTEMPTS = 3;
                const profileKey = `nsx:profile-cache:v4:${location.host}:${ctx.uid || ctx.user?.member_id || 'user'}`;
                const recordPrefix = `${profileKey}:user:`;
                const cooldownKey = `nsx:profile-cache:v2:${location.host}:${ctx.uid || ctx.user?.member_id || 'user'}:cooldown`; // Share rate limits with older tabs.
                const trackedAuthors = new Map();
                const retryControls = new WeakMap();
                const renderedInfo = new WeakMap();
                const displayedAt = new WeakMap();
                const refreshJobs = new Map();
                let activeProfileTip = null, profileCloseTimer = null, profileTouchUntil = 0;
                let profileOpenTimer = null, pendingProfileAnchor = null;
                const hoveredProfileAnchors = new WeakSet();
                const cancelProfileTipOpen = () => {
                    clearTimeout(profileOpenTimer); profileOpenTimer = null; pendingProfileAnchor = null;
                };
                const touchProfileTips = () => document.documentElement.classList.contains('nsx-mobile') ||
                    window.matchMedia?.('(hover: none) and (pointer: coarse)')?.matches || Date.now() < profileTouchUntil;
                const cancelProfileTipClose = () => { clearTimeout(profileCloseTimer); profileCloseTimer = null; };
                const closeProfileTip = (tip = activeProfileTip, cancelOpen = true) => {
                    if (tip && activeProfileTip !== tip) return;
                    if (cancelOpen) cancelProfileTipOpen();
                    cancelProfileTipClose();
                    if (!tip) return;
                    activeProfileTip = null;
                    if (tip.index != null) tip.layer?.close?.(tip.index);
                };
                const delayProfileTipClose = (tip, delay) => {
                    if (!tip || activeProfileTip !== tip) return;
                    cancelProfileTipClose();
                    profileCloseTimer = setTimeout(() => {
                        if (activeProfileTip !== tip || hoveredProfileAnchors.has(tip.anchor) || tip.popupHovered) return;
                        closeProfileTip(tip, false);
                    }, delay);
                };
                // Own viewport positioning: Layer's automatic flip can place tall tips above the viewport.
                function profileTipPosition(anchor, width, height, bounds) {
                    const gap = 8;
                    const below = bounds.bottom - anchor.bottom - gap;
                    const above = anchor.top - bounds.top - gap;
                    const desiredTop = height <= below || below >= above
                        ? anchor.bottom + gap : anchor.top - height - gap;
                    return {
                        left: Math.max(bounds.left, Math.min(anchor.left, bounds.right - width)),
                        top: Math.max(bounds.top, Math.min(desiredTop, bounds.bottom - height))
                    };
                }
                const positionProfileTip = () => {
                    const tip = activeProfileTip;
                    const popup = tip?.popup;
                    const card = popup?.querySelector('.nsx-profile-card');
                    if (!popup || !card || !tip.anchor.isConnected) return;
                    const viewport = window.visualViewport;
                    const left = (viewport?.offsetLeft || 0) + 8;
                    let top = (viewport?.offsetTop || 0) + 8;
                    const right = left + (viewport?.width || document.documentElement.clientWidth) - 16;
                    const bottom = top + (viewport?.height || window.innerHeight) - 16;
                    const header = document.querySelector('#nsk-head');
                    if (header) {
                        const rect = header.getBoundingClientRect();
                        const pos = getComputedStyle(header).position;
                        if ((pos === 'fixed' || pos === 'sticky') && rect.top <= top && rect.bottom > top && rect.bottom < bottom - 80) top = rect.bottom + 8;
                    }
                    card.style.maxWidth = `${Math.max(1, right - left)}px`;
                    card.style.maxHeight = `${Math.max(1, bottom - top)}px`;
                    popup.style.setProperty('position', 'fixed', 'important');
                    popup.style.setProperty('width', 'max-content', 'important');
                    popup.style.setProperty('max-width', `${Math.max(1, right - left)}px`, 'important');
                    popup.style.setProperty('margin', '0', 'important');
                    const rect = popup.getBoundingClientRect();
                    const point = profileTipPosition(tip.anchor.getBoundingClientRect(), rect.width, rect.height, {left, top, right, bottom});
                    popup.style.setProperty('left', `${point.left}px`, 'important');
                    popup.style.setProperty('top', `${point.top}px`, 'important');
                };
                window.addEventListener('resize', positionProfileTip);
                window.addEventListener('scroll', event => {
                    if (event.target?.nodeType && activeProfileTip?.popup?.contains(event.target)) return;
                    positionProfileTip();
                }, { capture: true, passive: true });
                window.visualViewport?.addEventListener('resize', positionProfileTip);
                window.visualViewport?.addEventListener('scroll', positionProfileTip);
                const outsideProfileTip = target => activeProfileTip &&
                    !activeProfileTip.anchor.contains(target) && !activeProfileTip.popup?.contains(target);
                document.addEventListener('click', event => {
                    if (pendingProfileAnchor && !pendingProfileAnchor.contains(event.target)) cancelProfileTipOpen();
                    if (outsideProfileTip(event.target)) closeProfileTip();
                }, true);
                const dismissTouchProfileTip = event => {
                    cancelProfileTipOpen();
                    if (touchProfileTips() && activeProfileTip && !(event.target?.nodeType && activeProfileTip.popup?.contains(event.target))) closeProfileTip();
                };
                window.addEventListener('scroll', dismissTouchProfileTip, { capture: true, passive: true });
                document.addEventListener('touchmove', dismissTouchProfileTip, { passive: true });
                window.addEventListener('pagehide', () => closeProfileTip());
                document.addEventListener('visibilitychange', () => { if (document.hidden) closeProfileTip(); });
                const categoryAnchors = new Map();
                const updateCarouselHeight = row => {
                    const panel = row.closest('.topic-carousel-panel');
                    if (!panel) return;
                    if (!document.documentElement.classList.contains('nsx-mobile')) {
                        panel.classList.remove('nsx-assessment-carousel');
                        panel.style.removeProperty('--nsx-assessment-carousel-height');
                        return;
                    }
                    // Slides are absolute: height:auto would collapse the viewport. Measure
                    // their actual border boxes and keep overflow:hidden for horizontal sliding.
                    const height = Math.ceil(Math.max(0, ...Array.from(panel.querySelectorAll('.topic-carousel-item'), item => item.offsetTop + item.offsetHeight)));
                    if (height > 0) {
                        panel.classList.add('nsx-assessment-carousel');
                        const value = `${height}px`;
                        if (panel.style.getPropertyValue('--nsx-assessment-carousel-height') !== value) panel.style.setProperty('--nsx-assessment-carousel-height', value);
                    }
                };
                const positionCategoryAssessment = row => {
                    const anchor = categoryAnchors.get(row);
                    if (!anchor || !row.isConnected) return;
                    const { category, badge } = anchor;
                    if (!category.isConnected || !badge.isConnected) return;
                    const floatingCategory = ['absolute', 'fixed'].includes(getComputedStyle(category).position);
                    badge.classList.toggle('nsx-category-assessment-inline', !floatingCategory);
                    if (!floatingCategory) {
                        // On mobile the native category stays in normal text flow. Put the
                        // assessment after it, so earlier metadata and the category are not covered.
                        badge.style.removeProperty('right');
                        badge.style.removeProperty('bottom');
                        badge.style.removeProperty('max-width');
                        if (category.nextElementSibling !== badge) category.after(badge);
                        updateCarouselHeight(row);
                        return;
                    }
                    // Re-enter desktop placement after a responsive layout change.
                    if (badge.parentElement !== row) row.appendChild(badge);
                    const rowRect = row.getBoundingClientRect();
                    const categoryRect = category.getBoundingClientRect();
                    const rowStyle = getComputedStyle(row);
                    const borderRight = parseFloat(rowStyle.borderRightWidth) || 0;
                    const borderBottom = parseFloat(rowStyle.borderBottomWidth) || 0;
                    // Anchor only the new badge. Leave the category's DOM, margins,
                    // absolute positioning and the original row layout untouched.
                    badge.style.right = `${rowRect.right - categoryRect.left - borderRight + 4}px`;
                    badge.style.bottom = `${rowRect.bottom - categoryRect.bottom - borderBottom}px`;
                    badge.style.maxWidth = `${Math.max(0, categoryRect.left - rowRect.left - 12)}px`;
                    updateCarouselHeight(row);
                };
                const categoryResizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(entries => {
                    const rows = new Set(entries.map(entry => entry.target.closest('.post-list-item')).filter(Boolean));
                    rows.forEach(positionCategoryAssessment);
                }) : null;
                window.addEventListener('resize', () => categoryAnchors.forEach((_, row) => positionCategoryAssessment(row)));

                const autoRefreshAt = new Map();
                let refreshUserProfile = () => Promise.resolve();
                let refreshFailedAuthors = () => {};
                const cache = new Map();
                const fetching = new Map();
                const queue = [];
                let running = false, queueTimer, saveTimer, lastStarted = 0;
                let cooldownUntil = 0;
                const normalizeProfile = value => {
                    if (!value || forumRegistrationDays(value.created_at) === null) return null;
                    const profile = { created_at: value.created_at, bio: typeof value.bio === "string" ? value.bio : null };
                    for (const key of ['coin', 'nPost', 'nComment', 'stardust', 'fans', 'rank']) {
                        const raw = value[key];
                        if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) { profile[key] = null; continue; }
                        if (typeof raw !== 'number' && typeof raw !== 'string') return null;
                        const n = Number(raw);
                        if (!Number.isSafeInteger(n) || (key !== 'coin' && n < 0) || (key === 'rank' && n > 6)) return null;
                        profile[key] = n;
                    }
                    return profile;
                };
                const validEntry = entry => {
                    const data = normalizeProfile(entry?.data);
                    return data && Number.isFinite(entry?.at) && Date.now() >= entry.at && Date.now() - entry.at < PROFILE_TTL ? { at: entry.at, data } : null;
                };
                const readCooldown = () => {
                    try {
                        const shared = GM_getValue(cooldownKey, 0);
                        if (Number.isFinite(shared)) cooldownUntil = Math.max(cooldownUntil, shared);
                    } catch { }
                    return cooldownUntil;
                };
                const saveProfiles = () => {
                    clearTimeout(saveTimer);
                    // Every user has an independent key: a stale tab cannot overwrite other users.
                    try {
                        const entries = [];
                        const keys = typeof GM_listValues === 'function' ? GM_listValues() : [];
                        for (const key of keys) {
                            if (!key.startsWith(recordPrefix) || !/^\d+$/.test(key.slice(recordPrefix.length))) continue;
                            const entry = validEntry(GM_getValue(key, null));
                            if (entry) entries.push({ key, at: entry.at });
                            else GM_deleteValue(key);
                        }
                        entries.sort((a, b) => b.at - a.at);
                        for (const item of entries.slice(PROFILE_LIMIT)) {
                            // Do not remove a record that another tab just refreshed.
                            const current = GM_getValue(item.key, null);
                            if (current?.at === item.at) GM_deleteValue(item.key);
                        }
                    } catch { }
                    for (const [id, entry] of cache) if (!validEntry(entry)) cache.delete(id);
                    while (cache.size > PROFILE_LIMIT) cache.delete(cache.keys().next().value);
                };
                window.addEventListener('pagehide', saveProfiles);
                const cachedProfile = id => {
                    let entry = validEntry(cache.get(id));
                    try {
                        const shared = validEntry(GM_getValue(`${recordPrefix}${id}`, null));
                        if (shared && (!entry || shared.at > entry.at)) entry = shared;
                    } catch { }
                    if (!entry) { cache.delete(id); return null; }
                    cache.set(id, entry);
                    while (cache.size > PROFILE_LIMIT) cache.delete(cache.keys().next().value);
                    return entry.data;
                };
                readCooldown();
                saveTimer = setTimeout(saveProfiles, 1000);
                const nearViewport = el => {
                    if (!el.isConnected) return false;
                    const rect = el.getBoundingClientRect();
                    return rect.bottom >= -400 && rect.top <= window.innerHeight + 400;
                };
                const retryDelay = response => {
                    const value = response.headers.get('Retry-After');
                    if (!value) return 60000;
                    const seconds = Number(value);
                    const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now();
                    return Number.isFinite(delay) ? Math.max(1000, delay) : 60000;
                };
                const fetchProfile = async id => {
                    const controller = new AbortController();
                    let timeout;
                    const work = (async () => {
                        const response = await fetch(`/api/account/getInfo/${id}`, { credentials: 'same-origin', signal: controller.signal });
                        if ([403, 429, 503].includes(response.status)) {
                            cooldownUntil = Math.max(readCooldown(), Date.now() + retryDelay(response));
                            try { GM_setValue(cooldownKey, cooldownUntil); } catch { }
                        }
                        if (!response.ok) throw new Error(`HTTP ${response.status}`);
                        const result = await response.json();
                        const data = result?.success ? normalizeProfile(result.detail) : null;
                        if (!data) throw new Error('用户资料不可用');
                        return data;
                    })();
                    try {
                        return await Promise.race([work, new Promise((_, reject) => {
                            timeout = setTimeout(() => { controller.abort(); reject(new Error('用户资料请求超时')); }, REQUEST_TIMEOUT);
                        })]);
                    } finally { clearTimeout(timeout); }
                };
                const finishProfile = (task, data) => {
                    fetching.delete(task.id);
                    task.resolve(data);
                    if (data) refreshFailedAuthors(task.id);
                };
                const drainProfiles = () => {
                    clearTimeout(queueTimer);
                    if (running || !queue.length) return;
                    // A removed list row must not keep an unnecessary request alive in the queue.
                    for (let i = queue.length - 1; i >= 0; i--) {
                        if (![...queue[i].targets].some(el => el.isConnected)) finishProfile(queue.splice(i, 1)[0], null);
                    }
                    if (!queue.length) return;
                    const now = Date.now();
                    // Re-read before every queued request, including in already-open tabs.
                    const readyAt = Math.max(readCooldown(), lastStarted + REQUEST_GAP, Math.min(...queue.map(task => task.readyAt)));
                    if (readyAt > now) { queueTimer = setTimeout(drainProfiles, Math.min(readyAt - now, 2147483647)); return; }
                    const available = queue.filter(task => task.readyAt <= now);
                    const task = available.find(task => [...task.targets].some(nearViewport)) || available[0];
                    queue.splice(queue.indexOf(task), 1);
                    running = true;
                    lastStarted = Date.now();
                    task.attempts++;
                    fetchProfile(task.id).then(data => {
                        cache.delete(task.id);
                        const entry = { at: Date.now(), data };
                        cache.set(task.id, entry);
                        try { GM_setValue(`${recordPrefix}${task.id}`, entry); } catch { }
                        while (cache.size > PROFILE_LIMIT) cache.delete(cache.keys().next().value);
                        clearTimeout(saveTimer);
                        saveTimer = setTimeout(saveProfiles, 1000);
                        finishProfile(task, data);
                    }).catch(() => {
                        if (task.attempts < MAX_ATTEMPTS) {
                            task.readyAt = Date.now() + 2000 * (2 ** (task.attempts - 1));
                            queue.push(task);
                        } else finishProfile(task, null);
                    }).finally(() => { running = false; drainProfiles(); });
                };
                const loadProfile = (id, el) => {
                    const data = cachedProfile(id);
                    if (data) return Promise.resolve(data);
                    let task = fetching.get(id);
                    if (!task) {
                        task = { id, targets: new Set(), attempts: 0, readyAt: 0 };
                        task.promise = new Promise(resolve => { task.resolve = resolve; });
                        fetching.set(id, task);
                        queue.push(task);
                    }
                    task.targets.add(el);
                    drainProfiles();
                    return task.promise;
                };
                addStyle("nsx-lv-colors", `.role-tag.user-level{color:#fafafa;font-weight:bold;}.user-lv0{background:#b71c1c;border-color:#b71c1c}.user-lv1{background:#e53935;border-color:#e53935}.user-lv2{background:#f57c00;border-color:#f57c00}.user-lv3{background:#ffca28;border-color:#ffca28;color:#333}.user-lv4{background:#cddc39;border-color:#cddc39;color:#333}.user-lv5{background:#7cb342;border-color:#7cb342}.user-lv6{background:#43a047;border-color:#43a047}.user-lv7{background:#00897b;border-color:#00897b}.user-lv8{background:#039be5;border-color:#039be5}.user-lv9{background:#1e88e5;border-color:#1e88e5}.user-lv10{background:#3949ab;border-color:#3949ab}.user-lv11{background:#5e35b1;border-color:#5e35b1}.user-lv12{background:#8e24aa;border-color:#8e24aa}.user-lv13{background:#d81b60;border-color:#d81b60}.user-lv14{background:#546e7a;border-color:#546e7a}.user-lv15{background:#212121;border-color:#212121;color:#ffca28}`);

                const display = async (el) => {
                    const listItem = el.closest('.post-list-item, .post-list .list-item');
                    const isListAuthor = !!listItem;
                    const isCmt = !isListAuthor && el.closest('.comment-item, .comments > li') !== null;
                    if (isListAuthor ? !showList : (isCmt ? !showCmt : !showOp)) return;
                    if (isListAuthor && !ctx.store.get("inline_user_info.enabled", true)) return;
                    if (el.dataset.nsxInfoLoaded) return;

                    const metaInfo = listItem || el.closest('.nsk-content-meta-info');
                    if (!metaInfo || !el.href) return;
                    el.dataset.nsxInfoLoaded = "1";

                    const match = el.href.match(/\/space\/(\d+)/);
                    const userId = match ? match[1] : null;
                    const username = el.textContent.trim();

                    // --- A. 帖内信息扩展逻辑 ---
                    const showInfo = ctx.store.get("inline_user_info.enabled", true) && ctx.store.get(isListAuthor ? "badge_appearance.show_list" : "badge_appearance.show_post", true);
                    if (showInfo && userId) {
                        const userData = await loadProfile(userId, el);
                        if (!el.isConnected || !metaInfo.contains(el)) return;
                        if (!userData) {
                            el.dataset.nsxProfileFailed = "1";
                            const retry = document.createElement('button');
                            retryControls.set(el, retry);
                            retry.type = 'button';
                            retry.className = 'nsx-profile-retry';
                            retry.textContent = '重试评估';
                            retry.title = '资料加载失败，已停止自动重试；点击重新尝试';
                            retry.style.cssText = 'font-size:10px;margin-left:4px;padding:0 4px;cursor:pointer;color:inherit;background:transparent;border:1px solid #8886;border-radius:3px';
                            retry.onclick = () => {
                                retry.remove();
                                retryControls.delete(el);
                                delete el.dataset.nsxInfoLoaded;
                                delete el.dataset.nsxProfileFailed;
                                display(el);
                            };
                            el.after(retry);
                        }

                        if (userData && (!metaInfo.querySelector('.nsx-user-info-display') || renderedInfo.has(el))) {
                            if (renderedInfo.get(el)?.contains(activeProfileTip?.anchor)) closeProfileTip();
                            renderedInfo.get(el)?.remove();
                            const achievement = achievementScore({
                                days: forumRegistrationDays(userData.created_at),
                                nPost: userData.nPost, nComment: userData.nComment,
                                fans: userData.fans, coin: userData.coin, rank: userData.rank
                            });
                            const joinDays = forumRegistrationDays(userData.created_at) ?? '未知';
                            const joinedTimestamp = typeof userData.created_at === 'number'
                                ? (Math.abs(userData.created_at) < 1e11 ? userData.created_at * 1000 : userData.created_at)
                                : Date.parse(userData.created_at);
                            const joinedISO = new Date(joinedTimestamp).toISOString();
                            const joinedTime = new Date(joinedTimestamp + 8 * 3600000).toISOString().slice(0, 10).replace(/-/g, '/');
                            const rank = achievement.level;
                            const rankText = rank ?? '未知';
                            const trustScore = achievement.complete ? achievement.score.toFixed(1) :
                                achievement.range ? achievement.range.map(value => value.toFixed(1)).join('–') : '—';
                            const trustLevel = achievement.tier || (achievement.range ? '待补全' : '资料不完整');
                            const scoreGradient = score => score >= 90 ? 'linear-gradient(135deg, #FFF5C3, #FFD700, #B8860B)' :
                                score >= 75 ? 'linear-gradient(135deg, #f093fb, #f5576c)' :
                                score >= 60 ? 'linear-gradient(135deg, #00D2FF, #3A7BD5)' :
                                score >= 40 ? 'linear-gradient(135deg, #96C93D, #00B09B)' : '#78909c';
                            const trustColor = scoreGradient(achievement.score);
                            const dayCount = forumRegistrationDays(userData.created_at);
                            const reference = accountReferenceScore({ days:dayCount, nPost:userData.nPost, nComment:userData.nComment, coin:userData.coin, stardust:userData.stardust, rank:userData.rank });
                            const referenceText = reference ? reference.total.toFixed(1) : '资料不足';
                            // Ten distinct reference-score bands; the old achievement palette stays separate.
                            const referenceGradient = score => {
                                if (!Number.isFinite(score)) return '#78909c';
                                const colors = [
                                    ['#64748b','#475569'], ['#a16207','#854d0e'],
                                    ['#c2410c','#9a3412'], ['#b91c1c','#991b1b'],
                                    ['#be185d','#9d174d'], ['#7e22ce','#6b21a8'],
                                    ['#4338ca','#3730a3'], ['#0369a1','#075985'],
                                    ['#0f766e','#115e59'], ['#15803d','#166534']
                                ];
                                const pair = colors[Math.min(9, Math.max(0, Math.floor(score / 10)))];
                                return `linear-gradient(135deg, ${pair[0]}, ${pair[1]})`;
                            };
                            const referenceColor = referenceGradient(reference?.total);
                            const selectedStyle = ctx.store.get(isListAuthor ? 'badge_appearance.list_style' : 'badge_appearance.post_style','liquid');
                            const badgeStyle = ['text','ios','liquid','tech'].includes(selectedStyle) ? selectedStyle : 'liquid';
                            const displayValue = value => escapeInfo(value ?? '未知');
                            const infoSpanDiv = document.createElement('span');
                            infoSpanDiv.className = 'nsx-user-info-display' + (isListAuthor ? ' nsx-list-user-info' : ' nsx-detail-user-info');
                            infoSpanDiv.style.cssText = `display:inline-flex;align-items:center;opacity:0.95;user-select:text;margin-left:4px;cursor:default;`;

                            let lvGradient = rank === null || rank === 0 ? "linear-gradient(135deg, #90a4ae, #607d8b)" : "linear-gradient(135deg, #e53935, #b71c1c)"; // Lv1: 红色 (用户要求)
                            let lvColor = rank === null || rank === 0 ? "#78909c" : "#e53935";
                            if (Number(rank) === 2) { lvGradient = "linear-gradient(135deg, #fd9346, #fd512c)"; lvColor = "#fd6f3a"; } // Lv2: 活力橙
                            else if (Number(rank) === 3) { lvGradient = "linear-gradient(135deg, #12eb92, #0ba360)"; lvColor = "#11c87d"; } // Lv3: 翡翠绿
                            else if (Number(rank) === 4) { lvGradient = "linear-gradient(135deg, #47abff, #1860ff)"; lvColor = "#2d86ff"; } // Lv4: 海洋蓝
                            else if (Number(rank) === 5) { lvGradient = "linear-gradient(135deg, #ffd700, #ff8c00)"; lvColor = "#ffb300"; } // Lv5: 暖金/黄金色
                            else if (Number(rank) >= 6) { lvGradient = "linear-gradient(135deg, #db24ff, #2524ff)"; lvColor = "#6f58ff"; } // Lv6: 赛博双拼


                            const lvSpan = document.createElement('span');
                            lvSpan.className = `nsk-badge role-tag nsx-lv-badge nsx-badge-${badgeStyle}`;
                            lvSpan.style.cssText = `font-size:11px;padding:2px 7px;border-radius:4px;border:0!important;outline:0!important;vertical-align:middle;--nsx-level-gradient:${lvGradient};`;
                            lvSpan.textContent = `Lv ${rankText} · ${joinDays}天 · 参考分 ${referenceText}${reference ? '分' : ''}`;
                            lvSpan.style.cursor = 'help';
                            lvSpan.setAttribute('aria-label', `${username}：账号参考分 ${referenceText}${reference ? '/100' : ''}。评分基于公开资料，不代表交易信用。`);
                            infoSpanDiv.appendChild(lvSpan);
                            renderedInfo.set(el, infoSpanDiv);
                            displayedAt.set(el, cache.get(userId)?.at ?? Date.now());

                            const showProfileTip = () => {
                                if (!ctx.store.get(isListAuthor ? 'badge_appearance.show_list' : 'badge_appearance.show_post', true)) return;
                                if (activeProfileTip?.anchor === lvSpan) { cancelProfileTipClose(); return; }
                                closeProfileTip();
                                const tip = { anchor: lvSpan, popup: null, index: null, layer: ctx.ui.layer };
                                activeProfileTip = tip;
                                // 动态适配主题色（每次悬浮时重新检测）
                                // 修正：NodeSeek 的深色模式类通常在 body 上
                                const currentIsDark = document.body.classList.contains('dark-layout') || document.documentElement.classList.contains('dark');
                                const tipBg = currentIsDark ? '#2a2a2a' : '#fff';
                                const tipColor = currentIsDark ? '#e0e0e0' : '#1f1f1f';
                                const tipBorder = currentIsDark ? '#444' : '#e4e4e4';
                                const tipDiv = currentIsDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';
                                const tipNoticeColor = currentIsDark ? '#aab4c3' : '#6e7887';
                                const savedFrost = Number(ctx.store.get('card_appearance.frost', 30));
                                const frostLevel = Number.isFinite(savedFrost) ? Math.max(0, Math.min(100, savedFrost)) : 30;
                                const frost = { blur: frostLevel * .4, light: .30 + frostLevel * .0048, dark: .30 + frostLevel * .0048 };
                                const glassSurface = currentIsDark ? `rgba(28,32,39,${frost.dark})` : `rgba(248,250,253,${frost.light})`;
                                const cardVariables = `--nsx-glass:${glassSurface};--nsx-blur:${frost.blur}px;--nsx-ink:${currentIsDark ? '#e8edf4' : '#253144'};--nsx-muted:${currentIsDark ? '#aab4c3' : '#6e7887'};--nsx-accent:${currentIsDark ? '#86b7f0' : '#4679aa'};--nsx-surface:${currentIsDark ? 'rgba(255,255,255,.10)' : 'rgba(255,255,255,.56)'};--nsx-fallback:${currentIsDark ? '#252b34' : '#f3f6fa'};`;


                                const dailyAverage = (count, unit, allowNegative = false) => {
                                    if (!Number.isSafeInteger(count) || (!allowNegative && count < 0) || dayCount === null) return '未知';
                                    if (dayCount === 0) return '注册不足一天';
                                    return `${(count / dayCount).toFixed(2)}${unit}/天`;
                                };
                                const cardStyle = 'liquid';
                                const bioText = userData.bio === null ? '资料未提供' : (userData.bio.trim() || '未填写');
                                const referenceHelp = reference ? `注册天数 ${reference.parts.days.toFixed(1)}/20；日均发帖 ${reference.parts.post.toFixed(1)}/20；日均评论 ${reference.parts.comment.toFixed(1)}/15；日均鸡腿 ${reference.parts.coin.toFixed(1)}/25；星辰 ${reference.parts.star.toFixed(1)}/20` : '需要完整资料及至少1天注册时间';
                                const extraDetails = `
                                    <section class="nsx-card-section">
                                        <div class="nsx-card-detail-row" title="${escapeInfo(referenceHelp)}"><b>⭐ 账号参考分</b><b class="nsx-reference-score" style="background:${referenceColor};-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-weight:900;">${referenceText}${reference ? "分" : ""}</b></div>
                                        <div class="nsx-card-detail-note">📝 发帖频率：${dailyAverage(userData.nPost, '篇')}</div>
                                        <div class="nsx-card-detail-note">💬 评论频率：${dailyAverage(userData.nComment, '条')}</div>
                                        <div class="nsx-card-detail-note" title="当前鸡腿余额 ÷ 注册天数，不代表每日实际获得量">🍗 日均鸡腿余额：${dailyAverage(userData.coin, '个', true)}</div>
                                        <div class="nsx-card-detail-note">⭐ 星辰总数：${displayValue(userData.stardust)}</div>
                                        <div class="nsx-card-detail-note">📝 个性签名：<span class="nsx-card-bio">${escapeInfo(bioText)}</span></div>
                                        <div class="nsx-card-detail-note">⌛ 注册时长：${joinDays}天</div>
                                    </section>`;

                                const hoverContent = `
                                    <div class="nsx-profile-card nsx-card-${cardStyle}" style="${cardVariables}">
                                    <div class="nsx-card-id">🆔 用户ID：${escapeInfo(userId)}</div>
                                        <div class="nsx-card-header" style="font-weight:bold;margin-bottom:8px;border-bottom:1px solid ${tipDiv};padding-bottom:5px;display:flex;justify-content:space-between;align-items:center;">
                                            <span style="font-size:14px;">${escapeInfo(username)}</span>
                                            <span style="background:${lvGradient};-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-size:15px;font-weight:900;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.1));">Lv ${rankText}</span>
                                        </div>
                                        <div class="nsx-card-summary" style="display:grid;grid-template-columns:1fr auto 1fr;gap:4px 12px;align-items:center;font-size:12px;">
                                            <div style="text-align:left;white-space:nowrap;">注册 <span class="layui-badge layui-bg-blue" style="height:18px;line-height:18px;">${joinDays}</span> 天</div>
                                            <div style="color:${tipDiv};font-size:11px;user-select:none;">|</div>
                                            <div style="text-align:left;white-space:nowrap;"><time class="nsx-profile-joined layui-badge layui-bg-blue" style="height:18px;line-height:18px;" datetime="${escapeInfo(joinedISO)}" aria-label="加入日期：${escapeInfo(joinedTime)}，北京时间（UTC+8）">${escapeInfo(joinedTime)}</time> 加入</div>

                                            <div style="text-align:left;">主题 <a href="/space/${userId}#/discussions" target="_blank" style="font-weight:bold;color:#4fc3f7;text-decoration:underline;">${displayValue(userData.nPost)}</a></div>
                                            <div style="color:${tipDiv};font-size:11px;user-select:none;">|</div>
                                            <div style="text-align:left;">评论 <a href="/space/${userId}#/comments" target="_blank" style="font-weight:bold;color:#4fc3f7;text-decoration:underline;">${displayValue(userData.nComment)}</a></div>

                                            <div style="text-align:left;">鸡腿 <b style="color:#ffb300;">${displayValue(userData.coin)}</b></div>
                                            <div style="color:${tipDiv};font-size:11px;user-select:none;">|</div>
                                            <div style="text-align:left;">星尘 <b style="color:#e040fb;">${displayValue(userData.stardust)}</b></div>

                                            <div style="text-align:left;">成就分 <b style="background:${trustColor};-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-weight:bold;filter:drop-shadow(0 0 1px rgba(0,0,0,0.3));">${trustScore}</b>/100</div>
                                            <div style="color:${tipDiv};font-size:11px;user-select:none;">|</div>
                                            <div style="text-align:left;">成就 <b style="background:${trustColor};-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-weight:bold;filter:drop-shadow(0 0 1px rgba(0,0,0,0.3));">${trustLevel}</b></div>
                                        </div>
                                        ${extraDetails}
                                        <div class="nsx-achievement-notice" style="text-align:center;margin-top:8px;padding-top:8px;border-top:1px solid ${tipBorder};font-size:12px;line-height:1.5;font-weight:600;font-style:normal;color:${tipNoticeColor};">评分基于公开资料，不代表交易信用。</div>
                                    </div>
                                `;

                                const tipIndex = ctx.ui.tips?.(hoverContent, lvSpan, {
                                    tips: [3, 'transparent'],
                                    time: 0,
                                    end: () => {
                                        if (activeProfileTip === tip) { cancelProfileTipClose(); activeProfileTip = null; }
                                    },
                                    success: (layero, index) => {
                                        if (activeProfileTip !== tip) { tip.layer?.close?.(index); return; }
                                        tip.index = index;
                                        if (layero && layero[0]) {
                                            tip.popup = layero[0];
                                            tip.popup.classList.add('nsx-profile-tip', `nsx-tip-${cardStyle}`);
                                            // 移除 Layer 默认的外层背景、阴影和边框，只保留我们自定义的圆角容器
                                            layero.css({ 'background-color': 'transparent', 'box-shadow': 'none', 'border': 'none' });
                                            layero.find('.layui-layer-content').css({ 'padding': '0', 'overflow': 'visible' });
                                            layero.find('.layui-layer-TipsG').css('display', 'none'); // 隐藏那个小三角形，让界面更清爽
                                            positionProfileTip();
                                            requestAnimationFrame(() => { if (activeProfileTip === tip) positionProfileTip(); });

                                            layero[0].onmouseenter = () => {
                                                if (activeProfileTip !== tip) return;
                                                tip.popupHovered = true; cancelProfileTipClose();
                                            };
                                            layero[0].onmouseleave = () => {
                                                if (activeProfileTip !== tip) return;
                                                tip.popupHovered = false;
                                                if (!touchProfileTips()) delayProfileTipClose(tip, 200);
                                            };
                                        }
                                    }
                                });
                                if (tipIndex != null) tip.index = tipIndex;
                                if (tip.index == null && activeProfileTip === tip) activeProfileTip = null;
                            };
                            lvSpan.onmouseenter = () => {
                                if (touchProfileTips()) return;
                                hoveredProfileAnchors.add(lvSpan);
                                cancelProfileTipOpen();
                                if (activeProfileTip?.anchor === lvSpan) { cancelProfileTipClose(); return; }
                                // Ignore quick passes over labels. Only the latest settled hover opens.
                                pendingProfileAnchor = lvSpan;
                                profileOpenTimer = setTimeout(() => {
                                    if (pendingProfileAnchor !== lvSpan) return;
                                    cancelProfileTipOpen();
                                    if (lvSpan.isConnected && hoveredProfileAnchors.has(lvSpan) && !touchProfileTips()) showProfileTip();
                                }, 150);
                            };
                            lvSpan.onmouseleave = () => {
                                hoveredProfileAnchors.delete(lvSpan);
                                if (pendingProfileAnchor === lvSpan) cancelProfileTipOpen();
                                if (!touchProfileTips() && activeProfileTip?.anchor === lvSpan) delayProfileTipClose(activeProfileTip, 250);
                            };
                            const markProfileTouch = () => { profileTouchUntil = Date.now() + 1500; cancelProfileTipOpen(); };
                            lvSpan.addEventListener('touchstart', markProfileTouch, { passive: true });
                            lvSpan.addEventListener('pointerdown', event => { if (event.pointerType === 'touch') markProfileTouch(); });
                            lvSpan.onclick = event => {
                                if (!touchProfileTips()) return;
                                event.preventDefault();
                                event.stopPropagation();
                                if (activeProfileTip?.anchor === lvSpan) closeProfileTip();
                                else showProfileTip();
                            };
                            if (isListAuthor) {
                                infoSpanDiv.classList.add('nsx-list-before-author');
                                el.before(infoSpanDiv);
                            } else {
                                // Put the badge beside the name, outside the profile link.
                                el.parentElement.classList.add('nsx-author-name-line');
                                el.after(infoSpanDiv);
                            }
                        }
                    }

                    // List pages only show reputation; keep social actions on post details.
                    const ownUserId = ctx.uid ?? ctx.user?.member_id;
                    if (ownUserId != null && userId != null && String(ownUserId) === String(userId)) {
                        metaInfo.querySelectorAll('.nsx-relation-btn-wrap').forEach(node => node.remove());
                        el.dataset.nsxSocialLoaded = "1";
                        return;
                    }
                    if (isListAuthor || el.dataset.nsxSocialLoaded) return;
                    el.dataset.nsxSocialLoaded = "1";

                    // --- B. 独立社交按钮逻辑 ---
                    const showFriend = ctx.store.get("relation.show_friend_btn", true);
                    const showBlock = ctx.store.get("relation.show_block_btn", true);
                    if (showFriend || showBlock) {
                        const blacklist = JSON.parse(localStorage.getItem('nsx_advanced_blacklist') || '{}');
                        const friends = JSON.parse(localStorage.getItem('nsx_advanced_friends') || '{}');
                        const isBlocked = !!blacklist[username];
                        const isFriend = !!friends[username];
                        const normalizeInlineBlacklistMode = (mode, fallback = "fold") => {
                            const val = mode === "hide" ? "official" : mode;
                            return ["fold", "official", "mark"].includes(val) ? val : fallback;
                        };

                        const bindInlineAction = (btn, isTrue, key, map, msgOn, msgOff, targetUserId) => {
                            btn.onclick = () => {
                                if (isTrue) {
                                    delete map[username];
                                    localStorage.setItem(key, JSON.stringify(map));
                                    ctx.ui.toast(msgOff);
                                    setTimeout(() => nsxReloadPage(), 800);
                                } else {
                                    if (key === 'nsx_advanced_blacklist' && ctx.ui?.layer) {
                                        const defaultMode = normalizeInlineBlacklistMode(ctx.store.get("relation.blacklist_mode", "fold"));
                                        const isMb = document.documentElement.classList.contains('nsx-mobile');
                                        const html = `
                                            <div class="layui-form nsx-block-form" style="padding:20px 20px 0;">
                                                <div class="layui-form-item">
                                                    <label class="layui-form-label" style="width:72px;padding-left:0;">备注</label>
                                                    <div class="layui-input-block" style="margin-left:${isMb ? '0' : '92px'};">
                                                        <input type="text" id="nsx-blacklist-remark" class="layui-input" placeholder="可选备注">
                                                    </div>
                                                </div>
                                                <div class="layui-form-item">
                                                    <label class="layui-form-label" style="width:72px;padding-left:0;">模式</label>
                                                    <div class="layui-input-block" style="margin-left:${isMb ? '0' : '92px'};">
                                                        <select id="nsx-blacklist-mode">
                                                            <option value="fold" ${defaultMode === 'fold' ? 'selected' : ''}>优雅折叠</option>
                                                            <option value="official" ${defaultMode === 'official' ? 'selected' : ''}>官方屏蔽</option>
                                                            <option value="mark" ${defaultMode === 'mark' ? 'selected' : ''}>标记模式</option>
                                                        </select>
                                                    </div>
                                                </div>
                                            </div>`;
                                        ctx.ui.layer.open({
                                            title: msgOn,
                                            content: html,
                                            area: ['min(460px,94vw)', 'auto'],
                                            skin: 'nsx-mode-layer',
                                            btn: ['确定', '取消'],
                                            success: (l) => {
                                                layui.use(['form'], function () {
                                                    layui.form.render('select');
                                                });
                                                l.find('#nsx-blacklist-remark').focus();
                                            },
                                            yes: async (pIndex, l) => {
                                                const val = l.find('#nsx-blacklist-remark').val().trim();
                                                const selectedMode = normalizeInlineBlacklistMode(l.find('#nsx-blacklist-mode').val(), defaultMode);
                                                if (selectedMode === 'official') {
                                                    try {
                                                        const r = await ctx.net.post("/api/block-list/add", { block_member_name: username });
                                                        if (!r?.success) {
                                                            ctx.ui.alert("同步失败", r?.message || "官方接口调用失败，仅保存本地备注");
                                                        }
                                                    } catch (e) {
                                                        env.error("Sync Official Block Failed", e);
                                                    }
                                                }
                                                map[username] = { remark: val, time: new Date().toLocaleString(), userId: targetUserId, mode: selectedMode };
                                                localStorage.setItem(key, JSON.stringify(map));
                                                ctx.ui.layer.close(pIndex);
                                                ctx.ui.toast("操作成功");
                                                setTimeout(() => nsxReloadPage(), 800);
                                            }
                                        });
                                        return;
                                    }
                                    ctx.ui.layer.prompt({ title: msgOn }, async (val, pIndex) => {
                                        map[username] = { remark: val, time: new Date().toLocaleString(), userId: targetUserId };
                                        localStorage.setItem(key, JSON.stringify(map));
                                        ctx.ui.layer.close(pIndex);
                                        ctx.ui.toast("操作成功");
                                        setTimeout(() => nsxReloadPage(), 800);
                                    });
                                }
                            };
                        };

                        const btnWrap = document.createElement('span');
                        btnWrap.className = 'nsx-relation-btn-wrap';
                        btnWrap.style.cssText = 'display:inline-flex;gap:4px;vertical-align:middle;margin-left:8px;';

                        if (showFriend) {
                            const frBtn = document.createElement('span');
                            frBtn.className = 'nsx-relation-btn nsx-btn-friend';
                            frBtn.innerHTML = document.documentElement.classList.contains('nsx-mobile')
                                ? (isFriend ? '✖' : '➕')
                                : (isFriend ? '✖ 好友' : '➕ 好友');
                            bindInlineAction(frBtn, isFriend, 'nsx_advanced_friends', friends, `添加 ${username} 为好友`, `已取消关注 ${username}`, userId);
                            btnWrap.appendChild(frBtn);
                        }
                        if (showBlock) {
                            const blBtn = document.createElement('span');
                            blBtn.className = 'nsx-relation-btn nsx-btn-block';
                            blBtn.innerHTML = document.documentElement.classList.contains('nsx-mobile')
                                ? (isBlocked ? '⭕' : '🚫')
                                : (isBlocked ? '⭕ 解除' : '🚫 屏蔽');
                            bindInlineAction(blBtn, isBlocked, 'nsx_advanced_blacklist', blacklist, `屏蔽 ${username}`, `已解除屏蔽 ${username}`, userId);
                            btnWrap.appendChild(blBtn);
                        }

                        const floorWrapper = metaInfo.querySelector('.floor-link-wrapper');
                        if (floorWrapper) floorWrapper.prepend(btnWrap);
                        else {
                            const anchor = metaInfo.querySelector('.floor-link, .post-info, .comment-info');
                            if (anchor) anchor.before(btnWrap);
                        }
                    }
                };

                const detailAuthors = '.nsk-content-meta-info .author-info > a[href*="/space/"]';
                const listRows = '.post-list-item, .post-list .list-item';
                const listAuthors = '.info-author[href*="/space/"], .info-author a[href*="/space/"], .post-author[href*="/space/"], .post-author a[href*="/space/"], .author-info > a[href*="/space/"]';
                const observedAuthors = new WeakSet();
                const profileObserver = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
                    for (const entry of entries) if (entry.isIntersecting) {
                        profileObserver.unobserve(entry.target);
                        display(entry.target);
                    }
                    drainProfiles();
                }, { rootMargin: '400px 0px' }) : null;
                const trackAuthor = author => {
                    const id = author.href?.match(/\/space\/(\d+)/)?.[1];
                    if (!id) return;
                    const targets = trackedAuthors.get(id) || new Set();
                    for (const el of targets) if (!el.isConnected) targets.delete(el);
                    targets.add(author);
                    trackedAuthors.set(id, targets);
                };
                refreshFailedAuthors = id => {
                    if (refreshJobs.has(id)) return;
                    const targets = trackedAuthors.get(id);
                    if (!targets) return;
                    for (const author of targets) {
                        if (!author.isConnected) { targets.delete(author); continue; }
                        if (!author.dataset.nsxProfileFailed) continue;
                        retryControls.get(author)?.remove();
                        retryControls.delete(author);
                        delete author.dataset.nsxProfileFailed;
                        delete author.dataset.nsxInfoLoaded;
                        display(author);
                    }
                    if (!targets.size) trackedAuthors.delete(id);
                };
                refreshUserProfile = (id, source, force = false) => {
                    if (refreshJobs.has(id)) return refreshJobs.get(id);
                    if (!source?.isConnected) return Promise.resolve();
                    if (!force && Date.now() - (autoRefreshAt.get(id) || 0) < 60000) return Promise.resolve();
                    autoRefreshAt.set(id, Date.now());
                    trackAuthor(source);
                    const targets = trackedAuthors.get(id);
                    const setBusy = busy => {
                        for (const author of targets || []) {
                            const button = renderedInfo.get(author)?.querySelector('.nsx-profile-refresh');
                            if (button) { button.disabled = busy; button.setAttribute('aria-busy', String(busy)); }
                        }
                    };
                    if (force) {
                        cache.delete(id);
                        try { GM_deleteValue(`${recordPrefix}${id}`); } catch { }
                    }
                    setBusy(true);
                    const job = loadProfile(id, source).then(async data => {
                        if (data) {
                            // Update all occurrences, preserving old badges until the request succeeds.
                            for (const author of targets || []) {
                                if (!author.isConnected) continue;
                                retryControls.get(author)?.remove();
                                retryControls.delete(author);
                                delete author.dataset.nsxProfileFailed;
                                delete author.dataset.nsxInfoLoaded;
                                await display(author);
                            }
                        } else {
                            for (const author of targets || []) {
                                const button = renderedInfo.get(author)?.querySelector('.nsx-profile-refresh');
                                if (button) button.title = '刷新失败，保留原数据显示；点击重试';
                            }
                        }
                    }).catch(() => {
                        // A refresh failure must not remove a previously displayed assessment.
                    }).finally(() => { setBusy(false); refreshJobs.delete(id); });
                    refreshJobs.set(id, job);
                    return job;
                };
                const refreshVisibleExpired = () => {
                    if (document.hidden || !ctx.store.get("inline_user_info.enabled", true)) return;
                    const now = Date.now();
                    for (const [id, targets] of trackedAuthors) {
                        const source = [...targets].find(author => author.isConnected && nearViewport(author) &&
                            displayedAt.has(author) && now - displayedAt.get(author) >= PROFILE_TTL);
                        if (source) refreshUserProfile(id, source);
                    }
                };
                document.addEventListener('visibilitychange', refreshVisibleExpired);
                window.addEventListener('focus', refreshVisibleExpired);
                window.addEventListener('pageshow', refreshVisibleExpired);
                const scheduleAuthor = author => {
                    trackAuthor(author);
                    if (author.dataset.nsxInfoLoaded) return;
                    if (cachedProfile(author.href.match(/\/space\/(\d+)/)?.[1]) || !profileObserver || nearViewport(author)) {
                        profileObserver?.unobserve(author);
                        display(author);
                    } else if (!observedAuthors.has(author)) {
                        observedAuthors.add(author);
                        profileObserver.observe(author);
                    }
                };
                const scanAuthors = root => {
                    if (ctx.isPost) {
                        if (root.matches?.(detailAuthors)) scheduleAuthor(root);
                        root.querySelectorAll(detailAuthors).forEach(scheduleAuthor);
                    }
                    if (!showList || !ctx.store.get("inline_user_info.enabled", true)) return;
                    const rows = new Set(root.querySelectorAll(listRows));
                    if (root.matches?.(listRows)) rows.add(root);
                    const parentRow = root.closest?.(listRows);
                    if (parentRow) rows.add(parentRow);
                    rows.forEach(item => {
                        const author = item.querySelector(listAuthors);
                        if (author && /\/space\/\d+(?:[/?#]|$)/.test(author.href)) scheduleAuthor(author);
                    });
                };
                const authorObserver = new MutationObserver(mutations => {
                    const roots = new Set();
                    for (const mutation of mutations) for (const node of mutation.addedNodes) {
                        if (node.nodeType !== 1 || node.closest('.nsx-user-info-display, .nsx-profile-retry, .nsx-relation-btn-wrap, .layui-layer')) continue;
                        roots.add(node);
                    }
                    for (const root of roots) if (root.isConnected) scanAuthors(root);
                    // Release references to rows removed by navigation or infinite-scroll cleanup.
                    if (mutations.some(mutation => mutation.removedNodes.length)) {
                        for (const [row, anchor] of categoryAnchors) if (!row.isConnected || !anchor.category.isConnected || !anchor.badge.isConnected) {
                            categoryResizeObserver?.unobserve(row);
                            categoryResizeObserver?.unobserve(anchor.category);
                            categoryResizeObserver?.unobserve(anchor.badge);
                            categoryAnchors.delete(row);
                        }
                        for (const [id, targets] of trackedAuthors) {
                            for (const author of targets) if (!author.isConnected) { profileObserver?.unobserve(author); observedAuthors.delete(author); targets.delete(author); }
                            if (!targets.size) trackedAuthors.delete(id);
                        }
                    }
                });
                addStyle("nsx-list-user-info", `
                    .layui-layer.nsx-profile-tip{animation:none!important;transition:none!important;border:0!important;border-radius:10px!important;background:transparent!important;box-shadow:0 16px 44px rgba(18,28,45,.17),0 4px 12px rgba(18,28,45,.08)!important;overflow:hidden!important}
                    .layui-layer.nsx-profile-tip .layui-layer-content{border:0!important;border-radius:10px!important;background:transparent!important;box-shadow:none!important;overflow:hidden!important}
                    .layui-layer.nsx-profile-tip .layui-layer-TipsG{display:none!important}
                    .nsx-profile-card{padding:14px;width:300px;max-width:calc(100vw - 16px);max-height:calc(100dvh - 16px);overflow:auto;overscroll-behavior:contain;box-sizing:border-box;color:var(--nsx-ink);background:linear-gradient(135deg,rgba(255,255,255,.30),rgba(255,255,255,.03) 48%,rgba(255,255,255,.13)),var(--nsx-glass);border:0!important;border-radius:10px;box-shadow:none;backdrop-filter:blur(var(--nsx-blur)) saturate(165%);-webkit-backdrop-filter:blur(var(--nsx-blur)) saturate(165%);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;scrollbar-width:thin;font-variant-numeric:tabular-nums}
                    .nsx-profile-card>.nsx-card-header{border:0!important;padding:0 2px 2px!important;margin-bottom:10px!important}
                    .nsx-card-summary,.nsx-card-id,.nsx-card-section{padding:10px;background:var(--nsx-surface)!important;border:0!important;border-radius:10px;color:var(--nsx-ink)!important;font-size:12px;box-shadow:inset 0 1px 0 rgba(255,255,255,.45),0 3px 12px rgba(20,40,65,.045)}
                    .nsx-card-section{margin-top:10px;line-height:1.6}
                    .nsx-profile-card>.nsx-card-id{margin:0 0 12px;line-height:1.6}
                    .nsx-profile-card>.nsx-card-id{background:linear-gradient(120deg,rgba(255,255,255,.28),rgba(255,255,255,.03) 52%,rgba(255,255,255,.12)),rgba(255,85,46,.78)!important;color:#58200f!important;backdrop-filter:blur(var(--nsx-blur)) saturate(145%);-webkit-backdrop-filter:blur(var(--nsx-blur)) saturate(145%)}
                    .dark-layout .nsx-profile-card>.nsx-card-id,html.dark .nsx-profile-card>.nsx-card-id{background:linear-gradient(120deg,rgba(255,255,255,.20),rgba(255,255,255,.02) 52%,rgba(255,255,255,.10)),rgba(255,85,46,.88)!important;color:#351207!important}
                    .nsx-card-summary{padding:12px!important}
                    .nsx-card-section{padding:12px!important}
                    .nsx-card-detail-row{display:flex;justify-content:space-between;gap:8px;align-items:baseline}
                    .nsx-card-detail-note{margin-top:5px;color:var(--nsx-muted);overflow-wrap:anywhere}
                    .nsx-profile-card a{color:var(--nsx-accent)!important}
                    .nsx-profile-card .layui-badge{background:transparent!important;color:var(--nsx-accent)!important;border:0!important;padding:0 2px;font-weight:600}
                    .nsx-profile-card .nsx-achievement-notice{border:0!important;color:var(--nsx-muted)!important;font-size:11px!important;font-weight:400!important;margin-top:10px!important;padding-top:0!important}
                    @supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){.nsx-profile-card{background:var(--nsx-fallback)}}

                    .nsx-profile-card,.nsx-profile-card .nsx-card-summary,.nsx-profile-card .nsx-card-id,.nsx-profile-card .nsx-card-section{border:0!important;outline:0!important}
                    .nsx-profile-card .nsx-card-summary,.nsx-profile-card .nsx-card-section,.nsx-profile-card .nsx-card-id{box-shadow:0 3px 12px rgba(20,40,65,.045)}
                    .nsx-profile-card .nsx-reference-score{font-size:20px;line-height:1.2;flex-shrink:0}
                    .nsx-card-bio{white-space:pre-wrap;overflow-wrap:anywhere}
                    .nsx-user-info-display .nsx-lv-badge{border:0!important;outline:0!important;box-shadow:none!important;background-image:none;text-shadow:none!important;opacity:1}
                    .nsx-user-info-display .nsx-lv-badge::before,.nsx-user-info-display .nsx-lv-badge::after{display:none!important}
                    .nsx-user-info-display .nsx-badge-text{background:transparent!important;color:inherit!important;padding:0!important;border-radius:0}
                    .nsx-user-info-display .nsx-badge-ios{background:#f5f5f7!important;color:#253144!important}
                    .nsx-user-info-display .nsx-badge-liquid{background:linear-gradient(115deg,rgba(255,255,255,.18),rgba(255,255,255,0)),var(--nsx-level-gradient)!important;color:#fff!important;backdrop-filter:blur(8px) saturate(140%);-webkit-backdrop-filter:blur(8px) saturate(140%)}
                    .nsx-user-info-display .nsx-badge-tech{background:linear-gradient(110deg,#071b2d,#153c53)!important;color:#baf5ff!important}
                    .nsx-mobile .nsx-user-info-display .nsx-lv-badge{display:inline-flex!important;align-items:center!important;justify-content:center;vertical-align:middle}
                    @media(max-width:760px){.nsx-user-info-display .nsx-lv-badge{display:inline-flex!important;align-items:center!important;justify-content:center;vertical-align:middle}}
                    .nsx-author-name-line{min-width:0}
                    .nsx-author-name-line>a{display:inline!important}
                    .nsx-detail-user-info{display:inline-flex!important;flex:0 1 auto;width:auto;max-width:100%;min-width:0;box-sizing:border-box;margin:0 0 0 8px!important;vertical-align:middle;white-space:normal}
                    .nsx-detail-user-info .nsx-lv-badge{min-width:0;max-width:100%;margin-left:0!important;margin-inline-start:0!important;white-space:normal!important;overflow-wrap:anywhere;line-height:1.5}
                    .nsx-detail-user-info .nsx-profile-refresh{flex-shrink:0}
                    .post-list-item>.post-list-content.nsx-assessment-list-content{flex:1 1 0%!important;min-width:0!important;box-sizing:border-box}
                    .nsx-list-info-row{display:flex!important;align-items:center;flex-wrap:wrap;column-gap:4px;row-gap:4px;box-sizing:border-box;min-width:0;max-width:100%;width:100%}
                    .nsx-list-info-row>.nsx-list-user-info{margin-left:auto!important;margin-inline-start:auto!important;min-width:0;max-width:100%;vertical-align:middle;flex-shrink:0}
                    .post-list-item>.nsx-category-assessment{position:absolute!important;display:inline-flex;align-items:center;gap:0;margin:0!important;min-width:0;box-sizing:border-box;font-size:11px}
                    .nsx-category-assessment.nsx-category-assessment-inline{position:static!important;display:inline-flex;align-items:center;margin:0 0 0 4px!important;max-width:100%;min-width:0;box-sizing:border-box;font-size:11px;vertical-align:middle}
                    /* Carousel metadata can forbid wrapping; mobile assessments get their own row. */
                    .nsx-mobile .topic-carousel-panel.nsx-assessment-carousel{height:var(--nsx-assessment-carousel-height)!important;max-height:none!important}
                    .nsx-mobile .topic-carousel-item .post-info,.nsx-mobile .topic-carousel-panel .post-info{white-space:normal!important;flex-wrap:wrap!important}
                    .nsx-mobile .nsx-category-assessment-inline,.nsx-mobile .nsx-list-info-row>.nsx-list-user-info{display:flex!important;flex:0 0 100%;width:100%;max-width:100%;margin:4px 0 0!important;margin-inline-start:0!important;white-space:normal!important}
                    .nsx-mobile .nsx-list-user-info .nsx-lv-badge{margin-left:0!important;margin-inline-start:0!important}
                    .nsx-list-assessment-row{flex-basis:100%}
                    .nsx-list-user-info .nsx-lv-badge{font-size:10px!important;padding:1px 4px!important;line-height:1.5;white-space:normal;overflow-wrap:anywhere}
                    .nsx-list-user-info .nsx-profile-refresh{flex-shrink:0}
                    .nsx-list-before-author{position:static!important;display:inline-flex!important;vertical-align:middle;width:auto!important;max-width:100%;margin:0 5px 0 0!important}
                `);
                scanAuthors(document);
                authorObserver.observe(document.body, { childList: true, subtree: true });
            }
        };
        define(inlineUserInfo);

        /* Detail-only shortcut. Opening a conversation never sends a message. */
        const detailPrivateMessage = {
            id: "detailPrivateMessage",
            order: 395,
            cfg: { private_message: { enabled: true } },
            meta: { private_message: { label: "详情页私信快捷按钮", group: "🤝 社交关系" } },
            match: ctx => ctx.isPost && ctx.loggedIn && ctx.store.get("private_message.enabled", true),
            init(ctx) {
                const selector = '.nsk-content-meta-info';
                addStyle('nsx-private-message-style', `
                    .nsk-content-meta-info .nsx-pm-actions{display:inline-flex!important;align-items:center;justify-content:flex-end;gap:6px;flex-wrap:wrap;margin-left:auto;flex-shrink:0}
                    .nsx-private-message{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;padding:2px 7px;border:1px solid #a5b4fc;border-radius:6px;font-size:11px;line-height:1.6;white-space:nowrap;text-decoration:none;cursor:pointer;color:#4f46e5;background:rgba(99,102,241,.06);transition:border-color .15s,color .15s,background-color .15s,box-shadow .15s}
                    .nsx-private-message .nsx-pm-label{margin-left:4px}
                    .nsx-mobile .nsx-private-message .nsx-pm-label{display:none}
                    .nsx-private-message:hover{border-color:#6366f1;color:#4338ca;background:rgba(99,102,241,.12);box-shadow:0 2px 6px rgba(99,102,241,.16);text-decoration:none}
                    .nsx-private-message:focus-visible{outline:2px solid #a5b4fc;outline-offset:2px}
                    .dark-layout .nsx-private-message,.dark .nsx-private-message{border-color:#818cf8;color:#c7d2fe;background:rgba(129,140,248,.12)}
                    .dark-layout .nsx-private-message:hover,.dark .nsx-private-message:hover{border-color:#a5b4fc;color:#e0e7ff;background:rgba(129,140,248,.2)}
                `);
                const render = meta => {
                    const author = meta.querySelector('.author-info > a[href*="/space/"]');
                    const id = author?.href.match(/\/space\/([1-9]\d*)(?:[/?#]|$)/)?.[1];
                    const ownId = ctx.uid || ctx.user?.member_id;
                    let link = meta.querySelector('a.nsx-private-message');
                    if (!id || (ownId != null && String(ownId) === id)) {
                        const actions = link?.parentElement;
                        link?.remove();
                        if (actions?.classList.contains('nsx-pm-fallback') && !actions.childNodes.length) actions.remove();
                        return;
                    }
                    if (!link) {
                        link = document.createElement('a');
                        link.className = 'nsx-private-message';
                        const icon = document.createElement('span');
                        icon.textContent = '✉';
                        icon.setAttribute('aria-hidden', 'true');
                        const label = document.createElement('span');
                        label.className = 'nsx-pm-label';
                        label.textContent = '私信';
                        link.append(icon, label);
                        link.target = '_blank';
                        link.rel = 'noopener noreferrer';
                        link.addEventListener('click', event => event.stopPropagation());
                    }
                    const href = `/notification#/message?mode=talk&to=${id}`;
                    if (link.getAttribute('href') !== href) link.setAttribute('href', href);
                    const title = `给 ${author.textContent.trim()} 发私信`;
                    if (link.title !== title) { link.title = title; link.setAttribute('aria-label', title); }
                    let actions = meta.querySelector('.nsx-meta-footer') || meta.querySelector('.floor-link-wrapper, .nsx-pm-fallback');
                    if (!actions) {
                        actions = document.createElement('span');
                        actions.className = 'nsx-pm-actions nsx-pm-fallback';
                        meta.appendChild(actions);
                    } else if (!actions.classList.contains('nsx-meta-footer') && !actions.classList.contains('nsx-pm-actions')) actions.classList.add('nsx-pm-actions');
                    // Place both shortcuts before native badges (HOT etc.) and the floor number.
                    const quick = meta.querySelector('.nsx-floor-quick');
                    const nativeStart = [...actions.children].find(child =>
                        child !== link && child !== quick && !child.classList.contains('nsx-relation-btn-wrap'));
                    const correctlyPlaced = link.parentElement === actions &&
                        (quick ? link.nextElementSibling === quick && quick.nextElementSibling === (nativeStart || null)
                               : link.nextElementSibling === (nativeStart || null));
                    if (!correctlyPlaced) {
                        actions.insertBefore(link, nativeStart || null);
                        if (quick) link.after(quick);
                    }
                };
                const scan = root => {
                    const metas = new Set();
                    if (root.nodeType === 1) {
                        if (root.matches(selector)) metas.add(root);
                        const parent = root.closest(selector);
                        if (parent) metas.add(parent);
                    }
                    root.querySelectorAll?.(selector).forEach(meta => metas.add(meta));
                    metas.forEach(render);
                };
                scan(document);
                new MutationObserver(mutations => {
                    const roots = new Set();
                    for (const mutation of mutations) {
                        if (mutation.type === 'attributes') {
                            if (mutation.target.closest('.author-info')) roots.add(mutation.target);
                            continue;
                        }
                        for (const node of mutation.addedNodes) {
                            if (node.nodeType === 1 && !node.closest('.nsx-pm-actions, .nsx-private-message')) roots.add(node);
                        }
                    }
                    roots.forEach(root => { if (root.isConnected) scan(root); });
                }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
            }
        };
        define(detailPrivateMessage);
        const floorQuickReply = {
            id: 'floorQuickReply', order: 396,
            cfg: { floor_quick_reply: { enabled: true, presets: '' } },
            meta: { floor_quick_reply: { label: '楼层快捷回复', group: '🧭 辅助工具', hidden: ['presets'] } },
            init(ctx) {
                const defaults = () => [
                    { icon:'👍', name:'赞一个', text:'good！！:xhj002: :xhj002: :xhj002:' },
                    { icon:'⬆️', name:'赞同', text:'赞同！:xhj002: :xhj002: :xhj002:' },
                    { icon:'⭐', name:'收藏', text:'收藏了，谢谢！:xhj002:' },
                    { icon:'📚', name:'同问', text:'同问！！:xhj002: :xhj002: :xhj002:' }
                ];
                const readPresets = () => {
                    try { const raw=ctx.store.get('floor_quick_reply.presets','');if(!raw)return defaults();const data=JSON.parse(raw);return Array.isArray(data)?data.filter(x=>x&&typeof x.text==='string'&&x.text.trim()):defaults(); }catch{return defaults();}
                };
                const make = (tag, text, cls) => {const el=document.createElement(tag);if(text!=null)el.textContent=text;if(cls)el.className=cls;return el;};
                addStyle('nsx-floor-quick-style', `
                    .nsx-reply-popover{position:fixed;z-index:2147483600;width:280px;padding:10px;box-sizing:border-box;border:0;border-radius:14px;overflow:auto;overscroll-behavior:contain;background:rgba(247,249,252,.94);color:#273141;box-shadow:0 12px 32px #15223830;backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);font:13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
                    .nsx-reply-popover-title{font-size:11px;color:#7a8797;padding:2px 6px 7px}
                    .nsx-reply-preset{display:block;box-sizing:border-box;width:100%;margin:4px 0;padding:10px;border:0;border-radius:8px;text-align:left;white-space:pre-wrap;overflow-wrap:anywhere;background:#fff9;color:inherit;font:inherit;cursor:pointer}
                    .nsx-reply-preset:hover,.nsx-reply-preset:focus-visible{background:#4679aa20;outline:none}
                    .dark-layout .nsx-reply-popover,.dark .nsx-reply-popover{background:rgba(33,39,48,.95);color:#e7edf5}
                    .dark-layout .nsx-reply-preset,.dark .nsx-reply-preset{background:#ffffff0c}
                    .nsx-floor-quick{display:inline-flex;align-items:center;gap:4px;font:inherit;font-size:11px;padding:2px 7px;line-height:1.6;border:1px solid #91b7d5;border-radius:6px;color:#4679aa;background:#4679aa0c;cursor:pointer;white-space:nowrap}
                    .nsx-reply-dialog{width:min(820px,92vw);max-height:85vh;box-sizing:border-box;padding:24px;border:0;border-radius:16px;background:#fff;color:#273141;box-shadow:0 20px 60px #0003;overflow:auto;font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
                    .nsx-reply-dialog::backdrop{background:#17213355;backdrop-filter:blur(5px)}
                    .nsx-reply-dialog>header{position:static!important;width:auto!important;height:auto!important;min-height:0!important;padding:0!important;background:transparent!important;box-shadow:none!important;border:0!important;display:flex;align-items:center;justify-content:space-between;font-size:19px;font-weight:600;margin-bottom:18px}
                    .nsx-reply-dialog button{cursor:pointer;border:1px solid #dbe1e8;border-radius:6px;background:transparent;color:inherit;padding:8px 12px;font:inherit}
                    .nsx-reply-dialog>footer{position:static!important;width:auto!important;height:auto!important;padding:0!important;background:transparent!important;box-shadow:none!important;border:0!important;display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}
                    .nsx-reply-edit-row{display:grid;grid-template-columns:minmax(0,1fr) 60px;gap:10px;align-items:center;padding:14px;margin-bottom:12px;background:#f5f7fa;border-radius:10px}
                    .nsx-reply-edit-row input,.nsx-reply-edit-row textarea{box-sizing:border-box;width:100%;min-width:0;border:1px solid #d9dfe6;border-radius:6px;background:#fff;color:inherit;padding:10px;font:inherit}
                    .nsx-reply-edit-row textarea{min-height:44px;resize:vertical}
                    .nsx-reply-dialog .nsx-reply-save{background:#4679aa;color:#fff;border-color:#4679aa}
                    .nsx-reply-choice{display:flex!important;gap:12px;width:100%;margin:8px 0;text-align:left;align-items:center}
                    .nsx-reply-choice small{display:block;white-space:pre-wrap;color:#788494;font-weight:400;overflow-wrap:anywhere}
                    .dark-layout .nsx-reply-dialog,.dark .nsx-reply-dialog{background:#252b34;color:#e2e7ef}
                    .dark-layout .nsx-reply-edit-row,.dark .nsx-reply-edit-row{background:#303742}
                    .dark-layout .nsx-reply-edit-row input,.dark-layout .nsx-reply-edit-row textarea,.dark .nsx-reply-edit-row input,.dark .nsx-reply-edit-row textarea{background:#252b34;border-color:#515a69}
                    @media(max-width:600px){.nsx-reply-edit-row{grid-template-columns:minmax(0,1fr) 60px}.nsx-reply-dialog{padding:16px}}
                `);
                const dialog = title => {
                    document.querySelectorAll('dialog.nsx-reply-dialog').forEach(x=>{x.close();x.remove();});
                    const d=make('dialog',null,'nsx-reply-dialog'),header=make('header'),heading=make('span',title),close=make('button','×');close.type='button';close.setAttribute('aria-label','关闭');header.append(heading,close);d.append(header);document.body.append(d);close.onclick=()=>d.close();d.addEventListener('close',()=>d.remove(),{once:true});d.showModal();return d;
                };
                const manage = () => {
                    const d=dialog('管理快捷回复'),list=make('div'),footer=make('footer');d.append(list,footer);
                    const addRow = item => {
                        const row=make('div',null,'nsx-reply-edit-row');
                        for(const [key,label]of [['text','回复内容']]){const input=make(key==='text'?'textarea':'input');input.value=item[key]||'';input.dataset.field=key;input.placeholder=label;input.setAttribute('aria-label',label);row.append(input);}
                        const remove=make('button','删除');remove.type='button';remove.style.color='#e05c65';remove.onclick=()=>row.remove();row.append(remove);list.append(row);
                    };
                    readPresets().forEach(addRow);
                    const add=make('button','＋ 添加快捷回复'),reset=make('button','恢复默认'),save=make('button','保存', 'nsx-reply-save'),cancel=make('button','取消');
                    for(const button of [add,reset,save,cancel])button.type='button';footer.append(add,reset,save,cancel);
                    add.onclick=()=>addRow({icon:'💬',name:'',text:''});reset.onclick=()=>{list.replaceChildren();defaults().forEach(addRow);};cancel.onclick=()=>d.close();
                    save.onclick=()=>{const items=[...list.children].map(row=>Object.fromEntries([...row.querySelectorAll('[data-field]')].map(el=>[el.dataset.field,el.value.trim()])));if(items.some(x=>!x.text)){ctx.ui.error?.('请填写每条预设的回复内容');return;}ctx.store.set('floor_quick_reply.presets',JSON.stringify(items));d.close();ctx.ui.toast?.('快捷回复已保存');};
                };
                // Preset management is available inside Settings and the reply dialog.
                let sending = false, popover = null, popoverAnchor = null;
                const closePopover = () => {
                    popover?.remove();popover=null;
                    popoverAnchor?.setAttribute('aria-expanded','false');popoverAnchor=null;
                };
                const positionPopover = () => {
                    if(!popover||!popoverAnchor?.isConnected){closePopover();return;}
                    const view=window.visualViewport,left=(view?.offsetLeft||0)+8,top=(view?.offsetTop||0)+8;
                    const right=left+(view?.width||document.documentElement.clientWidth)-16,bottom=top+(view?.height||innerHeight)-16;
                    popover.style.maxHeight=`${Math.max(80,bottom-top)}px`;
                    popover.style.maxWidth=`${right-left}px`;
                    const anchor=popoverAnchor.getBoundingClientRect(),rect=popover.getBoundingClientRect();
                    const below=bottom-anchor.bottom-6,above=anchor.top-top-6;
                    const y=rect.height<=below||below>=above?anchor.bottom+6:anchor.top-rect.height-6;
                    popover.style.left=`${Math.max(left,Math.min(anchor.right-rect.width,right-rect.width))}px`;
                    popover.style.top=`${Math.max(top,Math.min(y,bottom-rect.height))}px`;
                };
                document.addEventListener('click',e=>{if(popover&&!popover.contains(e.target)&&!popoverAnchor?.contains(e.target))closePopover();});
                document.addEventListener('keydown',e=>{if(e.key==='Escape'&&popover){const anchor=popoverAnchor;closePopover();anchor?.focus();}});
                window.addEventListener('resize',positionPopover);
                window.addEventListener('scroll',e=>{if(e.target?.nodeType&&popover?.contains(e.target))return;positionPopover();},{capture:true,passive:true});
                window.visualViewport?.addEventListener('resize',positionPopover);
                const editorState = () => {
                    const editor=document.querySelector('.md-editor');
                    const cm=editor?.querySelector('.CodeMirror')?.CodeMirror,ta=editor?.querySelector('textarea');
                    return {editor,cm,ta,text:cm?cm.getValue():(ta?.value||'')};
                };
                const sendPreset = async (meta,item) => {
                    if(sending)return;
                    // Do not submit unrelated text already in the shared reply editor.
                    if(editorState().text.trim()){ctx.ui.error?.('编辑器已有草稿，请先发送或清空草稿，再使用快捷回复');return;}
                    sending=true;
                    try {
                        const post=meta.closest('.nsk-post, .comments > li, .comment-item, .content-item');
                        const nativeReply=post&&[...post.querySelectorAll('.comment-menu a,.comment-menu button,.comment-menu span')].find(x=>x.textContent.trim()==='回复');
                        if(nativeReply)nativeReply.click();else document.querySelector('#back-to-comment')?.click();
                        let state;
                        for(let i=0;i<20;i++){await new Promise(resolve=>setTimeout(resolve,100));state=editorState();if(state.cm||state.ta)break;}
                        if(!state?.cm&&!state?.ta)throw Error('未找到回复编辑器，请先登录并确认可以回复');
                        const username=meta.querySelector('.author-info > a[href*="/space/"]')?.textContent.trim()||'';
                        const floor=meta.querySelector('.floor-link')?.textContent.trim()||'';
                        const prefix=!nativeReply&&username?`@${username}${floor?' '+floor:''} `:'';
                        const content=state.text+prefix+item.text;
                        if(state.cm){state.cm.setValue(content);}
                        else{state.ta.value=content;state.ta.dispatchEvent(new Event('input',{bubbles:true}));}
                        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
                        const submit=state.editor.querySelector('button.submit.btn,button.submit,button[type="submit"]');
                        if(!submit||submit.disabled||submit.getAttribute('aria-disabled')==='true')throw Error('发布按钮暂不可用，内容已保留在编辑器');
                        if(editorState().text!==content)throw Error('回复内容发生变化，已取消自动发送');
                        submit.click(); // One native submission per preset click; never retry automatically.
                    } catch(error){ctx.ui.error?.(error.message||'快捷回复失败');}
                    finally{setTimeout(()=>{sending=false;},1800);}
                };
                const choose = meta => {
                    const anchor=meta.querySelector('.nsx-floor-quick');
                    if(popoverAnchor===anchor){closePopover();return;}
                    closePopover();if(!anchor||sending)return;
                    popoverAnchor=anchor;anchor.setAttribute('aria-expanded','true');
                    popover=make('div',null,'nsx-reply-popover');popover.setAttribute('role','dialog');popover.setAttribute('aria-label','选择内容立即回复');
                    popover.append(make('div','快捷回复 · 点击即发送','nsx-reply-popover-title'));
                    const items=readPresets();
                    if(!items.length)popover.append(make('p','暂无预设，请在设置中添加'));
                    for(const item of items){
                        const button=make('button',item.text,'nsx-reply-preset');button.type='button';
                        button.onclick=e=>{e.preventDefault();e.stopPropagation();closePopover();sendPreset(meta,item);};popover.append(button);
                    }
                    document.body.append(popover);positionPopover();
                };
                const scan = () => {
                    // Expose the visual editor inside the existing settings dialog.
                    const settings=document.querySelector('#setting-layer-direction-r .nsx-config-tools');
                    if(settings&&!settings.querySelector('.nsx-manage-floor-replies')){const button=make('button','💬 管理楼层快捷回复','layui-btn layui-btn-primary nsx-manage-floor-replies');button.type='button';button.onclick=manage;settings.prepend(button);}
                    if(!ctx.isPost||!ctx.loggedIn||!ctx.store.get('floor_quick_reply.enabled',true))return;
                    document.querySelectorAll('.nsk-content-meta-info').forEach(meta=>{
                        const pm=meta.querySelector('.nsx-private-message');if(!pm)return;
                        let button=meta.querySelector('.nsx-floor-quick');
                        if(!button){button=make('button','','nsx-floor-quick');button.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M20 11a8 8 0 0 1-8 8H7l-4 3v-7a8 8 0 1 1 17-4Z"/><path d="m13 5-4 7h4l-2 5 6-8h-4l2-4"/></svg><span>快捷回复</span>';button.setAttribute('aria-label','快捷回复');button.type='button';button.onclick=e=>{e.preventDefault();e.stopPropagation();choose(meta);};}
                        if(pm.nextElementSibling!==button)pm.after(button);
                    });
                };
                scan();let pending=false;
                const observer=new MutationObserver(()=>{if(pending)return;pending=true;queueMicrotask(()=>{pending=false;scan();});});
                observer.observe(document.body,{childList:true,subtree:true});
            }
        };
        define(floorQuickReply);


        /* ==========================================================================
           [ 🤝 社交关系 ] - 用户关系管理 (关注/好友)
           ========================================================================== */
        const userRelation = {
            id: "userRelation",
            deps: ["ui"],
            order: 390,
            cfg: {
                relation: {
                    show_friend_btn: true,
                    friend_btn_color: "#00b894",
                    show_block_btn: true,
                    block_btn_color: "#d63031",
                    blacklist_enabled: true,
                    blacklist_mode: "fold", // fold | official | mark
                    friends_enabled: true,
                    friends_highlight: "#ff9800"
                }
            },
            meta: {
                relation: {
                    label: "社交关系设置",
                    group: "🤝 社交关系",
                    fields: {
                        show_friend_btn: { type: "SWITCH", label: "显示添加好友按钮" },
                        friend_btn_color: { type: "COLOR", label: "好友按钮颜色" },
                        show_block_btn: { type: "SWITCH", label: "显示屏蔽用户按钮" },
                        block_btn_color: { type: "COLOR", label: "屏蔽按钮颜色" },
                        blacklist_enabled: { type: "SWITCH", label: "开启高级黑名单" },
                        blacklist_mode: { type: "SELECT", label: "黑名单显示模式", options: { fold: "优雅折叠", official: "官方屏蔽", mark: "标记模式" } },
                        friends_enabled: { type: "SWITCH", label: "开启本地好友高亮" },
                        friends_highlight: { type: "COLOR", label: "好友高亮色" }
                    }
                }
            },
            match: ctx => ctx.store.get("relation.blacklist_enabled", true) || ctx.store.get("relation.friends_enabled", true),
            init(ctx) {
                const blacklistKey = 'nsx_advanced_blacklist';
                const friendsKey = 'nsx_advanced_friends';
                const keywordsKey = 'nsx_advanced_keywords';
                const BLACKLIST_MODE_LABELS = { fold: "优雅折叠", official: "官方屏蔽", mark: "标记模式", hide: "官方屏蔽" };

                const getMap = (key) => {
                    try { return JSON.parse(localStorage.getItem(key) || '{}'); }
                    catch { return {}; }
                };
                const saveMap = (key, map) => localStorage.setItem(key, JSON.stringify(map));
                const normalizeBlacklistMode = (mode, fallback = "fold") => {
                    const val = mode === "hide" ? "official" : mode;
                    return ["fold", "official", "mark"].includes(val) ? val : fallback;
                };

                const state = {
                    blacklist: getMap(blacklistKey),
                    friends: getMap(friendsKey),
                    keywords: getMap(keywordsKey),
                    cfg: {
                        blEnabled: ctx.store.get("relation.blacklist_enabled", true),
                        blMode: ctx.store.get("relation.blacklist_mode", "fold"),
                        frEnabled: ctx.store.get("relation.friends_enabled", true),
                        frColor: ctx.store.get("relation.friends_highlight", "#ff9800"),
                        friendBtnColor: ctx.store.get("relation.friend_btn_color", "#00b894"),
                        blockBtnColor: ctx.store.get("relation.block_btn_color", "#d63031")
                    }
                };
                const getUserBlacklistMode = (info) => normalizeBlacklistMode(info?.mode, state.cfg.blMode);
                const getBlacklistModeLabel = (mode) => BLACKLIST_MODE_LABELS[normalizeBlacklistMode(mode)] || BLACKLIST_MODE_LABELS.fold;

                let processAll = () => { };
                let processList = () => { };

                // 添加全局样式
                addStyle("nsx-user-relation", `
                /* 屏蔽与好友按钮 */
                .nsx-relation-btn {
                    font-size: 10px; padding: 2px 8px; border-radius: 5px; border: 1px solid currentColor;
                    background: transparent; color: currentColor !important; cursor: pointer; margin-left: 4px; opacity: 0.9;
                    transition: all 0.2s; user-select: none; display: inline-block; line-height: 1.6;
                    font-weight: 600; text-shadow: none; box-shadow: none;
                }
                .nsx-relation-btn:hover { opacity: 1; transform: translateY(-1px); }
                .nsx-relation-btn:active { transform: translateY(0); }
                .nsx-btn-block { color: ${state.cfg.blockBtnColor}; border-color: ${state.cfg.blockBtnColor}; background: ${state.cfg.blockBtnColor}12; }
                .nsx-btn-friend { color: ${state.cfg.friendBtnColor}; border-color: ${state.cfg.friendBtnColor}; background: ${state.cfg.friendBtnColor}12; }
                .nsx-mobile .nsx-relation-btn-wrap { gap: 3px !important; margin-left: 4px !important; }
                .nsx-mobile .nsx-relation-btn {
                    min-width: 18px; height: 18px; padding: 0 4px; font-size: 11px; line-height: 18px;
                    display: inline-flex; align-items: center; justify-content: center;
                }

                /* 折叠模式 */
                .nsx-post-folded > *:not(.nsx-fold-notice) { display: none !important; }
                .nsx-post-folded { background-color: rgba(244, 67, 54, 0.05) !important; padding: 0 !important; }
                .nsx-fold-notice {
                    font-size: 12px; color: #f44336; padding: 10px; opacity: 0.8;
                    display: flex; justify-content: space-between; align-items: center;
                }
                .nsx-unfold-btn { cursor: pointer; text-decoration: underline; }

                /* 彻底隐藏模式 */
                .nsx-post-hidden { display: none !important; }

                /* 好友高亮 */
                .nsx-friend-badge {
                    font-size: 11px; padding: 1px 5px; border-radius: 4px; margin-left: 4px;
                    background-color: ${state.cfg.frColor}22; border: 1px solid ${state.cfg.frColor};
                    color: ${state.cfg.frColor}; font-weight: bold; cursor: help;
                }
                .nsx-blacklist-badge {
                    font-size: 11px; padding: 1px 5px; border-radius: 4px; margin-left: 4px;
                    background-color: rgba(244, 67, 54, 0.12); border: 1px solid #f44336;
                    color: #f44336; font-weight: bold; cursor: help;
                }
            `);

                // 帖子页处理逻辑
                if (ctx.isPost) {
                    const processPostItem = (authorLink) => {
                        const postEl = authorLink.closest('.nsk-post, .comments > li, li.comment-item, .comment-item, li');
                        if (!postEl) return;
                        if (postEl.dataset.nsxRelationProcessed) return;

                        const username = authorLink.textContent.trim();
                        if (!username) return;

                        postEl.dataset.nsxRelationProcessed = "1";

                        // --- 黑名单逻辑 ---
                        if (state.cfg.blEnabled && state.blacklist[username]) {
                            const blInfo = state.blacklist[username];
                            const effectiveBlMode = getUserBlacklistMode(blInfo);
                            if (effectiveBlMode === 'official') {
                                postEl.classList.add('nsx-post-hidden');
                            } else if (effectiveBlMode === 'mark') {
                                const blBadge = document.createElement('span');
                                blBadge.className = 'nsx-blacklist-badge';
                                blBadge.title = `黑名单模式: ${getBlacklistModeLabel(effectiveBlMode)}\n黑名单备注: ${blInfo.remark || '无'}\n添加时间: ${blInfo.time || '未知'}`;
                                blBadge.innerHTML = '黑名单';
                                authorLink.after(blBadge);
                            } else {
                                // Fold mode
                                postEl.classList.add('nsx-post-folded');
                                const notice = document.createElement('div');
                                notice.className = 'nsx-fold-notice';
                                const _esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
                                notice.innerHTML = `
                                <span> 已折叠来自黑名单用户 [<b>${_esc(username)}</b>] 的言论。备注: ${_esc(blInfo.remark || '无')}</span>
                                <span class="nsx-unfold-btn">临时展开</span>
                            `;
                                notice.querySelector('.nsx-unfold-btn').onclick = (e) => {
                                    postEl.classList.remove('nsx-post-folded');
                                    notice.style.display = 'none';
                                };
                                postEl.prepend(notice);
                            }
                        }

                        // --- 好友逻辑 ---
                        if (state.cfg.frEnabled && state.friends[username]) {
                            const frInfo = state.friends[username];
                            const frBadge = document.createElement('span');
                            frBadge.className = 'nsx-friend-badge';
                            frBadge.title = `好友备注: ${frInfo.remark || '无'}\n添加时间: ${frInfo.time}`;
                            frBadge.innerHTML = '好友';
                            authorLink.after(frBadge);
                        }

                    };

                    processAll = () => ctx.$$('.nsk-content-meta-info .author-info > a[href^="/space/"]').forEach(processPostItem);
                    processAll();
                    ctx.watch('.nsk-content-meta-info', processAll, { debounce: 200 });
                }

                // 列表页处理逻辑 (讨论列表)
                if (ctx.isList || location.pathname === '/' || location.pathname.startsWith('/categories') || location.pathname.startsWith('/board')) {
                    const processListItem = (itemEl) => {
                        if (itemEl.dataset.nsxRelationListProcessed) return;
                        itemEl.dataset.nsxRelationListProcessed = "1";

                        const authorEl = itemEl.querySelector('.info-author, .post-author');
                        if (!authorEl) return;
                        const username = authorEl.textContent.trim();

                        if (state.cfg.blEnabled && state.blacklist[username]) {
                            const blInfo = state.blacklist[username];
                            const effectiveBlMode = getUserBlacklistMode(blInfo);
                            if (effectiveBlMode === 'official') {
                                itemEl.style.display = 'none';
                            } else if (effectiveBlMode === 'mark') {
                                authorEl.style.color = '#f44336';
                                authorEl.style.fontWeight = 'bold';
                                const badge = document.createElement('span');
                                badge.className = 'nsx-blacklist-badge';
                                badge.style.cssText = 'font-size:10px;padding:1px 4px;border-radius:3px;margin-left:4px;background-color:rgba(244,67,54,0.12);border:1px solid #f44336;color:#f44336;vertical-align:middle;line-height:1;font-weight:normal;';
                                badge.title = `黑名单模式: ${getBlacklistModeLabel(effectiveBlMode)}\n黑名单备注: ${blInfo.remark || '无'}`;
                                badge.textContent = '黑名单';
                                authorEl.after(badge);
                            } else {
                                itemEl.classList.add('nsx-post-folded');
                                const notice = document.createElement('div');
                                notice.className = 'nsx-fold-notice';
                                notice.style.padding = '12px 15px';
                                const _esc2 = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
                                notice.innerHTML = `
                                <span> 已折叠来自黑名单用户 [<b>${_esc2(username)}</b>] 的主题。备注: ${_esc2(blInfo.remark || '无')}</span>
                                <span class="nsx-unfold-btn">临时展开</span>
                            `;
                                notice.querySelector('.nsx-unfold-btn').onclick = (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    itemEl.classList.remove('nsx-post-folded');
                                    notice.style.display = 'none';
                                };
                                itemEl.prepend(notice);
                            }
                        }
                        if (state.cfg.frEnabled && state.friends[username]) {
                            const frInfo = state.friends[username];
                            authorEl.style.color = state.cfg.frColor;
                            authorEl.style.fontWeight = 'bold';
                            const badge = document.createElement('span');
                            badge.className = 'nsx-friend-badge';
                            badge.style.cssText = `font-size:10px;padding:1px 4px;border-radius:3px;margin-left:4px;background-color:${state.cfg.frColor}22;border:1px solid ${state.cfg.frColor};color:${state.cfg.frColor};vertical-align:middle;line-height:1;font-weight:normal;`;
                            badge.title = `好友备注: ${frInfo.remark || '无'}`;
                            badge.textContent = '好友';
                            authorEl.after(badge);
                        }
                    };

                    processList = () => ctx.$$('.post-list-item, .post-list .list-item').forEach(processListItem);
                    processList();
                    ctx.watch('.post-list, .post-list-item', processList, { debounce: 200 });
                }

                // === 构建社交关系管理大面板 (仿历史记录风格) ===
                const panelCss = `.nsx-rel-header{display:flex;align-items:center;justify-content:space-between;padding:12px 12px 6px}.nsx-rel-title{font-size:15px;font-weight:600}.nsx-rel-action{border:0;background:0;color:#666;cursor:pointer;font-size:12px;padding:4px 8px;border-radius:6px}.nsx-rel-action:hover{background:#f2f3f5}.nsx-rel-search{display:flex;align-items:center;gap:6px;margin:0 12px 8px;border:1px solid #e1e1e1;border-radius:8px;padding:6px 8px}.nsx-rel-search input{border:0;background:0;outline:0;width:100%;font-size:13px}.nsx-rel-tabs{display:flex;gap:16px;padding:0 12px 6px;border-bottom:1px solid #f0f0f0}.nsx-rel-tab{border:0;background:0;cursor:pointer;color:#6b6b6b;font-size:12px;padding:6px 0;font-weight:600;border-bottom:2px solid transparent}.nsx-rel-tab.is-active{color:#0a62ff;border-bottom-color:#0a62ff}.nsx-rel-list{flex:1;overflow-y:auto;padding:6px 8px 12px}.nsx-rel-item{display:flex;align-items:center;gap:8px;padding:8px 6px;border-radius:8px}.nsx-rel-item:hover{background:#f5f7fb}.nsx-rel-link{display:flex;align-items:center;gap:10px;flex:1;min-width:0;text-decoration:none;color:inherit}.nsx-rel-icon{width:36px;height:36px;border-radius:50%;background:#f0f0f0;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;color:#999;font-weight:bold;font-size:18px}.nsx-rel-info{display:flex;flex-direction:column;gap:2px;overflow:hidden;flex:1;}.nsx-rel-item-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:bold;font-size:14px;}.nsx-rel-remark{color:#888;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.nsx-rel-time{color:#aaa;font-size:11px;}.nsx-rel-empty{padding:20px 6px;color:#999;font-size:13px;text-align:center;}.nsx-rel-close{border:0;background:0;cursor:pointer;font-size:12px;padding:4px 8px;border-radius:6px;color:#999;display:none}.nsx-rel-item:hover .nsx-rel-close{display:block}.nsx-rel-close:hover{color:#f44336;background:#fee}.dark-layout .nsx-rel-action{color:#999}.dark-layout .nsx-rel-action:hover{background:#2a2a2a}.dark-layout .nsx-rel-search{border-color:#3a3a3a}.dark-layout .nsx-rel-search input{color:#e0e0e0}.dark-layout .nsx-rel-tabs{border-bottom-color:#3a3a3a}.dark-layout .nsx-rel-tab{color:#999}.dark-layout .nsx-rel-item:hover{background:#2a2a2a}.dark-layout .nsx-rel-icon{background:#3a3a3a}`;
                addStyle("nsx-rel-panel-style", panelCss);

                let relPanel = null, relTrigger = null, pState = { open: false, tab: "bl", kw: "" };

                // 寻找吸顶栏作为挂靠点
                const head = ctx.$("#nsk-head");
                if (head) {
                    const grp = ensureIconGroup();
                    if (!grp) return;
                    relTrigger = document.createElement("div");
                    relTrigger.className = "relation-dropdown-on";
                    relTrigger.style.cssText = "";
                    relTrigger.title = "关系管理(黑名单/好友)";
                    relTrigger.innerHTML = `<svg viewBox="0 0 48 48" fill="none" class="iconpark-icon" style="width:17px;height:17px;color:currentColor;"><path d="M24 20C28.4183 20 32 16.4183 32 12C32 7.58172 28.4183 4 24 4C19.5817 4 16 7.58172 16 12C16 16.4183 19.5817 20 24 20Z" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M42 44C42 34.0589 33.9411 26 24 26C14.0589 26 6 34.0589 6 44" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
                    grp.appendChild(relTrigger);

                    const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

                    const openRel = () => {
                        if (!relPanel) {
                            relPanel = document.createElement("div");
                            relPanel.id = "nsx-rel-panel";
                            relPanel.innerHTML = `<div class="nsx-rel-header"><div class="nsx-rel-title">社交关系名单</div><button class="nsx-rel-action" data-a="clear">清空列表</button></div><div class="nsx-rel-search">🔍<input placeholder="搜索用户名或备注..."/></div><div class="nsx-rel-tabs"><button class="nsx-rel-tab is-active" data-t="bl">🚫 屏蔽黑名单</button><button class="nsx-rel-tab" data-t="fr">🌟 本地好友</button></div><div class="nsx-rel-list"></div>`;
                            document.body.appendChild(relPanel);

                            relPanel.querySelector("input").oninput = e => { pState.kw = e.target.value.toLowerCase(); renderRel(); };
                            relPanel.onclick = e => {
                                e.stopPropagation();
                                const modeBtn = e.target.closest("[data-a='edit-mode']");
                                if (modeBtn) {
                                    e.preventDefault();
                                    const un = modeBtn.dataset.un;
                                    const item = state.blacklist[un];
                                    if (!un || !item) return;
                                    const currentMode = getUserBlacklistMode(item);
                                    const html = `
                                        <div class="layui-form" style="padding:20px 20px 0;">
                                            <div class="layui-form-item">
                                                <label class="layui-form-label" style="width:72px;padding-left:0;">模式</label>
                                                <div class="layui-input-block" style="margin-left:92px;">
                                                    <select id="nsx-rel-blacklist-mode">
                                                        <option value="fold" ${currentMode === 'fold' ? 'selected' : ''}>优雅折叠</option>
                                                        <option value="official" ${currentMode === 'official' ? 'selected' : ''}>官方屏蔽</option>
                                                        <option value="mark" ${currentMode === 'mark' ? 'selected' : ''}>标记模式</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </div>`;
                                    ctx.ui.layer.open({
                                        title: `设置 ${un} 的屏蔽模式`,
                                        content: html,
                                        area: ['min(420px,94vw)', 'auto'],
                                        skin: 'nsx-mode-layer',
                                        btn: ['保存', '取消'],
                                        success: () => {
                                            layui.use(['form'], function () {
                                                layui.form.render('select');
                                            });
                                        },
                                        yes: async (idx, l) => {
                                            const nextMode = normalizeBlacklistMode(l.find('#nsx-rel-blacklist-mode').val(), currentMode);
                                            item.mode = nextMode;
                                            saveMap(blacklistKey, state.blacklist);
                                            if (nextMode === 'official') {
                                                try {
                                                    const r = await ctx.net.post("/api/block-list/add", { block_member_name: un });
                                                    if (!r?.success) ctx.ui.alert("同步失败", r?.message || "官方接口调用失败，仅保存本地模式");
                                                } catch (err) {
                                                    env.error("Sync Official Block Failed", err);
                                                }
                                            }
                                            ctx.ui.layer.close(idx);
                                            renderRel();
                                            ctx.ui.toast("黑名单模式已更新，刷新贴子生效");
                                        }
                                    });
                                    return;
                                }
                                if (e.target.closest('.nsx-rel-remark')) {
                                    if (e.target.tagName !== 'INPUT') e.preventDefault();
                                    return;
                                }
                                const t = e.target.closest("[data-t]");
                                if (t) { pState.tab = t.dataset.t; renderRel(); return; }
                                const a = e.target.closest("[data-a]");
                                if (!a) return;
                                const act = a.dataset.a, un = a.dataset.un;
                                if (act === "clear") {
                                    const names = { bl: "黑名单", fr: "好友" };
                                    ctx.ui.confirm("确认清空?", `确定要清空所有${names[pState.tab]}吗？`, () => {
                                        if (pState.tab === 'bl') state.blacklist = {}; else state.friends = {};
                                        saveMap(pState.tab === 'bl' ? blacklistKey : friendsKey, pState.tab === 'bl' ? state.blacklist : state.friends);
                                        renderRel();
                                        ctx.ui.toast("已清空");
                                    });
                                }
                                if (act === "del") {
                                    if (pState.tab === 'bl') {
                                        const targetUserId = state.blacklist[un]?.userId;
                                        delete state.blacklist[un];
                                        if (targetUserId) {
                                            fetch('/api/block-list/del', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ block_member_id: Number(targetUserId) }) }).catch(() => { });
                                        }
                                    } else {
                                        delete state.friends[un];
                                    }
                                    saveMap(pState.tab === 'bl' ? blacklistKey : friendsKey, pState.tab === 'bl' ? state.blacklist : state.friends);
                                    renderRel();
                                    ctx.ui.toast("已移除");
                                }
                            };
                            relPanel.ondblclick = e => {
                                const remarkSpan = e.target.closest('.nsx-rel-remark');
                                if (remarkSpan) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const un = remarkSpan.dataset.un;
                                    if (!un) return;
                                    let mapObj = pState.tab === "bl" ? state.blacklist : state.friends;
                                    const currentRemark = mapObj[un]?.remark || "";

                                    const input = document.createElement('input');
                                    input.type = 'text';
                                    input.value = currentRemark;
                                    input.style.cssText = "width:100%;font-size:12px;border:1px solid #0a62ff;border-radius:4px;padding:2px 4px;outline:none;background:#fff;color:#333;";

                                    input.onkeydown = (ke) => {
                                        if (ke.key === 'Enter') input.blur();
                                        if (ke.key === 'Escape') { input.value = currentRemark; input.blur(); }
                                    };
                                    input.onblur = () => {
                                        const newRemark = input.value.trim();
                                        if (mapObj[un]) {
                                            mapObj[un].remark = newRemark;
                                            saveMap(pState.tab === "bl" ? blacklistKey : friendsKey, mapObj);
                                        }
                                        renderRel();
                                        if (newRemark !== currentRemark) ctx.ui.toast("备注已更新，刷新贴子生效");
                                    };

                                    remarkSpan.innerHTML = '';
                                    remarkSpan.appendChild(input);
                                    input.focus();
                                    // 光标移到最后
                                    input.setSelectionRange(input.value.length, input.value.length);
                                }
                            };
                            document.addEventListener("click", e => {
                                const inLayer = !!e.target.closest('.layui-layer,.layui-layer-page,.layui-layer-dialog,.layui-layer-content,.layui-layer-btn,.layui-layer-shade,.layui-colorpicker,.layui-form-select');
                                if (inLayer) return;
                                const hasTopLayer = !!document.querySelector('.layui-layer[style*="z-index"]');
                                if (hasTopLayer) return;
                                if (pState.open && !relPanel.contains(e.target) && !relTrigger.contains(e.target)) closeRel();
                            });
                            document.addEventListener("keydown", e => { if (pState.open && e.key === "Escape") closeRel(); });
                        }
                        const r = relTrigger.getBoundingClientRect();
                        relPanel.style.top = `${r.bottom + 8}px`;
                        relPanel.style.height = `${innerHeight - r.bottom - 16}px`;
                        relPanel.style.right = ``;
                        renderRel();
                        relPanel.classList.add("show");
                        pState.open = true;
                    };

                    const closeRel = () => { relPanel?.classList.remove("show"); pState.open = false; };
                    window.__nsxPanelCtrl ||= {};
                    window.__nsxPanelCtrl.relation = { close: closeRel, isOpen: () => pState.open };
                    const toggleRel = () => pState.open ? closeRel() : openRel();

                    const renderRel = () => {
                        let mapObj = pState.tab === "bl" ? state.blacklist : state.friends;
                        let list = Object.entries(mapObj).map(([un, info]) => ({ username: un, remark: info.remark || "", time: info.time || "", userId: info.userId || "", mode: info.mode || "" }));

                        if (pState.kw) list = list.filter(i => i.username.toLowerCase().includes(pState.kw) || i.remark.toLowerCase().includes(pState.kw));
                        list.sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));

                        relPanel.querySelectorAll(".nsx-rel-tab").forEach(b => b.classList.toggle("is-active", b.dataset.t === pState.tab));

                        const lEl = relPanel.querySelector(".nsx-rel-list");
                        if (!list.length) { lEl.innerHTML = `<div class="nsx-rel-empty">该列表空空如也</div>`; return; }

                        lEl.innerHTML = list.map(i => {
                            const url = i.userId ? `/space/${i.userId}#/general` : `/space/${encodeURIComponent(i.username)}`;
                            const avatarLetter = i.username.charAt(0).toUpperCase();
                            const iconColor = pState.tab === "bl" ? "#f44336" : "#4caf50";

                            const avatarImgHtml = i.userId
                                ? `<img src="/avatar/${i.userId}.png" style="width:100%;height:100%;object-fit:cover;" onerror="this.onerror=null;this.style.display='none';this.nextElementSibling.style.display='inline';">`
                                : "";
                            const letterHtml = `<span style="${i.userId ? 'display:none;' : 'display:inline;'}">${avatarLetter}</span>`;

                            return `<div class="nsx-rel-item">
                                <a class="nsx-rel-link" href="${url}" target="_blank">
                                    <span class="nsx-rel-icon" style="color:white;background:${iconColor};opacity:0.8">${avatarImgHtml}${letterHtml}</span>
                                    <div class="nsx-rel-info">
                                        <span class="nsx-rel-item-title">${esc(i.username)}</span>
                                        <span class="nsx-rel-remark" data-un="${esc(i.username)}" title="双击可直接修改备注">${esc(i.remark ? '备注: ' + i.remark : '无备注 (双击添加)')}</span>
                                        ${pState.tab === "bl" ? `<span class="nsx-rel-remark"><button class="nsx-rel-action" data-a="edit-mode" data-un="${esc(i.username)}" style="padding:0 6px;font-size:11px;">模式: ${esc(getBlacklistModeLabel(i.mode || state.cfg.blMode))}</button></span>` : ``}
                                    </div>
                                </a>
                                <span class="nsx-rel-time">${i.time ? i.time.split(' ')[0] : ''}</span>
                                <button class="nsx-rel-close" data-a="del" data-un="${esc(i.username)}" title="移出列表">移除</button>
                            </div>`;
                        }).join("");
                    };

                    relTrigger.onclick = e => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!pState.open) {
                            window.__nsxPanelCtrl.filter?.close?.();
                            window.__nsxPanelCtrl.history?.close?.();
                        }
                        toggleRel();
                    };
                }

                window.__nsxRuntime ||= {};
                window.__nsxRuntime.reapplyRelation = () => {
                    state.blacklist = getMap(blacklistKey);
                    state.friends = getMap(friendsKey);
                    state.cfg.blEnabled = ctx.store.get("relation.blacklist_enabled", true);
                    state.cfg.blMode = ctx.store.get("relation.blacklist_mode", "fold");
                    state.cfg.frEnabled = ctx.store.get("relation.friends_enabled", true);
                    state.cfg.frColor = ctx.store.get("relation.friends_highlight", "#ff9800");
                    state.cfg.friendBtnColor = ctx.store.get("relation.friend_btn_color", "#00b894");
                    state.cfg.blockBtnColor = ctx.store.get("relation.block_btn_color", "#d63031");

                    ctx.$$(".nsx-relation-btn-wrap,.nsx-friend-badge,.nsx-blacklist-badge,.nsx-fold-notice").forEach(el => el.remove());
                    ctx.$$(".nsx-post-folded,.nsx-post-hidden").forEach(el => {
                        el.classList.remove("nsx-post-folded", "nsx-post-hidden");
                        el.style.display = "";
                    });
                    ctx.$$(".nsk-content-meta-info .author-info > a[href^='/space/'], .post-list-item .info-author, .post-list-item .post-author").forEach(el => {
                        el.style.color = "";
                        el.style.fontWeight = "";
                    });
                    ctx.$$('[data-nsx-relation-processed],[data-nsx-relation-list-processed]').forEach(el => {
                        delete el.dataset.nsxRelationProcessed;
                        delete el.dataset.nsxRelationListProcessed;
                    });

                    processAll();
                    processList();
                    if (typeof renderRel === "function" && pState.open) renderRel();
                };
            }
        };
        define(userRelation);
        // 🚫 过滤设置 (放在最后)
        define(blockPosts);
        define(blockViewLevel);

        // Responsive author controls: preserve native nodes and restore their positions on wide screens.
        if (ctx.isPost) {
            addStyle('nsx-responsive-author-actions', `
                .nsk-content-meta-info.nsx-compact-meta{display:flex!important;flex-wrap:wrap!important;align-items:flex-start!important;gap:4px 8px!important;min-width:0!important}
                .nsx-compact-meta>.author-info{flex:1 1 calc(100% - 56px)!important;min-width:0!important;max-width:100%!important;padding-right:0!important;margin-right:0!important}
                .nsx-compact-meta .author-info>a{overflow-wrap:anywhere}
                .nsx-compact-meta .nsx-detail-user-info{max-width:100%;margin-left:4px!important}
                .nsx-meta-footer{display:flex;align-items:center;justify-content:flex-start;flex-wrap:wrap;gap:4px;flex:0 0 100%;width:100%;box-sizing:border-box;padding:0;min-width:0}
                .nsx-meta-footer .nsx-relation-btn-wrap{display:inline-flex!important;flex-wrap:wrap!important;gap:4px!important;margin:0!important}
                .nsx-compact-meta .nsx-private-message .nsx-pm-label,.nsx-compact-meta .nsx-floor-quick>span{display:none!important}
                .nsx-meta-footer .nsx-relation-btn,.nsx-meta-footer .nsx-private-message,.nsx-meta-footer .nsx-floor-quick{display:inline-flex!important;align-items:center;justify-content:center;box-sizing:border-box!important;width:var(--nsx-mobile-action-width,28px)!important;min-width:var(--nsx-mobile-action-width,28px)!important;max-width:var(--nsx-mobile-action-width,28px)!important;height:20px!important;padding:0!important;margin:0!important;gap:0!important;flex:0 0 var(--nsx-mobile-action-width,28px)!important;font-size:11px!important;line-height:18px!important;vertical-align:middle}
                .nsx-meta-footer .nsx-floor-quick>svg{display:block;flex-shrink:0}
            `);
            const layouts = new Map();
            let scheduled = false;
            const schedule = () => { if (!scheduled) { scheduled=true; requestAnimationFrame(() => { scheduled=false; layout(); }); } };
            const resize = typeof ResizeObserver==='function' ? new ResizeObserver(schedule) : null;
            const restore = (meta,state) => {
                const remaining = [];
                for (const item of state.moved) {
                    if (item.marker?.parentNode) item.marker.replaceWith(item.node);
                    else if (item.node.isConnected) remaining.push(item.node);
                }
                // A late-created shortcut can originate inside the footer and have no placeholder.
                const native = meta.querySelector('.floor-link-wrapper, .nsx-pm-fallback');
                for (const node of remaining) {
                    const pm = meta.querySelector('.nsx-private-message');
                    if (node.classList.contains('nsx-floor-quick') && pm && !state.footer.contains(pm)) pm.after(node);
                    else (native || meta).append(node);
                }
                state.moved=[]; state.footer?.remove(); state.footer=null;
            };
            const layout = () => {
                for (const [meta,state] of layouts) if (!meta.isConnected) { resize?.unobserve(meta); layouts.delete(meta); }
                document.querySelectorAll('.nsk-content-meta-info').forEach(meta => {
                    let state=layouts.get(meta);
                    if(!state){state={moved:[],footer:null};layouts.set(meta,state);resize?.observe(meta);}
                    const width=meta.getBoundingClientRect().width;
                    if (!width) return;
                    const compact=window.innerWidth<=760 || width<560;
                    if(meta.classList.contains('nsx-compact-meta')!==compact)meta.classList.toggle('nsx-compact-meta',compact);
                    if(!compact){if(state.footer)restore(meta,state);return;}
                    const actions=[...meta.querySelectorAll('.nsx-relation-btn-wrap, .nsx-private-message, .nsx-floor-quick')];
                    if(!actions.length){if(state.footer)restore(meta,state);return;}
                    if(!state.footer){
                        state.footer=document.createElement('div');state.footer.className='nsx-meta-footer';
                        // Match the existing + button width before applying the shared button dimensions.
                        const friend=meta.querySelector('.nsx-btn-friend');
                        const friendWidth=friend?.getBoundingClientRect().width;
                        state.footer.style.setProperty('--nsx-mobile-action-width',`${friendWidth > 0 ? friendWidth : 28}px`);
                        meta.append(state.footer);
                    }
                    for(const node of actions){
                        if(state.moved.some(item=>item.node===node))continue;
                        let marker=null;
                        if(node.parentElement!==state.footer){marker=document.createComment('nsx-original-position');node.before(marker);}
                        state.moved.push({node,marker});
                        if(node.parentElement!==state.footer)state.footer.append(node);
                    }
                    // Keep native timestamps, floor numbers, HOT badges and their containers untouched.

                });
            };
            new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
            window.addEventListener('resize',schedule,{passive:true});schedule();
        }

        boot(ctx);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }

    /* 成就分规则 achievement-v4.1-draft：
     * 数量主方向70分、参与广度20分，两项乘注册时长系数；粉丝5分、当前等级5分。
     * 四个分项分别向下保留一位小数，整数十分位求和；缺辅助资料显示区间，不授予称号。
     * 详细曲线、门槛、缺失处理及限制见 ACHIEVEMENT_SCORE.md；不推断小号、灌水或内容质量。
     */
    // END BASELINE CORE
    }
    // Invoked only by the Userscripts branch; native GM environments skip this function.
    async function createUserscriptsAdapter(nativeGM) {
        if (nativeGM?.info?.scriptHandler !== 'Userscripts') {
            throw new Error('Userscripts 适配器仅能在 Userscripts 环境初始化');
        }
        for (const name of ['getValue', 'setValue', 'deleteValue', 'listValues']) {
            if (typeof nativeGM[name] !== 'function') throw new Error(`Userscripts 缺少 GM.${name}`);
        }
        const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
        const notice = (id, message) => {
            let node = document.getElementById(id);
            if (!node) {
                node = document.createElement('div'); node.id = id; node.setAttribute('role', 'alert');
                node.style.cssText = 'position:fixed;inset:0 0 auto;padding:10px;background:#fff3cd;color:#664d03;z-index:2147483647;font:14px sans-serif';
                document.body.append(node);
            }
            node.textContent = message;
        };
        let config = null;
        const capture = node => {
            if (node?.nodeType !== 1) return;
            const candidates = node.id === 'temp-script' ? [node] : node.querySelectorAll('#temp-script');
            for (const candidate of candidates) {
                try {
                    const bytes = Uint8Array.from(atob(candidate.textContent.trim()), char => char.charCodeAt(0));
                    const decoded = JSON.parse(new TextDecoder().decode(bytes));
                    if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) config = decoded;
                } catch { /* A streaming parser may not have inserted the full text yet. */ }
            }
        };
        capture(document.documentElement);
        const observer = new MutationObserver(records => {
            for (const record of records) {
                capture(record.target.nodeType === 1 ? record.target : record.target.parentElement);
                for (const node of [...record.addedNodes, ...record.removedNodes]) capture(node);
            }
        });
        observer.observe(document, { subtree: true, childList: true, characterData: true });
        const values = new Map(), revisions = new Map(), dirty = new Set(), failed = new Map(), pending = new Set();
        let writeTail = Promise.resolve(), syncJob = null;
        const sync = async () => {
            const before = new Map(revisions);
            const keys = await nativeGM.listValues();
            if (!Array.isArray(keys) || keys.some(key => typeof key !== 'string')) throw new Error('Userscripts 存储键格式异常');
            const known = new Set(keys);
            const unchanged = key => !dirty.has(key) && (revisions.get(key) || 0) === (before.get(key) || 0);
            for (let offset = 0; offset < keys.length; offset += 16) {
                await Promise.all(keys.slice(offset, offset + 16).map(async key => {
                    const value = await nativeGM.getValue(key);
                    if (unchanged(key)) values.set(key, clone(value));
                }));
            }
            for (const key of values.keys()) if (!known.has(key) && unchanged(key)) values.delete(key);
        };
        // Observe configuration before the first asynchronous extension round trip.
        try {
            await sync();
            if (document.readyState === 'loading') await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
            if (!config) {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), 10000);
                try {
                    const response = await window.fetch(location.href.split('#')[0], { credentials: 'same-origin', signal: controller.signal });
                    if (!response.ok) throw new Error(`读取论坛配置失败：HTTP ${response.status}`);
                    const html = await response.text();
                    capture(new DOMParser().parseFromString(html, 'text/html').documentElement);
                } finally { clearTimeout(timer); }
            }
            if (!config) throw new Error('未找到论坛初始化配置，请确认页面加载正常后刷新');
        } finally { observer.disconnect(); }
        const write = (key, operation) => {
            const version = (revisions.get(key) || 0) + 1;
            revisions.set(key, version); dirty.add(key);
            const task = writeTail.then(operation);
            pending.add(task);
            // Keep later writes ordered even when an earlier operation fails.
            writeTail = task.catch(() => {});
            task.then(() => {
                if (revisions.get(key) === version) { dirty.delete(key); failed.delete(key); }
            }, error => {
                if (revisions.get(key) === version) failed.set(key, error);
                console.error('[NSX iOS] storage write failed', error);
                notice('nsx-ios-storage-error', 'NSX：设置未能保存，请检查 Userscripts。为避免丢失修改，本次不会自动刷新。');
            }).finally(() => pending.delete(task));
            return task;
        };
        const flush = async () => {
            while (pending.size) await Promise.all([...pending]);
            if (failed.size) throw new Error('Userscripts 中仍有未保存的修改');
        };
        const refresh = () => {
            if (!syncJob) syncJob = sync().catch(error => {
                console.error('[NSX iOS] storage refresh failed', error);
                notice('nsx-ios-storage-error', 'NSX：读取更新设置失败，暂时保留本页已有数据。');
            }).finally(() => { syncJob = null; });
            return syncJob;
        };
        window.addEventListener('focus', refresh);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
        const commands = new Map();
        let nextId = 0, button, panel;
        const closeMenu = () => { panel.hidden = true; button.setAttribute('aria-expanded', 'false'); };
        const renderMenu = () => {
            panel.replaceChildren();
            for (const command of commands.values()) {
                const item = document.createElement('button'); item.type = 'button'; item.textContent = command.label;
                item.setAttribute('role', 'menuitem');
                item.style.cssText = 'display:block;width:100%;min-height:44px;padding:10px 14px;border:0;background:transparent;color:inherit;text-align:left;font:inherit';
                item.onclick = () => {
                    if (command.options?.autoClose !== false) closeMenu();
                    Promise.resolve().then(command.callback).catch(error => {
                        console.error('[NSX iOS] menu failed', error);
                        notice('nsx-ios-menu-error', 'NSX：操作未完成，请检查扩展状态后重试。');
                    });
                };
                panel.append(item);
            }
        };
        const ensureMenu = () => {
            if (button) return;
            button = document.createElement('button'); button.id = 'nsx-ios-menu'; button.type = 'button'; button.textContent = 'NSP+';
            button.setAttribute('aria-label', 'NodeSeek Pro Max 设置'); button.setAttribute('aria-expanded', 'false');
            button.setAttribute('aria-controls', 'nsx-ios-menu-panel');
            button.style.cssText = 'position:fixed;left:10px;bottom:calc(10px + env(safe-area-inset-bottom));z-index:2147483645;min-width:44px;min-height:44px;border:1px solid #9ca3af;border-radius:8px;background:var(--bg-main-color,#fff);color:var(--link-color,#333)';
            panel = document.createElement('div'); panel.id = 'nsx-ios-menu-panel'; panel.hidden = true; panel.setAttribute('role', 'menu');
            panel.style.cssText = 'position:fixed;left:10px;bottom:calc(60px + env(safe-area-inset-bottom));z-index:2147483646;max-height:65vh;max-width:calc(100vw - 20px);overflow:auto;border:1px solid #9ca3af;border-radius:8px;background:var(--bg-main-color,#fff);color:var(--link-color,#333);font:14px sans-serif';
            button.onclick = () => {
                renderMenu(); panel.hidden = !panel.hidden; button.setAttribute('aria-expanded', String(!panel.hidden));
            };
            document.body.append(panel, button);
            document.addEventListener('click', event => { if (!panel.contains(event.target) && !button.contains(event.target)) closeMenu(); });
            document.addEventListener('keydown', event => { if (event.key === 'Escape' && !panel.hidden) { closeMenu(); button.focus(); } });
        };
        const resources = {
            highlightStyle: 'https://s4.zstatic.net/ajax/libs/highlight.js/11.9.0/styles/atom-one-light.min.css',
            highlightStyle_dark: 'https://s4.zstatic.net/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css'
        };
        return {
            info: nativeGM.info,
            page: { __config__: config, indexedDB: window.indexedDB },
            getValue: (key, fallback) => values.has(key) ? clone(values.get(key)) : clone(fallback),
            setValue: (key, value) => { const copy = clone(value); values.set(key, copy); return write(key, () => nativeGM.setValue(key, copy)); },
            deleteValue: key => { values.delete(key); return write(key, () => nativeGM.deleteValue(key)); },
            listValues: () => [...values.keys()],
            resourceURL: name => resources[name] || '',
            registerMenu: (label, callback, options) => { const id = ++nextId; commands.set(id, { label, callback, options }); ensureMenu(); return id; },
            unregisterMenu: id => { commands.delete(id); },
            openInTab: (url, options = {}) => nativeGM.openInTab(url, options.active === false),
            request: details => {
                const request = nativeGM.xmlHttpRequest(details);
                Promise.resolve(request).catch(() => {}); // Original modules use the native callbacks.
                return { abort: () => request.abort?.() };
            },
            refresh, flush,
            reload: async () => {
                try { await flush(); location.reload(); }
                catch { notice('nsx-ios-storage-error', 'NSX：修改尚未保存，已取消自动刷新。请检查 Userscripts。'); }
            }
        };
    }

    // Userscripts always provides GM_info as well as GM.info. Prefer the legacy
    // descriptor, when present, so other managers keep their existing GM path.
    const managerInfo = typeof GM_info === 'object' && GM_info ? GM_info :
        (typeof GM === 'object' && GM ? GM.info : undefined);
    if (managerInfo?.scriptHandler !== 'Userscripts') {
        runNodeseekPro({
            GM_info: typeof GM_info === 'object' ? GM_info : undefined,
            GM_getValue: typeof GM_getValue === 'function' ? GM_getValue : undefined,
            GM_setValue: typeof GM_setValue === 'function' ? GM_setValue : undefined,
            GM_listValues: typeof GM_listValues === 'function' ? GM_listValues : undefined,
            GM_deleteValue: typeof GM_deleteValue === 'function' ? GM_deleteValue : undefined,
            GM_registerMenuCommand: typeof GM_registerMenuCommand === 'function' ? GM_registerMenuCommand : undefined,
            GM_unregisterMenuCommand: typeof GM_unregisterMenuCommand === 'function' ? GM_unregisterMenuCommand : undefined,
            GM_getResourceURL: typeof GM_getResourceURL === 'function' ? GM_getResourceURL : undefined,
            GM_openInTab: typeof GM_openInTab === 'function' ? GM_openInTab : undefined,
            GM_xmlhttpRequest: typeof GM_xmlhttpRequest === 'function' ? GM_xmlhttpRequest : undefined,
            unsafeWindow: typeof unsafeWindow !== 'undefined' ? unsafeWindow : undefined,
            nsxReloadPage: () => location.reload()
        });
        return;
    }
    // Avoid duplicate Userscripts instances in subframes, without changing how
    // existing managers interpret the original metadata.
    if (window.self !== window.top) return;
    (async () => {
        const adapter = await createUserscriptsAdapter(typeof GM === 'object' ? GM : null);
        runNodeseekPro({
            GM_info: adapter.info,
            GM_getValue: adapter.getValue, GM_setValue: adapter.setValue,
            GM_listValues: adapter.listValues, GM_deleteValue: adapter.deleteValue,
            GM_registerMenuCommand: adapter.registerMenu, GM_unregisterMenuCommand: adapter.unregisterMenu,
            GM_getResourceURL: adapter.resourceURL, GM_openInTab: adapter.openInTab,
            GM_xmlhttpRequest: adapter.request, unsafeWindow: adapter.page,
            nsxReloadPage: adapter.reload
        });
    })().catch(error => {
        console.error('[NSX Userscripts] startup failed', error);
        const show = () => {
            if (document.getElementById('nsx-ios-startup-error')) return;
            const node = document.createElement('div'); node.id = 'nsx-ios-startup-error'; node.setAttribute('role', 'alert');
            node.textContent = 'NSX Userscripts 未能启动：' + error.message;
            node.style.cssText = 'position:fixed;inset:0 0 auto;padding:10px;background:#fff3cd;color:#664d03;z-index:2147483647;font:14px sans-serif';
            document.body.append(node);
        };
        if (document.body) show(); else document.addEventListener('DOMContentLoaded', show, { once: true });
    });
})();
