// ==UserScript==
// @name         NodeSeek Pro Max
// @author       用蚊香买榄菊
// @description  用于增强 NodeSeek/DeepFlood 论坛体验的用户脚本：提供自动签到、下拉加载、快速评论、内容过滤、等级标记、浏览历史、Callout 渲染、图片预览、快捷键等功能，并带可视化设置面板可自由开关配置。
// @namespace    http://www.nodeseek.com/
// @version      1.4.42-cid1
// @icon         https://www.google.com/s2/favicons?sz=64&domain=nodeseek.com
// @match        *://www.nodeseek.com/*
// @match        *://www.deepflood.com/*
// @require      https://s4.zstatic.net/ajax/libs/layui/2.10.3/layui.min.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_listValues
// @grant        GM_deleteValue
// @grant        GM_notification
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_addElement
// @grant        GM_addStyle
// @grant        GM_openInTab
// @grant        GM_xmlhttpRequest
// @connect      greasyfork.org
// @connect      *
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
// Fork: https://github.com/FengBujue0104/nodeseek-scripts (cid 改版：预览按钮配色、回复后停留在当前楼层)
// @homepageURL  https://github.com/FengBujue0104/nodeseek-scripts
// @supportURL   https://github.com/FengBujue0104/nodeseek-scripts/issues
// @downloadURL  https://scripts.fengbujue.com/nodeseek/nodeseek-pro-max.user.js
// @updateURL    https://scripts.fengbujue.com/nodeseek/nodeseek-pro-max.meta.js
// ==/UserScript==
// Based on NodeSeek Pro+; modified and maintained as NodeSeek Pro Max.
// Original project: https://greasyfork.org/scripts/602733

(function () {
    'use strict';
    function runNodeseekPro(apis) {
        const {GM_info, GM_getValue, GM_setValue, GM_listValues, GM_deleteValue, GM_registerMenuCommand, GM_unregisterMenuCommand, GM_openInTab, GM_xmlhttpRequest, unsafeWindow, nsxReloadPage} = apis;

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

    let mobileTools;
    function registerMobileTool(key, label, group, open, close) {
        if (!mobileTools) {
            const tools = new Map();
            const screen = window.matchMedia('(max-width: 640px)');
            const button = document.createElement('button');
            button.type = 'button';
            button.id = 'nsx-mobile-tools-button';
            button.title = '工具';
            button.setAttribute('aria-label', '工具');
            button.setAttribute('aria-expanded', 'false');
            button.setAttribute('aria-controls', 'nsx-mobile-tools');
            button.innerHTML = '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 6h7m4 0h5M4 12h3m4 0h9M4 18h11m4 0h1"/><circle cx="13" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/></svg>';
            const panel = document.createElement('section');
            panel.id = 'nsx-mobile-tools';
            panel.hidden = true;
            panel.setAttribute('aria-label', '工具');
            const tabs = document.createElement('div');
            tabs.className = 'nsx-mobile-tools-tabs';
            tabs.setAttribute('role', 'group');
            tabs.setAttribute('aria-label', '切换工具');
            panel.append(tabs);
            document.body.append(panel);

            let active = null;
            const isMobile = () => screen.matches || document.documentElement.classList.contains('nsx-mobile');
            const position = () => {
                if (panel.hidden) return;
                const top = Math.ceil(button.getBoundingClientRect().bottom) + 8;
                panel.style.top = `${top}px`;
                panel.style.height = `${Math.max(0, (window.visualViewport?.height || innerHeight) - top - 8)}px`;
            };
            const dismiss = () => {
                if (panel.hidden) return;
                tools.get(active)?.close();
                panel.hidden = true;
                button.setAttribute('aria-expanded', 'false');
            };
            const show = key => {
                if (!isMobile()) return;
                for (const [name, tool] of tools) {
                    if (name !== key) tool.close();
                    tool.tab.setAttribute('aria-pressed', String(name === key));
                }
                active = key;
                panel.hidden = false;
                position();
                tools.get(key).open(panel);
                button.setAttribute('aria-expanded', 'true');
            };

            button.addEventListener('click', event => {
                event.stopPropagation();
                if (panel.hidden) show(active || (tools.has('history') ? 'history' : tools.keys().next().value));
                else dismiss();
            });
            panel.addEventListener('click', event => event.stopPropagation());
            document.addEventListener('click', event => {
                if (!panel.hidden && !panel.contains(event.target) && !button.contains(event.target) &&
                    !event.target.closest?.('.layui-layer,.layui-layer-shade,.layui-colorpicker')) dismiss();
            });
            document.addEventListener('keydown', event => {
                if (event.key !== 'Escape' || panel.hidden || document.querySelector('.layui-layer')) return;
                dismiss();
                button.focus();
            });
            const resize = () => {
                if (!isMobile()) dismiss();
                else position();
            };
            window.addEventListener('resize', resize);
            window.visualViewport?.addEventListener('resize', resize);

            addStyle('nsx-mobile-tools-style', `
                #nsx-icon-group>#nsx-mobile-tools-button{display:none;border:0;background:transparent;color:inherit;padding:0;cursor:pointer}
                html.nsx-mobile #nsx-icon-group>#nsx-mobile-tools-button{display:grid!important;place-items:center;min-width:36px;min-height:32px}
                html.nsx-mobile #nsx-icon-group>:is(.filter-dropdown-on,.relation-dropdown-on,.history-dropdown-on){display:none!important}
                @media(max-width:640px){
                    #nsx-icon-group>#nsx-mobile-tools-button{display:grid!important;place-items:center;min-width:36px;min-height:32px}
                    html #nsx-icon-group>:is(.filter-dropdown-on,.relation-dropdown-on,.history-dropdown-on){display:none!important}
                }
                #nsx-mobile-tools{position:fixed;inset-inline:8px;z-index:99999;display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box;background:#fff;border:1px solid #e4e4e4;border-radius:12px;box-shadow:0 12px 28px #0002}
                #nsx-mobile-tools[hidden]{display:none!important}
                :is(.dark-layout,.dark) #nsx-mobile-tools{background:#1e1e1e;color:#e0e0e0;border-color:#3a3a3a}
                .nsx-mobile-tools-tabs{display:grid;grid-template-columns:repeat(auto-fit,minmax(80px,1fr));gap:4px;margin:8px 8px 0;padding:3px;background:#8881;border-radius:9px;flex:none}
                .nsx-mobile-tools-tabs>button{min-height:36px;padding:4px;border:0;border-radius:7px;background:transparent;color:inherit;cursor:pointer;white-space:nowrap;font:inherit;font-size:13px}
                .nsx-mobile-tools-tabs>button[aria-pressed="true"]{background:#1673ce;color:#fff;font-weight:600}
                #nsx-mobile-tools>:is(#nsx-filter-panel,#nsx-rel-panel,#nsx-history-panel){position:static!important;width:auto!important;height:auto!important;flex:1;min-height:0;border:0;border-radius:0;box-shadow:none;background:transparent}
                #nsx-mobile-tools :is(.nsx-rel-title,.nsx-history-title){display:none}
                #nsx-mobile-tools :is(.nsx-rel-header,.nsx-history-header){justify-content:flex-end;padding:6px 12px}
                #nsx-mobile-tools :is(.nsx-rel-list,.nsx-history-list){min-height:0;overflow:auto;overscroll-behavior:contain}
            `);
            mobileTools = { tools, tabs, button, show };
        }
        const { tools, tabs, button, show } = mobileTools;
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.textContent = label;
        tab.setAttribute('aria-pressed', 'false');
        tab.addEventListener('click', () => show(key));
        tools.set(key, { tab, open, close });
        const order = ['filter', 'relation', 'history'];
        const next = order.slice(order.indexOf(key) + 1).map(name => tools.get(name)?.tab).find(Boolean);
        if (next) next.before(tab);
        else tabs.append(tab);
        group.append(button);
    }

    /* Bundled CSS: Layui 2.10.3 and Highlight.js 11.9.0 Atom One themes.
The MIT License (MIT)

Copyright (c) 2016-present Layui contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
BSD 3-Clause License

Copyright (c) 2006, Ivan Sagalaev.
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

* Neither the name of the copyright holder nor the names of its
  contributors may be used to endorse or promote products derived from
  this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
    */
    const bundledStyles = {
        layui: ".layui-border-box,.layui-border-box *{box-sizing:border-box}.layui-box,.layui-box *{box-sizing:content-box}.layui-clear{clear:both}.layui-clear:after{content:'\\20';clear:both;display:block;height:0}.layui-clear-space{word-spacing:-5px}.layui-inline{position:relative;display:inline-block;vertical-align:middle}.layui-edge{position:relative;display:inline-block;vertical-align:middle;width:0;height:0;border-width:6px;border-style:dashed;border-color:transparent;overflow:hidden}.layui-edge-top{top:-4px;border-bottom-color:#999;border-bottom-style:solid}.layui-edge-right{border-left-color:#999;border-left-style:solid}.layui-edge-bottom{top:2px;border-top-color:#999;border-top-style:solid}.layui-edge-left{border-right-color:#999;border-right-style:solid}.layui-elip,.layui-ellip{text-overflow:ellipsis;overflow:hidden;white-space:nowrap}.layui-disabled,.layui-icon,.layui-unselect{user-select:none}.layui-disabled,.layui-disabled:hover{color:#d2d2d2!important;cursor:not-allowed!important}.layui-circle{border-radius:100%}.layui-show{display:block!important}.layui-hide{display:none!important}.layui-show-v{visibility:visible!important}.layui-hide-v{visibility:hidden!important}@font-face{font-family:layui-icon;src:url(data:font/woff2;base64,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" +
            "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" +
            "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" +
            "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" +
            "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" +
            "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" +
            "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) format('woff2')}.layui-icon{font-family:layui-icon!important;font-size:16px;font-style:normal;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}.layui-icon-sound:before{content:\"\\e69d\"}.layui-icon-bot:before{content:\"\\e7d6\"}.layui-icon-leaf:before{content:\"\\e701\"}.layui-icon-folder:before{content:\"\\eabe\"}.layui-icon-folder-open:before{content:\"\\eac1\"}.layui-icon-gitee:before{content:\"\\e69b\"}.layui-icon-github:before{content:\"\\e6a7\"}.layui-icon-disabled:before{content:\"\\e6cc\"}.layui-icon-moon:before{content:\"\\e6c2\"}.layui-icon-error:before{content:\"\\e693\"}.layui-icon-success:before{content:\"\\e697\"}.layui-icon-question:before{content:\"\\e699\"}.layui-icon-lock:before{content:\"\\e69a\"}.layui-icon-eye:before{content:\"\\e695\"}.layui-icon-eye-invisible:before{content:\"\\e696\"}.layui-icon-backspace:before{content:\"\\e694\"}.layui-icon-tips-fill:before{content:\"\\eb2e\"}.layui-icon-test:before{content:\"\\e692\"}.layui-icon-clear:before{content:\"\\e788\"}.layui-icon-heart-fill:before{content:\"\\e68f\"}.layui-icon-light:before{content:\"\\e748\"}.layui-icon-music:before{content:\"\\e690\"}.layui-icon-time:before{content:\"\\e68d\"}.layui-icon-ie:before{content:\"\\e7bb\"}.layui-icon-firefox:before{content:\"\\e686\"}.layui-icon-at:before{content:\"\\e687\"}.layui-icon-bluetooth:before{content:\"\\e689\"}.layui-icon-chrome:before{content:\"\\e68a\"}.layui-icon-edge:before{content:\"\\e68b\"}.layui-icon-heart:before{content:\"\\e68c\"}.layui-icon-key:before{content:\"\\e683\"}.layui-icon-android:before{content:\"\\e684\"}.layui-icon-mike:before{content:\"\\e6dc\"}.layui-icon-mute:before{content:\"\\e685\"}.layui-icon-gift:before{content:\"\\e627\"}.layui-icon-windows:before{content:\"\\e67f\"}.layui-icon-ios:before{content:\"\\e680\"}.layui-icon-logout:before{content:\"\\e682\"}.layui-icon-wifi:before{content:\"\\e7e0\"}.layui-icon-rss:before{content:\"\\e808\"}.layui-icon-email:before{content:\"\\e618\"}.layui-icon-reduce-circle:before{content:\"\\e616\"}.layui-icon-transfer:before{content:\"\\e691\"}.layui-icon-service:before{content:\"\\e626\"}.layui-icon-addition:before{content:\"\\e624\"}.layui-icon-subtraction:before{content:\"\\e67e\"}.layui-icon-slider:before{content:\"\\e714\"}.layui-icon-print:before{content:\"\\e66d\"}.layui-icon-export:before{content:\"\\e67d\"}.layui-icon-cols:before{content:\"\\e610\"}.layui-icon-screen-full:before{content:\"\\e622\"}.layui-icon-screen-restore:before{content:\"\\e758\"}.layui-icon-rate-half:before{content:\"\\e6c9\"}.layui-icon-rate-solid:before{content:\"\\e67a\"}.layui-icon-rate:before{content:\"\\e67b\"}.layui-icon-cellphone:before{content:\"\\e678\"}.layui-icon-vercode:before{content:\"\\e679\"}.layui-icon-login-weibo:before{content:\"\\e675\"}.layui-icon-login-qq:before{content:\"\\e676\"}.layui-icon-login-wechat:before{content:\"\\e677\"}.layui-icon-username:before{content:\"\\e66f\"}.layui-icon-password:before{content:\"\\e673\"}.layui-icon-refresh-3:before{content:\"\\e9aa\"}.layui-icon-auz:before{content:\"\\e672\"}.layui-icon-shrink-right:before{content:\"\\e668\"}.layui-icon-spread-left:before{content:\"\\e66b\"}.layui-icon-snowflake:before{content:\"\\e6b1\"}.layui-icon-tips:before{content:\"\\e702\"}.layui-icon-note:before{content:\"\\e66e\"}.layui-icon-senior:before{content:\"\\e674\"}.layui-icon-refresh-1:before{content:\"\\e666\"}.layui-icon-refresh:before{content:\"\\e669\"}.layui-icon-flag:before{content:\"\\e66c\"}.layui-icon-theme:before{content:\"\\e66a\"}.layui-icon-notice:before{content:\"\\e667\"}.layui-icon-console:before{content:\"\\e665\"}.layui-icon-website:before{content:\"\\e7ae\"}.layui-icon-face-surprised:before{content:\"\\e664\"}.layui-icon-set:before{content:\"\\e716\"}.layui-icon-template:before{content:\"\\e663\"}.layui-icon-app:before{content:\"\\e653\"}.layui-icon-template-1:before{content:\"\\e656\"}.layui-icon-home:before{content:\"\\e68e\"}.layui-icon-female:before{content:\"\\e661\"}.layui-icon-male:before{content:\"\\e662\"}.layui-icon-tread:before{content:\"\\e6c5\"}.layui-icon-praise:before{content:\"\\e6c6\"}.layui-icon-rmb:before{content:\"\\e65e\"}.layui-icon-more:before{content:\"\\e65f\"}.layui-icon-camera:before{content:\"\\e660\"}.layui-icon-cart-simple:before{content:\"\\e698\"}.layui-icon-face-cry:before{content:\"\\e69c\"}.layui-icon-face-smile:before{content:\"\\e6af\"}.layui-icon-survey:before{content:\"\\e6b2\"}.layui-icon-read:before{content:\"\\e705\"}.layui-icon-location:before{content:" +
            "\"\\e715\"}.layui-icon-dollar:before{content:\"\\e659\"}.layui-icon-diamond:before{content:\"\\e735\"}.layui-icon-return:before{content:\"\\e65c\"}.layui-icon-camera-fill:before{content:\"\\e65d\"}.layui-icon-fire:before{content:\"\\e756\"}.layui-icon-more-vertical:before{content:\"\\e671\"}.layui-icon-cart:before{content:\"\\e657\"}.layui-icon-star-fill:before{content:\"\\e658\"}.layui-icon-prev:before{content:\"\\e65a\"}.layui-icon-next:before{content:\"\\e65b\"}.layui-icon-upload:before{content:\"\\e67c\"}.layui-icon-upload-drag:before{content:\"\\e681\"}.layui-icon-user:before{content:\"\\e770\"}.layui-icon-file-b:before{content:\"\\e655\"}.layui-icon-component:before{content:\"\\e857\"}.layui-icon-find-fill:before{content:\"\\e670\"}.layui-icon-loading:before{content:\"\\e63d\"}.layui-icon-loading-1:before{content:\"\\e63e\"}.layui-icon-add-1:before{content:\"\\e654\"}.layui-icon-pause:before{content:\"\\e651\"}.layui-icon-play:before{content:\"\\e652\"}.layui-icon-video:before{content:\"\\e6ed\"}.layui-icon-headset:before{content:\"\\e6fc\"}.layui-icon-voice:before{content:\"\\e688\"}.layui-icon-speaker:before{content:\"\\e645\"}.layui-icon-fonts-del:before{content:\"\\e64f\"}.layui-icon-fonts-html:before{content:\"\\e64b\"}.layui-icon-fonts-code:before{content:\"\\e64e\"}.layui-icon-fonts-strong:before{content:\"\\e62b\"}.layui-icon-unlink:before{content:\"\\e64d\"}.layui-icon-picture:before{content:\"\\e64a\"}.layui-icon-link:before{content:\"\\e64c\"}.layui-icon-face-smile-b:before{content:\"\\e650\"}.layui-icon-align-center:before{content:\"\\e647\"}.layui-icon-align-right:before{content:\"\\e648\"}.layui-icon-align-left:before{content:\"\\e649\"}.layui-icon-fonts-u:before{content:\"\\e646\"}.layui-icon-fonts-i:before{content:\"\\e644\"}.layui-icon-tabs:before{content:\"\\e62a\"}.layui-icon-circle:before{content:\"\\e63f\"}.layui-icon-radio:before{content:\"\\e643\"}.layui-icon-share:before{content:\"\\e641\"}.layui-icon-edit:before{content:\"\\e642\"}.layui-icon-delete:before{content:\"\\e640\"}.layui-icon-engine:before{content:\"\\e628\"}.layui-icon-chart-screen:before{content:\"\\e629\"}.layui-icon-chart:before{content:\"\\e62c\"}.layui-icon-table:before{content:\"\\e62d\"}.layui-icon-tree:before{content:\"\\e62e\"}.layui-icon-upload-circle:before{content:\"\\e62f\"}.layui-icon-templeate-1:before{content:\"\\e630\"}.layui-icon-util:before{content:\"\\e631\"}.layui-icon-layouts:before{content:\"\\e632\"}.layui-icon-prev-circle:before{content:\"\\e633\"}.layui-icon-carousel:before{content:\"\\e634\"}.layui-icon-code-circle:before{content:\"\\e635\"}.layui-icon-water:before{content:\"\\e636\"}.layui-icon-date:before{content:\"\\e637\"}.layui-icon-layer:before{content:\"\\e638\"}.layui-icon-fonts-clear:before{content:\"\\e639\"}.layui-icon-dialogue:before{content:\"\\e63a\"}.layui-icon-cellphone-fine:before{content:\"\\e63b\"}.layui-icon-form:before{content:\"\\e63c\"}.layui-icon-file:before{content:\"\\e621\"}.layui-icon-triangle-r:before{content:\"\\e623\"}.layui-icon-triangle-d:before{content:\"\\e625\"}.layui-icon-set-sm:before{content:\"\\e620\"}.layui-icon-add-circle:before{content:\"\\e61f\"}.layui-icon-layim-download:before{content:\"\\e61e\"}.layui-icon-layim-uploadfile:before{content:\"\\e61d\"}.layui-icon-404:before{content:\"\\e61c\"}.layui-icon-about:before{content:\"\\e60b\"}.layui-icon-layim-theme:before{content:\"\\e61b\"}.layui-icon-down:before{content:\"\\e61a\"}.layui-icon-up:before{content:\"\\e619\"}.layui-icon-circle-dot:before{content:\"\\e617\"}.layui-icon-set-fill:before{content:\"\\e614\"}.layui-icon-search:before{content:\"\\e615\"}.layui-icon-friends:before{content:\"\\e612\"}.layui-icon-group:before{content:\"\\e613\"}.layui-icon-reply-fill:before{content:\"\\e611\"}.layui-icon-menu-fill:before{content:\"\\e60f\"}.layui-icon-face-smile-fine:before{content:\"\\e60c\"}.layui-icon-picture-fine:before{content:\"\\e60d\"}.layui-icon-log:before{content:\"\\e60e\"}.layui-icon-list:before{content:\"\\e60a\"}.layui-icon-release:before{content:\"\\e609\"}.layui-icon-add-circle-fine:before{content:\"\\e608\"}.layui-icon-ok:before{content:\"\\e605\"}.layui-icon-help:before{content:\"\\e607\"}.layui-icon-chat:before{content:\"\\e606\"}.layui-icon-top:before{content:\"\\e604\"}.layui-icon-right:before{content:\"\\e602\"}.layui-icon-left:before{content:\"\\e603\"}.layui-icon-star:before{content:\"\\e600\"}.layui-icon-download-circle:before{content:\"\\e601\"}.layui-icon-close:before{content:\"\\1006\"}.layui-icon-close-fill:before{content:\"\\1007\"}.layui-icon-ok-circle:before{content:\"\\1005\"}.layui-main{position:relative;width:1160px;margin:0 auto}.layui-header{position:relative;z-index:1000;height:60px}.layui-header a:hover{transition:all .5s;-webkit-transition:all .5s}.layui-side{position:fixed;left:0;top:0;bottom:0;z-index:999;width:200px;overflow-x:hidden}.layui-side-scroll{position:relative;width:220px;height:100%;overflow-x:hidden}.layui-body{position:relative;left:200px;right:0;top:0;bottom:0;width:auto;box-sizing:border-box}.layui-layout-body{overflow-x:hidden}.layui-layout-admin .layui-header{position:fixed;top:0;left:0;right:0;background-color:#23292e}.layui-layout-admin .layui-side{top:60px;width:200px;overflow-x:hidden}.layui-layout-admin .layui-body{position:absolute;top:60px;padding-bottom:44px}.layui-layout-admin .layui-main{width:auto;margin:0 15px}.layui-layout-admin .layui-footer{position:fixed;left:200px;right:0;bottom:0;z-index:990;height:44px;line-height:44px;padding:0 15px;box-shadow:-1px 0 4px rgb(0 0 0 / 12%);background-color:#fafafa}.layui-layout-admin .layui-logo{position:absolute;left:0;top:0;width:200px;height:100%;line-height:60px;text-align:center;color:#16baaa;font-size:16px;box-shadow:0 1px 2px 0 rgb(0 0 0 / 15%)}.layui-layout-admin .layui-header .layui-nav{background:0 0}.layui-layout-left{position:absolute!important;left:200px;top:0}.layui-layout-right{position:absolute!important;right:0;top:0}.layui-container{position:relative;margin:0 auto;box-sizing:border-box}.layui-fluid{position:relative;margin:0 auto;padding:0 15px}.layui-row:after,.layui-row:before{content:\"\";display:block;clear:both}.layui-col-lg1,.layui-col-lg10,.layui-col-lg11,.layui-col-lg12,.layui-col-lg2,.layui-col-lg3,.layui-col-lg4,.layui-col-lg5,.layui-col-lg6,.layui-col-lg7,.layui-col-lg8,.layui-col-lg9,.layui-col-md1,.layui-col-md10,.layui-col-md11,.layui-col-md12,.layui-col-md2,.layui-col-md3,.layui-col-md4,.layui-col-md5,.layui-col-md6,.layui-col-md7,.layui-col-md8,.layui-col-md9,.layui-col-sm1,.layui-col-sm10,.layui-col-sm11,.layui-col-sm12,.layui-col-sm2,.layui-col-sm3,.layui-col-sm4,.layui-col-sm5,.layui-col-sm6,.layui-col-sm7,.layui-col-sm8,.layui-col-sm9,.layui-col-xl1,.layui-col-xl10,.layui-col-xl11,.layui-col-xl12,.layui-col-xl2,.lay" +
            "ui-col-xl3,.layui-col-xl4,.layui-col-xl5,.layui-col-xl6,.layui-col-xl7,.layui-col-xl8,.layui-col-xl9,.layui-col-xs1,.layui-col-xs10,.layui-col-xs11,.layui-col-xs12,.layui-col-xs2,.layui-col-xs3,.layui-col-xs4,.layui-col-xs5,.layui-col-xs6,.layui-col-xs7,.layui-col-xs8,.layui-col-xs9{position:relative;display:block;box-sizing:border-box}.layui-col-xs1,.layui-col-xs10,.layui-col-xs11,.layui-col-xs12,.layui-col-xs2,.layui-col-xs3,.layui-col-xs4,.layui-col-xs5,.layui-col-xs6,.layui-col-xs7,.layui-col-xs8,.layui-col-xs9{float:left}.layui-col-xs1{width:8.33333333%}.layui-col-xs2{width:16.66666667%}.layui-col-xs3{width:25%}.layui-col-xs4{width:33.33333333%}.layui-col-xs5{width:41.66666667%}.layui-col-xs6{width:50%}.layui-col-xs7{width:58.33333333%}.layui-col-xs8{width:66.66666667%}.layui-col-xs9{width:75%}.layui-col-xs10{width:83.33333333%}.layui-col-xs11{width:91.66666667%}.layui-col-xs12{width:100%}.layui-col-xs-offset1{margin-left:8.33333333%}.layui-col-xs-offset2{margin-left:16.66666667%}.layui-col-xs-offset3{margin-left:25%}.layui-col-xs-offset4{margin-left:33.33333333%}.layui-col-xs-offset5{margin-left:41.66666667%}.layui-col-xs-offset6{margin-left:50%}.layui-col-xs-offset7{margin-left:58.33333333%}.layui-col-xs-offset8{margin-left:66.66666667%}.layui-col-xs-offset9{margin-left:75%}.layui-col-xs-offset10{margin-left:83.33333333%}.layui-col-xs-offset11{margin-left:91.66666667%}.layui-col-xs-offset12{margin-left:100%}@media screen and (max-width:767.98px){.layui-container{padding:0 15px}.layui-hide-xs{display:none!important}.layui-show-xs-block{display:block!important}.layui-show-xs-inline{display:inline!important}.layui-show-xs-inline-block{display:inline-block!important}}@media screen and (min-width:768px){.layui-container{width:720px}.layui-hide-sm{display:none!important}.layui-show-sm-block{display:block!important}.layui-show-sm-inline{display:inline!important}.layui-show-sm-inline-block{display:inline-block!important}.layui-col-sm1,.layui-col-sm10,.layui-col-sm11,.layui-col-sm12,.layui-col-sm2,.layui-col-sm3,.layui-col-sm4,.layui-col-sm5,.layui-col-sm6,.layui-col-sm7,.layui-col-sm8,.layui-col-sm9{float:left}.layui-col-sm1{width:8.33333333%}.layui-col-sm2{width:16.66666667%}.layui-col-sm3{width:25%}.layui-col-sm4{width:33.33333333%}.layui-col-sm5{width:41.66666667%}.layui-col-sm6{width:50%}.layui-col-sm7{width:58.33333333%}.layui-col-sm8{width:66.66666667%}.layui-col-sm9{width:75%}.layui-col-sm10{width:83.33333333%}.layui-col-sm11{width:91.66666667%}.layui-col-sm12{width:100%}.layui-col-sm-offset1{margin-left:8.33333333%}.layui-col-sm-offset2{margin-left:16.66666667%}.layui-col-sm-offset3{margin-left:25%}.layui-col-sm-offset4{margin-left:33.33333333%}.layui-col-sm-offset5{margin-left:41.66666667%}.layui-col-sm-offset6{margin-left:50%}.layui-col-sm-offset7{margin-left:58.33333333%}.layui-col-sm-offset8{margin-left:66.66666667%}.layui-col-sm-offset9{margin-left:75%}.layui-col-sm-offset10{margin-left:83.33333333%}.layui-col-sm-offset11{margin-left:91.66666667%}.layui-col-sm-offset12{margin-left:100%}}@media screen and (min-width:992px){.layui-container{width:960px}.layui-hide-md{display:none!important}.layui-show-md-block{display:block!important}.layui-show-md-inline{display:inline!important}.layui-show-md-inline-block{display:inline-block!important}.layui-col-md1,.layui-col-md10,.layui-col-md11,.layui-col-md12,.layui-col-md2,.layui-col-md3,.layui-col-md4,.layui-col-md5,.layui-col-md6,.layui-col-md7,.layui-col-md8,.layui-col-md9{float:left}.layui-col-md1{width:8.33333333%}.layui-col-md2{width:16.66666667%}.layui-col-md3{width:25%}.layui-col-md4{width:33.33333333%}.layui-col-md5{width:41.66666667%}.layui-col-md6{width:50%}.layui-col-md7{width:58.33333333%}.layui-col-md8{width:66.66666667%}.layui-col-md9{width:75%}.layui-col-md10{width:83.33333333%}.layui-col-md11{width:91.66666667%}.layui-col-md12{width:100%}.layui-col-md-offset1{margin-left:8.33333333%}.layui-col-md-offset2{margin-left:16.66666667%}.layui-col-md-offset3{margin-left:25%}.layui-col-md-offset4{margin-left:33.33333333%}.layui-col-md-offset5{margin-left:41.66666667%}.layui-col-md-offset6{margin-left:50%}.layui-col-md-offset7{margin-left:58.33333333%}.layui-col-md-offset8{margin-left:66.66666667%}.layui-col-md-offset9{margin-left:75%}.layui-col-md-offset10{margin-left:83.33333333%}.layui-col-md-offset11{margin-left:91.66666667%}.layui-col-md-offset12{margin-left:100%}}@media screen and (min-width:1200px){.layui-container{width:1150px}.layui-hide-lg{display:none!important}.layui-show-lg-block{display:block!important}.layui-show-lg-inline{display:inline!important}.layui-show-lg-inline-block{display:inline-block!important}.layui-col-lg1,.layui-col-lg10,.layui-col-lg11,.layui-col-lg12,.layui-col-lg2,.layui-col-lg3,.layui-col-lg4,.layui-col-lg5,.layui-col-lg6,.layui-col-lg7,.layui-col-lg8,.layui-col-lg9{float:left}.layui-col-lg1{width:8.33333333%}.layui-col-lg2{width:16.66666667%}.layui-col-lg3{width:25%}.layui-col-lg4{width:33.33333333%}.layui-col-lg5{width:41.66666667%}.layui-col-lg6{width:50%}.layui-col-lg7{width:58.33333333%}.layui-col-lg8{width:66.66666667%}.layui-col-lg9{width:75%}.layui-col-lg10{width:83.33333333%}.layui-col-lg11{width:91.66666667%}.layui-col-lg12{width:100%}.layui-col-lg-offset1{margin-left:8.33333333%}.layui-col-lg-offset2{margin-left:16.66666667%}.layui-col-lg-offset3{margin-left:25%}.layui-col-lg-offset4{margin-left:33.33333333%}.layui-col-lg-offset5{margin-left:41.66666667%}.layui-col-lg-offset6{margin-left:50%}.layui-col-lg-offset7{margin-left:58.33333333%}.layui-col-lg-offset8{margin-left:66.66666667%}.layui-col-lg-offset9{margin-left:75%}.layui-col-lg-offset10{margin-left:83.33333333%}.layui-col-lg-offset11{margin-left:91.66666667%}.layui-col-lg-offset12{margin-left:100%}}@media screen and (min-width:1400px){.layui-container{width:1330px}.layui-hide-xl{display:none!important}.layui-show-xl-block{display:block!important}.layui-show-xl-inline{display:inline!important}.layui-show-xl-inline-block{display:inline-block!important}.layui-col-xl1,.layui-col-xl10,.layui-col-xl11,.layui-col-xl12,.layui-col-xl2,.layui-col-xl3,.layui-col-xl4,.layui-col-xl5,.layui-col-xl6,.layui-col-xl7,.layui-col-xl8,.layui-col-xl9{float:left}.layui-col-xl1{width:8.33333333%}.layui-col-xl2{width:16.66666667%}.layui-col-xl3{width:25%}.layui-col-xl4{width:33.33333333%}.layui-col-xl5{width:41.66666667%}.layui-col-xl6{width:50%}.layui-col-xl7{width:58.33333333%}.layui-col-xl8{width:66.66666667%}.layui-col-xl9{width:75%}.layui" +
            "-col-xl10{width:83.33333333%}.layui-col-xl11{width:91.66666667%}.layui-col-xl12{width:100%}.layui-col-xl-offset1{margin-left:8.33333333%}.layui-col-xl-offset2{margin-left:16.66666667%}.layui-col-xl-offset3{margin-left:25%}.layui-col-xl-offset4{margin-left:33.33333333%}.layui-col-xl-offset5{margin-left:41.66666667%}.layui-col-xl-offset6{margin-left:50%}.layui-col-xl-offset7{margin-left:58.33333333%}.layui-col-xl-offset8{margin-left:66.66666667%}.layui-col-xl-offset9{margin-left:75%}.layui-col-xl-offset10{margin-left:83.33333333%}.layui-col-xl-offset11{margin-left:91.66666667%}.layui-col-xl-offset12{margin-left:100%}}.layui-col-space1{margin:-.5px}.layui-col-space1>*{padding:.5px}.layui-col-space2{margin:-1px}.layui-col-space2>*{padding:1px}.layui-col-space4{margin:-2px}.layui-col-space4>*{padding:2px}.layui-col-space5{margin:-2.5px}.layui-col-space5>*{padding:2.5px}.layui-col-space6{margin:-3px}.layui-col-space6>*{padding:3px}.layui-col-space8{margin:-4px}.layui-col-space8>*{padding:4px}.layui-col-space10{margin:-5px}.layui-col-space10>*{padding:5px}.layui-col-space12{margin:-6px}.layui-col-space12>*{padding:6px}.layui-col-space14{margin:-7px}.layui-col-space14>*{padding:7px}.layui-col-space15{margin:-7.5px}.layui-col-space15>*{padding:7.5px}.layui-col-space16{margin:-8px}.layui-col-space16>*{padding:8px}.layui-col-space18{margin:-9px}.layui-col-space18>*{padding:9px}.layui-col-space20{margin:-10px}.layui-col-space20>*{padding:10px}.layui-col-space22{margin:-11px}.layui-col-space22>*{padding:11px}.layui-col-space24{margin:-12px}.layui-col-space24>*{padding:12px}.layui-col-space25{margin:-12.5px}.layui-col-space25>*{padding:12.5px}.layui-col-space26{margin:-13px}.layui-col-space26>*{padding:13px}.layui-col-space28{margin:-14px}.layui-col-space28>*{padding:14px}.layui-col-space30{margin:-15px}.layui-col-space30>*{padding:15px}.layui-col-space32{margin:-16px}.layui-col-space32>*{padding:16px}.layui-padding-1{padding:4px!important}.layui-padding-2{padding:8px!important}.layui-padding-3{padding:16px!important}.layui-padding-4{padding:32px!important}.layui-padding-5{padding:48px!important}.layui-margin-1{margin:4px!important}.layui-margin-2{margin:8px!important}.layui-margin-3{margin:16px!important}.layui-margin-4{margin:32px!important}.layui-margin-5{margin:48px!important}.layui-btn,.layui-input,.layui-select,.layui-textarea,.layui-upload-button{outline:0;appearance:none;-webkit-appearance:none;transition:all .3s;-webkit-transition:all .3s;box-sizing:border-box}.layui-elem-quote{margin-bottom:10px;padding:15px;line-height:1.8;border-left:5px solid #16b777;border-radius:0 2px 2px 0;background-color:#fafafa}.layui-quote-nm{border-style:solid;border-width:1px;border-left-width:5px;background:0 0}.layui-elem-field{margin-bottom:10px;padding:0;border-width:1px;border-style:solid}.layui-elem-field legend{margin-left:20px;padding:0 10px;font-size:20px}.layui-field-title{margin:16px 0;border-width:0;border-top-width:1px}.layui-field-box{padding:15px}.layui-field-title .layui-field-box{padding:10px 0}.layui-progress{position:relative;height:6px;border-radius:20px;background-color:#eee}.layui-progress-bar{position:absolute;left:0;top:0;width:0;max-width:100%;height:6px;border-radius:20px;text-align:right;background-color:#16b777;transition:all .3s;-webkit-transition:all .3s}.layui-progress-big,.layui-progress-big .layui-progress-bar{height:18px;line-height:18px}.layui-progress-text{position:relative;top:-20px;line-height:18px;font-size:12px;color:#5f5f5f}.layui-progress-big .layui-progress-text{position:static;padding:0 10px;color:#fff}.layui-collapse{border-width:1px;border-style:solid;border-radius:2px}.layui-colla-content,.layui-colla-item{border-top-width:1px;border-top-style:solid}.layui-colla-item:first-child{border-top:none}.layui-colla-title{position:relative;height:42px;line-height:42px;padding:0 15px 0 35px;color:#333;background-color:#fafafa;cursor:pointer;font-size:14px;overflow:hidden}.layui-colla-content{display:none;padding:10px 15px;line-height:1.6;color:#5f5f5f}.layui-colla-icon{position:absolute;left:15px;top:0;font-size:14px}.layui-card{margin-bottom:15px;border-radius:2px;background-color:#fff;box-shadow:0 1px 2px 0 rgba(0,0,0,.05)}.layui-card:last-child{margin-bottom:0}.layui-card-header{position:relative;height:42px;line-height:42px;padding:0 15px;border-bottom:1px solid #f8f8f8;color:#333;border-radius:2px 2px 0 0;font-size:14px}.layui-card-body{position:relative;padding:10px 15px;line-height:24px}.layui-card-body[pad15]{padding:15px}.layui-card-body[pad20]{padding:20px}.layui-card-body .layui-table{margin:5px 0}.layui-card .layui-tab{margin:0}.layui-panel{position:relative;border-width:1px;border-style:solid;border-radius:2px;box-shadow:1px 1px 4px rgb(0 0 0 / 8%);background-color:#fff;color:#5f5f5f}.layui-panel-window{position:relative;padding:15px;border-radius:0;border-top:5px solid #eee;background-color:#fff}.layui-auxiliar-moving{position:fixed;left:0;right:0;top:0;bottom:0;width:100%;height:100%;background:0 0;z-index:9999999999;-moz-user-select:none;-webkit-user-select:none;-ms-user-select:none;user-select:none}.layui-scrollbar-hide{overflow:hidden!important}.layui-bg-red{background-color:#ff5722!important;color:#fff!important}.layui-bg-orange{background-color:#ffb800!important;color:#fff!important}.layui-bg-green{background-color:#16baaa!important;color:#fff!important}.layui-bg-cyan{background-color:#2f4056!important;color:#fff!important}.layui-bg-blue{background-color:#1e9fff!important;color:#fff!important}.layui-bg-purple{background-color:#a233c6!important;color:#fff!important}.layui-bg-black{background-color:#2f363c!important;color:#fff!important}.layui-bg-gray{background-color:#fafafa!important;color:#5f5f5f!important}.layui-badge-rim,.layui-border,.layui-colla-content,.layui-colla-item,.layui-collapse,.layui-elem-field,.layui-form-pane .layui-form-item[pane],.layui-form-pane .layui-form-label,.layui-input,.layui-input-split,.layui-panel,.layui-quote-nm,.layui-select,.layui-tab-bar,.layui-tab-card,.layui-tab-title,.layui-tab-title .layui-this:after,.layui-textarea{border-color:#eee}.layui-border{border-width:1px;border-style:solid;color:#5f5f5f!important}.layui-border-red{border-width:1px;border-style:solid;border-color:#ff5722!important;color:#ff5722!important}.layui-border-orange{border-width:1px;border-style:solid;border-color:#ffb800!important;color:#ffb800!important}.layui-border-green{border-width:1px;border-style:solid;border-color:#16baaa!important;c" +
            "olor:#16baaa!important}.layui-border-cyan{border-width:1px;border-style:solid;border-color:#2f4056!important;color:#2f4056!important}.layui-border-blue{border-width:1px;border-style:solid;border-color:#1e9fff!important;color:#1e9fff!important}.layui-border-purple{border-width:1px;border-style:solid;border-color:#a233c6!important;color:#a233c6!important}.layui-border-black{border-width:1px;border-style:solid;border-color:#2f363c!important;color:#2f363c!important}hr.layui-border-black,hr.layui-border-blue,hr.layui-border-cyan,hr.layui-border-green,hr.layui-border-orange,hr.layui-border-purple,hr.layui-border-red{border-width:0 0 1px}.layui-timeline-item:before{background-color:#eee}.layui-text{line-height:1.8;font-size:14px}.layui-text h1{margin:32px 0;font-size:32px}.layui-text h2{margin:24px 0;font-size:24px}.layui-text h3{margin:16px 0;font-size:18px}.layui-text h4{margin:11px 0;font-size:16px}.layui-text h5{margin:11px 0;font-size:14px}.layui-text h6{margin:11px 0;font-size:13px}.layui-text p{margin:15px 0}.layui-text p:first-child{margin-top:0}.layui-text p:last-child{margin-bottom:0}.layui-text hr{margin:15px 0}.layui-text ol,.layui-text ul{padding-left:15px}.layui-text ul li{margin-top:5px;list-style-type:disc}.layui-text ol li{margin-top:5px;list-style-type:decimal}.layui-text ol ul>li,.layui-text ul ul>li{list-style-type:disc}.layui-text ol li>p:first-child,.layui-text ul li>p:first-child{margin-top:0;margin-bottom:0}.layui-text :where(a:not(.layui-btn)){color:#01aaed}.layui-text :where(a:not(.layui-btn):hover){text-decoration:underline}.layui-text blockquote:not(.layui-elem-quote){margin:15px 0;padding:5px 15px;border-left:5px solid #eee}.layui-text pre>code:not(.layui-code){display:block;padding:15px;font-family:\"Courier New\",Consolas,\"Lucida Console\",monospace}.layui-text-em,.layui-word-aux{color:#999!important;padding-left:5px!important;padding-right:5px!important}.layui-font-12{font-size:12px!important}.layui-font-13{font-size:13px!important}.layui-font-14{font-size:14px!important}.layui-font-16{font-size:16px!important}.layui-font-18{font-size:18px!important}.layui-font-20{font-size:20px!important}.layui-font-22{font-size:22px!important}.layui-font-24{font-size:24px!important}.layui-font-26{font-size:26px!important}.layui-font-28{font-size:28px!important}.layui-font-30{font-size:30px!important}.layui-font-32{font-size:32px!important}.layui-font-red{color:#ff5722!important}.layui-font-orange{color:#ffb800!important}.layui-font-green{color:#16baaa!important}.layui-font-cyan{color:#2f4056!important}.layui-font-blue{color:#01aaed!important}.layui-font-purple{color:#a233c6!important}.layui-font-black{color:#000!important}.layui-font-gray{color:#c2c2c2!important}.layui-btn{display:inline-block;vertical-align:middle;height:38px;line-height:38px;border:1px solid transparent;padding:0 18px;background-color:#16baaa;color:#fff;white-space:nowrap;text-align:center;font-size:14px;border-radius:2px;cursor:pointer;user-select:none}.layui-btn:hover{opacity:.8;filter:alpha(opacity=80);color:#fff}.layui-btn:active{opacity:1;filter:alpha(opacity=100)}.layui-btn+.layui-btn{margin-left:10px}.layui-btn-container{word-spacing:-5px}.layui-btn-container .layui-btn{margin-right:10px;margin-bottom:10px;word-spacing:normal}.layui-btn-container .layui-btn+.layui-btn{margin-left:0}.layui-table .layui-btn-container .layui-btn{margin-bottom:9px}.layui-btn-radius{border-radius:100px}.layui-btn .layui-icon{padding:0 2px;vertical-align:middle\\0;vertical-align:bottom}.layui-btn-primary{border-color:#d2d2d2;background:0 0;color:#5f5f5f}.layui-btn-primary:hover{border-color:#16baaa;color:#333}.layui-btn-normal{background-color:#1e9fff}.layui-btn-warm{background-color:#ffb800}.layui-btn-danger{background-color:#ff5722}.layui-btn-checked{background-color:#16b777}.layui-btn-disabled,.layui-btn-disabled:active,.layui-btn-disabled:hover{border-color:#eee!important;background-color:#fbfbfb!important;color:#d2d2d2!important;cursor:not-allowed!important;opacity:1}.layui-btn-lg{height:44px;line-height:44px;padding:0 25px;font-size:16px}.layui-btn-sm{height:30px;line-height:30px;padding:0 10px;font-size:12px}.layui-btn-xs{height:22px;line-height:22px;padding:0 5px;font-size:12px}.layui-btn-xs i{font-size:12px!important}.layui-btn-group{display:inline-block;vertical-align:middle;font-size:0}.layui-btn-group .layui-btn{margin-left:0!important;margin-right:0!important;border-left:1px solid rgba(255,255,255,.5);border-radius:0}.layui-btn-group .layui-btn-primary{border-left:none}.layui-btn-group .layui-btn-primary:hover{border-color:#d2d2d2;color:#16baaa}.layui-btn-group .layui-btn:first-child{border-left:none;border-radius:2px 0 0 2px}.layui-btn-group .layui-btn-primary:first-child{border-left:1px solid #d2d2d2}.layui-btn-group .layui-btn:last-child{border-radius:0 2px 2px 0}.layui-btn-group .layui-btn+.layui-btn{margin-left:0}.layui-btn-group+.layui-btn-group{margin-left:10px}.layui-btn-fluid{width:100%}.layui-input,.layui-select,.layui-textarea{height:38px;line-height:1.3;line-height:38px\\9;border-width:1px;border-style:solid;background-color:#fff;color:rgba(0,0,0,.85);border-radius:2px}.layui-input::-webkit-input-placeholder,.layui-select::-webkit-input-placeholder,.layui-textarea::-webkit-input-placeholder{line-height:1.3}.layui-input,.layui-textarea{display:block;width:100%;padding-left:10px}.layui-input:hover,.layui-textarea:hover{border-color:#d2d2d2!important}.layui-input:focus,.layui-textarea:focus{border-color:#16b777!important;box-shadow:0 0 0 3px rgba(22,183,119,.08)}.layui-textarea{position:relative;min-height:100px;height:auto;line-height:20px;padding:6px 10px;resize:vertical}.layui-input[disabled],.layui-textarea[disabled]{background-color:#fafafa}.layui-select{padding:0 10px}.layui-form input[type=checkbox],.layui-form input[type=radio],.layui-form select{display:none}.layui-form [lay-ignore]{display:initial}.layui-form-item{position:relative;margin-bottom:15px;clear:both}.layui-form-item:after{content:'\\20';clear:both;display:block;height:0}.layui-form-label{position:relative;float:left;display:block;padding:9px 15px;width:80px;font-weight:400;line-height:20px;text-align:right}.layui-form-label-col{display:block;float:none;padding:9px 0;line-height:20px;text-align:left}.layui-form-item .layui-inline{margin-bottom:5px;margin-right:10px}.layui-input-block,.layui-input-inline{position:relative}.layui-input-block{margin-left:110px;min-height:36px}.layui-input-inline{display:inline-block;vertical-align:" +
            "middle}.layui-form-item .layui-input-inline{float:left;width:190px;margin-right:10px}.layui-form-text .layui-input-inline{width:auto}.layui-form-mid{position:relative;float:left;display:block;padding:9px 0!important;line-height:20px;margin-right:10px}.layui-form-danger+.layui-form-select .layui-input,.layui-form-danger:focus{border-color:#ff5722!important;box-shadow:0 0 0 3px rgba(255,87,34,.08)}.layui-input-prefix,.layui-input-split,.layui-input-suffix,.layui-input-suffix .layui-input-affix{position:absolute;right:0;top:0;padding:0 10px;width:35px;height:100%;text-align:center;transition:all .3s;box-sizing:border-box}.layui-input-prefix{left:0;border-radius:2px 0 0 2px}.layui-input-suffix{right:0;border-radius:0 2px 2px 0}.layui-input-split{border-width:1px;border-style:solid}.layui-input-prefix .layui-icon,.layui-input-split .layui-icon,.layui-input-suffix .layui-icon{position:relative;font-size:16px;color:#5f5f5f;transition:all .3s}.layui-input-group{position:relative;display:table;box-sizing:border-box}.layui-input-group>*{display:table-cell;vertical-align:middle;position:relative}.layui-input-group .layui-input{padding-right:15px}.layui-input-group>.layui-input-prefix{width:auto;border-right:0}.layui-input-group>.layui-input-suffix{width:auto;border-left:0}.layui-input-group .layui-input-split{white-space:nowrap}.layui-input-wrap{position:relative;line-height:38px}.layui-input-wrap .layui-input{padding-right:35px}.layui-input-wrap .layui-input::-ms-clear,.layui-input-wrap .layui-input::-ms-reveal{display:none}.layui-input-wrap .layui-input-prefix+.layui-input,.layui-input-wrap .layui-input-prefix~* .layui-input{padding-left:35px}.layui-input-wrap .layui-input-split+.layui-input,.layui-input-wrap .layui-input-split~* .layui-input{padding-left:45px}.layui-input-wrap .layui-input-prefix~.layui-form-select{position:static}.layui-input-wrap .layui-input-prefix,.layui-input-wrap .layui-input-split,.layui-input-wrap .layui-input-suffix{pointer-events:none}.layui-input-wrap .layui-input:hover+.layui-input-split{border-color:#d2d2d2}.layui-input-wrap .layui-input:focus+.layui-input-split{border-color:#16b777}.layui-input-wrap .layui-input.layui-form-danger:focus+.layui-input-split{border-color:#ff5722}.layui-input-wrap .layui-input-prefix.layui-input-split{border-width:0;border-right-width:1px}.layui-input-wrap .layui-input-suffix.layui-input-split{border-width:0;border-left-width:1px}.layui-input-affix{line-height:38px}.layui-input-suffix .layui-input-affix{right:auto;left:-35px}.layui-input-affix .layui-icon{color:rgba(0,0,0,.8);pointer-events:auto!important;cursor:pointer}.layui-input-affix .layui-icon-clear{color:rgba(0,0,0,.3)}.layui-input-affix .layui-icon:hover{color:rgba(0,0,0,.6)}.layui-input-wrap .layui-input-number{width:24px;padding:0}.layui-input-wrap .layui-input-number .layui-icon{position:absolute;right:0;width:100%;height:50%;line-height:normal;font-size:12px}.layui-input-wrap .layui-input-number .layui-icon:before{position:absolute;left:50%;top:50%;margin-top:-6px;margin-left:-6px}.layui-input-wrap .layui-input-number .layui-icon-up{top:0;border-bottom:1px solid #eee}.layui-input-wrap .layui-input-number .layui-icon-down{bottom:0}.layui-input-wrap .layui-input-number .layui-icon:hover{font-weight:700}.layui-input-wrap .layui-input[type=number]::-webkit-inner-spin-button,.layui-input-wrap .layui-input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none!important}.layui-input-wrap .layui-input[type=number]{-moz-appearance:textfield;-webkit-appearance:textfield;appearance:textfield}.layui-input-wrap .layui-input.layui-input-number-invalid,.layui-input-wrap .layui-input.layui-input-number-out-of-range{color:#ff5722}.layui-form-select{position:relative;color:#5f5f5f}.layui-form-select .layui-input{padding-right:30px;cursor:pointer}.layui-form-select .layui-edge{position:absolute;right:10px;top:50%;margin-top:-3px;cursor:pointer;border-width:6px;border-top-color:#c2c2c2;border-top-style:solid;transition:all .3s;-webkit-transition:all .3s}.layui-form-select dl{display:none;position:absolute;left:0;top:42px;padding:5px 0;z-index:899;min-width:100%;border:1px solid #eee;max-height:300px;overflow-y:auto;background-color:#fff;border-radius:2px;box-shadow:1px 1px 4px rgb(0 0 0 / 8%);box-sizing:border-box}.layui-form-select dl dd,.layui-form-select dl dt{padding:0 10px;line-height:36px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.layui-form-select dl dt{font-size:12px;color:#999}.layui-form-select dl dd{cursor:pointer}.layui-form-select dl dd:hover{background-color:#f8f8f8;-webkit-transition:.5s all;transition:.5s all}.layui-form-select .layui-select-group dd{padding-left:20px}.layui-form-select dl dd.layui-select-tips{padding-left:10px!important;color:#999}.layui-form-select dl dd.layui-this{background-color:#f8f8f8;color:#16b777;font-weight:700}.layui-form-select dl dd.layui-disabled{background-color:#fff}.layui-form-selected dl{display:block}.layui-form-selected .layui-edge{margin-top:-9px;-webkit-transform:rotate(180deg);transform:rotate(180deg)}.layui-form-selected .layui-edge{margin-top:-3px\\0}:root .layui-form-selected .layui-edge{margin-top:-9px\\0/IE9}.layui-form-selectup dl{top:auto;bottom:42px}.layui-select-none{margin:5px 0;text-align:center;color:#999}.layui-select-panel-wrap{position:absolute;z-index:99999999}.layui-select-panel-wrap dl{position:relative;display:block;top:0}.layui-select-disabled .layui-disabled{border-color:#eee!important}.layui-select-disabled .layui-edge{border-top-color:#d2d2d2}.layui-form-checkbox{position:relative;display:inline-block;vertical-align:middle;height:30px;line-height:30px;margin-right:10px;padding-right:30px;background-color:#fff;cursor:pointer;font-size:0;-webkit-transition:.1s linear;transition:.1s linear;box-sizing:border-box}.layui-form-checkbox>*{display:inline-block;vertical-align:middle}.layui-form-checkbox>div{padding:0 11px;font-size:14px;border-radius:2px 0 0 2px;background-color:#d2d2d2;color:#fff;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.layui-form-checkbox>div>.layui-icon{line-height:normal}.layui-form-checkbox:hover>div{background-color:#c2c2c2}.layui-form-checkbox>i{position:absolute;right:0;top:0;width:30px;height:100%;border:1px solid #d2d2d2;border-left:none;border-radius:0 2px 2px 0;color:#fff;color:rgba(255,255,255,0);font-size:20px;text-align:center;box-sizing:border-box}.layui-form-checkbox:hover>i{border-color:#c2c2c2;color:#c2c2c2}.layui-form-checked,.layui-form-" +
            "checked:hover{border-color:#16b777}.layui-form-checked:hover>div,.layui-form-checked>div{background-color:#16b777}.layui-form-checked:hover>i,.layui-form-checked>i{color:#16b777}.layui-form-item .layui-form-checkbox{margin-top:4px}.layui-form-checkbox.layui-checkbox-disabled>div{background-color:#eee!important}.layui-form [lay-checkbox]{display:none}.layui-form-checkbox[lay-skin=primary]{height:auto!important;line-height:normal!important;min-width:18px;min-height:18px;border:none!important;margin-right:0;padding-left:24px;padding-right:0;background:0 0}.layui-form-checkbox[lay-skin=primary]>div{margin-top:-1px;padding-left:0;padding-right:15px;line-height:18px;background:0 0;color:#5f5f5f}.layui-form-checkbox[lay-skin=primary]>i{right:auto;left:0;width:16px;height:16px;line-height:14px;border:1px solid #d2d2d2;font-size:12px;border-radius:2px;background-color:#fff;-webkit-transition:.1s linear;transition:.1s linear}.layui-form-checkbox[lay-skin=primary]:hover>i{border-color:#16b777;color:#fff}.layui-form-checked[lay-skin=primary]>i{border-color:#16b777!important;background-color:#16b777;color:#fff}.layui-checkbox-disabled[lay-skin=primary]>div{background:0 0!important}.layui-form-checked.layui-checkbox-disabled[lay-skin=primary]>i{background:#eee!important;border-color:#eee!important}.layui-checkbox-disabled[lay-skin=primary]:hover>i{border-color:#d2d2d2}.layui-form-item .layui-form-checkbox[lay-skin=primary]{margin-top:10px}.layui-form-checkbox[lay-skin=primary]>.layui-icon-indeterminate{border-color:#16b777}.layui-form-checkbox[lay-skin=primary]>.layui-icon-indeterminate:before{content:'';display:inline-block;vertical-align:middle;position:relative;width:50%;height:1px;margin:-1px auto 0;background-color:#16b777}.layui-form-switch{position:relative;display:inline-block;vertical-align:middle;height:24px;line-height:22px;min-width:44px;padding:0 5px;margin-top:8px;border:1px solid #d2d2d2;border-radius:20px;cursor:pointer;box-sizing:border-box;background-color:#fff;-webkit-transition:.1s linear;transition:.1s linear}.layui-form-switch>i{position:absolute;left:5px;top:3px;width:16px;height:16px;border-radius:20px;background-color:#d2d2d2;-webkit-transition:.1s linear;transition:.1s linear}.layui-form-switch>div{position:relative;top:0;margin-left:21px;padding:0!important;text-align:center!important;color:#999!important;font-style:normal!important;font-size:12px}.layui-form-onswitch{border-color:#16b777;background-color:#16b777}.layui-form-onswitch>i{left:100%;margin-left:-21px;background-color:#fff}.layui-form-onswitch>div{margin-left:0;margin-right:21px;color:#fff!important}.layui-form-checkbox[lay-skin=none] *,.layui-form-radio[lay-skin=none] *{box-sizing:border-box}.layui-form-checkbox[lay-skin=none],.layui-form-radio[lay-skin=none]{position:relative;min-height:20px;margin:0;padding:0;height:auto;line-height:normal}.layui-form-checkbox[lay-skin=none]>div,.layui-form-radio[lay-skin=none]>div{position:relative;top:0;left:0;cursor:pointer;z-index:10;color:inherit;background-color:inherit}.layui-form-checkbox[lay-skin=none]>i,.layui-form-radio[lay-skin=none]>i{display:none}.layui-form-checkbox[lay-skin=none].layui-checkbox-disabled>div,.layui-form-radio[lay-skin=none].layui-radio-disabled>div{cursor:not-allowed}.layui-checkbox-disabled{border-color:#eee!important}.layui-checkbox-disabled>div{color:#c2c2c2!important}.layui-checkbox-disabled>i{border-color:#eee!important}.layui-checkbox-disabled:hover>i{color:#fff!important}.layui-form-checkbox[lay-skin=tag].layui-form-checked.layui-checkbox-disabled>i{color:#c2c2c2}.layui-form-checkbox[lay-skin=tag].layui-form-checked.layui-checkbox-disabled:hover>i{color:#c2c2c2!important}.layui-form-radio{display:inline-block;vertical-align:middle;line-height:28px;margin:6px 10px 0 0;padding-right:10px;cursor:pointer;font-size:0}.layui-form-radio>*{display:inline-block;vertical-align:middle;font-size:14px}.layui-form-radio>i{margin-right:8px;font-size:22px;color:#c2c2c2}.layui-form-radio:hover>*,.layui-form-radioed,.layui-form-radioed>i{color:#16b777}.layui-radio-disabled>i{color:#eee!important}.layui-radio-disabled>*{color:#c2c2c2!important}.layui-form [lay-radio]{display:none}.layui-form-pane .layui-form-label{width:110px;padding:8px 15px;height:38px;line-height:20px;border-width:1px;border-style:solid;border-radius:2px 0 0 2px;text-align:center;background-color:#fafafa;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;box-sizing:border-box}.layui-form-pane .layui-input-inline{margin-left:-1px}.layui-form-pane .layui-input-block{margin-left:110px;left:-1px}.layui-form-pane .layui-input{border-radius:0 2px 2px 0}.layui-form-pane .layui-form-text .layui-form-label{float:none;width:100%;border-radius:2px;box-sizing:border-box;text-align:left}.layui-form-pane .layui-form-text .layui-input-inline{display:block;margin:0;top:-1px;clear:both}.layui-form-pane .layui-form-text .layui-input-block{margin:0;left:0;top:-1px}.layui-form-pane .layui-form-text .layui-textarea{min-height:100px;border-radius:0 0 2px 2px}.layui-form-pane .layui-form-checkbox{margin:4px 0 4px 10px}.layui-form-pane .layui-form-radio,.layui-form-pane .layui-form-switch{margin-top:6px;margin-left:10px}.layui-form-pane .layui-form-item[pane]{position:relative;border-width:1px;border-style:solid}.layui-form-pane .layui-form-item[pane] .layui-form-label{position:absolute;left:0;top:0;height:100%;border-width:0;border-right-width:1px}.layui-form-pane .layui-form-item[pane] .layui-input-inline{margin-left:110px}@media screen and (max-width:450px){.layui-form-item .layui-form-label{text-overflow:ellipsis;overflow:hidden;white-space:nowrap}.layui-form-item .layui-inline{display:block;margin-right:0;margin-bottom:20px;clear:both}.layui-form-item .layui-inline:after{content:'\\20';clear:both;display:block;height:0}.layui-form-item .layui-input-inline{display:block;float:none;left:-3px;width:auto!important;margin:0 0 10px 112px}.layui-form-item .layui-input-inline+.layui-form-mid{margin-left:110px;top:-5px;padding:0}.layui-form-item .layui-form-checkbox{margin-right:5px;margin-bottom:5px}}.layui-laypage{display:inline-block;vertical-align:middle;margin:10px 0;font-size:0}.layui-laypage>a:first-child,.layui-laypage>a:first-child em{border-radius:2px 0 0 2px}.layui-laypage>a:last-child,.layui-laypage>a:last-child em{border-radius:0 2px 2px 0}.layui-laypage>:first-child{margin-left:0!important}.layui-laypage>:last-child{margin-right:0!important}.layui-laypage a,.layui-laypage button,.layui" +
            "-laypage input,.layui-laypage select,.layui-laypage span{border:1px solid #eee}.layui-laypage a,.layui-laypage span{display:inline-block;vertical-align:middle;padding:0 15px;height:28px;line-height:28px;margin:0 -1px 5px 0;background-color:#fff;color:#333;font-size:12px}.layui-laypage a[data-page]{color:#333}.layui-laypage a{text-decoration:none!important;cursor:pointer}.layui-laypage a:hover{color:#16baaa}.layui-laypage em{font-style:normal}.layui-laypage .layui-laypage-spr{color:#999;font-weight:700}.layui-laypage .layui-laypage-curr{position:relative}.layui-laypage .layui-laypage-curr em{position:relative;color:#fff}.layui-laypage .layui-laypage-curr .layui-laypage-em{position:absolute;left:-1px;top:-1px;padding:1px;width:100%;height:100%;background-color:#16baaa}.layui-laypage-em{border-radius:2px}.layui-laypage-next em,.layui-laypage-prev em{font-family:Sim sun;font-size:16px}.layui-laypage .layui-laypage-count,.layui-laypage .layui-laypage-limits,.layui-laypage .layui-laypage-refresh,.layui-laypage .layui-laypage-skip{margin-left:10px;margin-right:10px;padding:0;border:none}.layui-laypage .layui-laypage-limits,.layui-laypage .layui-laypage-refresh{vertical-align:top}.layui-laypage .layui-laypage-refresh i{font-size:18px;cursor:pointer}.layui-laypage select{height:22px;padding:3px;border-radius:2px;cursor:pointer}.layui-laypage .layui-laypage-skip{height:30px;line-height:30px;color:#999}.layui-laypage button,.layui-laypage input{height:30px;line-height:30px;border-radius:2px;vertical-align:top;background-color:#fff;box-sizing:border-box}.layui-laypage input{display:inline-block;width:40px;margin:0 10px;padding:0 3px;text-align:center}.layui-laypage input:focus,.layui-laypage select:focus{border-color:#16baaa!important}.layui-laypage button{margin-left:10px;padding:0 10px;cursor:pointer}.layui-flow-more{margin:10px 0;text-align:center;color:#999;font-size:14px;clear:both}.layui-flow-more a{height:32px;line-height:32px}.layui-flow-more a *{display:inline-block;vertical-align:top}.layui-flow-more a cite{padding:0 20px;border-radius:3px;background-color:#eee;color:#333;font-style:normal}.layui-flow-more a cite:hover{opacity:.8}.layui-flow-more a i{font-size:30px;color:#737383}.layui-table{width:100%;margin:10px 0;background-color:#fff;color:#5f5f5f}.layui-table tr{transition:all .3s;-webkit-transition:all .3s}.layui-table th{text-align:left;font-weight:600}.layui-table-mend{background-color:#fff}.layui-table-click,.layui-table-hover,.layui-table[lay-even] tbody tr:nth-child(even){background-color:#f8f8f8}.layui-table-checked{background-color:#dbfbf0}.layui-table-checked.layui-table-click,.layui-table-checked.layui-table-hover{background-color:#abf8dd}.layui-table-disabled-transition *,.layui-table-disabled-transition :after,.layui-table-disabled-transition :before{-webkit-transition:none!important;-moz-transition:none!important;-o-transition:none!important;-ms-transition:none!important;transition:none!important}.layui-table td,.layui-table th,.layui-table-col-set,.layui-table-fixed-r,.layui-table-grid-down,.layui-table-header,.layui-table-mend,.layui-table-page,.layui-table-tips-main,.layui-table-tool,.layui-table-total,.layui-table-view,.layui-table[lay-skin=line],.layui-table[lay-skin=row]{border-width:1px;border-style:solid;border-color:#eee}.layui-table td,.layui-table th{position:relative;padding:9px 15px;min-height:20px;line-height:20px;font-size:14px}.layui-table[lay-skin=line] td,.layui-table[lay-skin=line] th{border-width:0;border-bottom-width:1px}.layui-table[lay-skin=row] td,.layui-table[lay-skin=row] th{border-width:0;border-right-width:1px}.layui-table[lay-skin=nob] td,.layui-table[lay-skin=nob] th{border:none}.layui-table img{max-width:100px}.layui-table[lay-size=lg] td,.layui-table[lay-size=lg] th{padding-top:15px;padding-right:30px;padding-bottom:15px;padding-left:30px}.layui-table-view .layui-table[lay-size=lg] .layui-table-cell{height:50px;line-height:40px}.layui-table[lay-size=sm] td,.layui-table[lay-size=sm] th{padding-top:5px;padding-right:10px;padding-bottom:5px;padding-left:10px;font-size:12px}.layui-table-view .layui-table[lay-size=sm] .layui-table-cell{height:30px;line-height:20px;padding-top:5px;padding-left:11px;padding-right:11px}.layui-table[lay-data],.layui-table[lay-options]{display:none}.layui-table-box{position:relative;overflow:hidden}.layui-table-view{clear:both;position:relative;border-right:none}.layui-table-view:after{content:\"\";position:absolute;top:0;right:0;width:1px;height:100%;background-color:#eee;z-index:101}.layui-table-view .layui-table{position:relative;width:auto;margin:0;border:0;border-collapse:separate}.layui-table-view .layui-table[lay-skin=line]{border-width:0;border-right-width:1px}.layui-table-view .layui-table[lay-skin=row]{border-width:0;border-bottom-width:1px}.layui-table-view .layui-table td,.layui-table-view .layui-table th{padding:0;border-top:none;border-left:none}.layui-table-view .layui-table th [lay-event],.layui-table-view .layui-table th.layui-unselect .layui-table-cell span{cursor:pointer}.layui-table-view .layui-table td,.layui-table-view .layui-table th span{cursor:default}.layui-table-view .layui-table td[data-edit]{cursor:text}.layui-table-view .layui-table td[data-edit]:hover:after{position:absolute;left:0;top:0;width:100%;height:100%;box-sizing:border-box;border:1px solid #16b777;pointer-events:none;content:\"\"}.layui-table-view .layui-form-checkbox[lay-skin=primary] i{width:18px;height:18px;line-height:16px}.layui-table-view .layui-form-radio{line-height:0;padding:0}.layui-table-view .layui-form-radio>i{margin:0;font-size:20px}.layui-table-init{position:absolute;left:0;top:0;right:0;bottom:0;margin:0;z-index:199;transition:opacity .1s;user-select:none}.layui-table-loading-icon{position:absolute;width:100%\\0;left:50%;left:auto\\0;top:50%;margin-top:-15px\\0;transform:translate(-50%,-50%);transform:none\\0;text-align:center}.layui-table-loading-icon .layui-icon{font-size:30px;color:#c2c2c2}.layui-table-header{border-width:0;border-bottom-width:1px;overflow:hidden}.layui-table-header .layui-table{margin-bottom:-1px}.layui-table-column{position:relative;width:100%;min-height:41px;padding:8px 16px;border-width:0;border-bottom-width:1px}.layui-table-column .layui-btn-container{margin-bottom:-8px}.layui-table-column .layui-btn-container .layui-btn{margin-right:8px;margin-bottom:8px}.layui-table-tool .layui-inline[lay-event]{position:relative;width:26px;height:26px;padding:5px;line-height:16px;margin-right:10px;t" +
            "ext-align:center;color:#333;border:1px solid #ccc;cursor:pointer;-webkit-transition:.5s all;transition:.5s all}.layui-table-tool .layui-inline[lay-event]:hover{border:1px solid #999}.layui-table-tool-temp{padding-right:120px}.layui-table-tool-self{position:absolute;right:17px;top:10px}.layui-table-tool .layui-table-tool-self .layui-inline[lay-event]{margin:0 0 0 10px}.layui-table-tool-panel{position:absolute;top:29px;left:-1px;z-index:399;padding:5px 0!important;min-width:150px;min-height:40px;border:1px solid #d2d2d2;text-align:left;overflow-y:auto;background-color:#fff;box-shadow:0 2px 4px rgba(0,0,0,.12)}.layui-table-tool-panel li{padding:0 10px;margin:0!important;line-height:30px;list-style-type:none!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;-webkit-transition:.5s all;transition:.5s all}.layui-table-tool-panel li .layui-form-checkbox[lay-skin=primary]{width:100%}.layui-table-tool-panel li:hover{background-color:#f8f8f8}.layui-table-tool-panel li .layui-form-checkbox[lay-skin=primary]{padding-left:28px}.layui-table-tool-panel li .layui-form-checkbox[lay-skin=primary] i{position:absolute;left:0;top:0}.layui-table-tool-panel li .layui-form-checkbox[lay-skin=primary] span{padding:0}.layui-table-tool .layui-table-tool-self .layui-table-tool-panel{left:auto;right:-1px}.layui-table-col-set{position:absolute;right:0;top:0;width:20px;height:100%;border-width:0;border-left-width:1px;background-color:#fff}.layui-table-sort{width:10px;height:20px;margin-left:5px;cursor:pointer!important}.layui-table-sort .layui-edge{position:absolute;left:5px;border-width:5px}.layui-table-sort .layui-table-sort-asc{top:3px;border-top:none;border-bottom-style:solid;border-bottom-color:#b2b2b2}.layui-table-sort .layui-table-sort-asc:hover{border-bottom-color:#5f5f5f}.layui-table-sort .layui-table-sort-desc{bottom:5px;border-bottom:none;border-top-style:solid;border-top-color:#b2b2b2}.layui-table-sort .layui-table-sort-desc:hover{border-top-color:#5f5f5f}.layui-table-sort[lay-sort=asc] .layui-table-sort-asc{border-bottom-color:#000}.layui-table-sort[lay-sort=desc] .layui-table-sort-desc{border-top-color:#000}.layui-table-cell{height:38px;line-height:28px;padding:6px 15px;position:relative;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;box-sizing:border-box}.layui-table-cell .layui-form-checkbox[lay-skin=primary]{top:-1px;padding:0}.layui-table-cell .layui-form-checkbox[lay-skin=primary]>div{padding-left:24px}.layui-table-cell .layui-table-link{color:#01aaed}.layui-table-cell .layui-btn{vertical-align:inherit}.layui-table-cell[align=center]{-webkit-box-pack:center}.layui-table-cell[align=right]{-webkit-box-pack:end}.laytable-cell-checkbox,.laytable-cell-numbers,.laytable-cell-radio,.laytable-cell-space{text-align:center;-webkit-box-pack:center}.layui-table-body{position:relative;overflow:auto;margin-bottom:-1px}.layui-table-body .layui-none{line-height:26px;padding:30px 15px;text-align:center;color:#999}.layui-table-fixed{position:absolute;left:0;top:0;z-index:101}.layui-table-fixed .layui-table-body{overflow:hidden}.layui-table-fixed-l{box-shadow:1px 0 8px rgba(0,0,0,.08)}.layui-table-fixed-r{left:auto;right:0;border-width:0;border-left-width:1px;box-shadow:-1px 0 8px rgba(0,0,0,.08)}.layui-table-fixed-r .layui-table-header{position:relative;overflow:visible}.layui-table-mend{position:absolute;right:-49px;top:0;height:100%;width:50px;border-width:0;border-left-width:1px}.layui-table-tool{position:relative;width:100%;min-height:50px;line-height:30px;padding:10px 15px;border-width:0;border-bottom-width:1px}.layui-table-tool .layui-btn-container{margin-bottom:-10px}.layui-table-total{margin-bottom:-1px;border-width:0;border-top-width:1px;overflow:hidden}.layui-table-page{border-width:0;border-top-width:1px;margin-bottom:-1px;white-space:nowrap;overflow:hidden}.layui-table-page>div{height:26px}.layui-table-page .layui-laypage{margin:0}.layui-table-page .layui-laypage a,.layui-table-page .layui-laypage span{height:26px;line-height:26px;margin-bottom:10px;border:none;background:0 0}.layui-table-page .layui-laypage a,.layui-table-page .layui-laypage span.layui-laypage-curr{padding:0 12px}.layui-table-page .layui-laypage span{margin-left:0;padding:0}.layui-table-page .layui-laypage .layui-laypage-prev{margin-left:-11px!important}.layui-table-page .layui-laypage .layui-laypage-curr .layui-laypage-em{left:0;top:0;padding:0}.layui-table-page .layui-laypage button,.layui-table-page .layui-laypage input{height:26px;line-height:26px}.layui-table-page .layui-laypage input{width:40px}.layui-table-page .layui-laypage button{padding:0 10px}.layui-table-page select{height:18px}.layui-table-pagebar{float:right;line-height:23px}.layui-table-pagebar .layui-btn-sm{margin-top:-1px}.layui-table-pagebar .layui-btn-xs{margin-top:2px}.layui-table-view select[lay-ignore]{display:inline-block}.layui-table-patch .layui-table-cell{padding:0;width:30px}.layui-table-edit{position:absolute;left:0;top:0;z-index:189;min-width:100%;min-height:100%;padding:5px 14px;border-radius:0;box-shadow:1px 1px 20px rgba(0,0,0,.15);background-color:#fff}.layui-table-edit:focus{border-color:#16b777!important}input.layui-input.layui-table-edit{height:100%}select.layui-table-edit{padding:0 0 0 10px;border-color:#d2d2d2}.layui-table-view .layui-form-checkbox,.layui-table-view .layui-form-radio,.layui-table-view .layui-form-switch{top:0;margin:0}.layui-table-view .layui-form-checkbox{top:-1px;height:26px;line-height:26px}.layui-table-view .layui-form-checkbox i{height:26px}.layui-table-grid .layui-table-cell{overflow:visible}.layui-table-grid-down{position:absolute;top:0;right:0;width:24px;height:100%;padding:5px 0;border-width:0;border-left-width:1px;text-align:center;background-color:#fff;color:#999;cursor:pointer}.layui-table-grid-down .layui-icon{position:absolute;top:50%;left:50%;margin:-8px 0 0 -8px;font-size:14px}.layui-table-grid-down:hover{background-color:#fbfbfb}.layui-table-expanded{height:95px}.layui-table-expanded .layui-table-cell,.layui-table-view .layui-table[lay-size=lg] .layui-table-expanded .layui-table-cell,.layui-table-view .layui-table[lay-size=sm] .layui-table-expanded .layui-table-cell{height:auto;max-height:94px;white-space:normal;text-overflow:clip}.layui-table-cell-c{position:absolute;bottom:-10px;right:50%;margin-right:-9px;width:20px;height:20px;line-height:18px;cursor:pointer;text-align:center;background-color:#fff;border:1px solid #eee;border-radius:50%;z-index:1000;transition:.3s all;font-si" +
            "ze:14px}.layui-table-cell-c:hover{border-color:#16b777}.layui-table-expanded td:hover .layui-table-cell{overflow:auto}.layui-table-main>.layui-table>tbody>tr:last-child>td>.layui-table-cell-c{bottom:0}body .layui-table-tips .layui-layer-content{background:0 0;padding:0;box-shadow:0 1px 6px rgba(0,0,0,.12)}.layui-table-tips-main{margin:-49px 0 0 -1px;max-height:150px;padding:8px 15px;font-size:14px;overflow-y:scroll;background-color:#fff;color:#5f5f5f}.layui-table-tips-c{position:absolute;right:-3px;top:-13px;width:20px;height:20px;padding:3px;cursor:pointer;background-color:#5f5f5f;border-radius:50%;color:#fff}.layui-table-tips-c:hover{background-color:#777}.layui-table-tips-c:before{position:relative;right:-2px}.layui-table-tree-nodeIcon{max-width:20px}.layui-table-tree-nodeIcon>*{width:100%}.layui-table-tree-flexIcon,.layui-table-tree-nodeIcon{margin-right:2px}.layui-table-tree-flexIcon{cursor:pointer}.layui-upload-file{display:none!important;opacity:.01;filter:Alpha(opacity=1)}.layui-upload-list{margin:11px 0}.layui-upload-choose{max-width:200px;padding:0 10px;color:#999;font-size:14px;text-overflow:ellipsis;overflow:hidden;white-space:nowrap}.layui-upload-drag{position:relative;display:inline-block;padding:30px;border:1px dashed #e2e2e2;background-color:#fff;text-align:center;cursor:pointer;color:#999}.layui-upload-drag .layui-icon{font-size:50px;color:#16baaa}.layui-upload-drag[lay-over]{border-color:#16baaa}.layui-upload-form{display:inline-block}.layui-upload-iframe{position:absolute;width:0;height:0;border:0;visibility:hidden}.layui-upload-wrap{position:relative;display:inline-block;vertical-align:middle}.layui-upload-wrap .layui-upload-file{display:block!important;position:absolute;left:0;top:0;z-index:10;font-size:100px;width:100%;height:100%;opacity:.01;filter:Alpha(opacity=1);cursor:pointer}.layui-btn-container .layui-upload-choose{padding-left:0}.layui-menu{position:relative;margin:5px 0;background-color:#fff;box-sizing:border-box}.layui-menu *{box-sizing:border-box}.layui-menu li,.layui-menu-body-title,.layui-menu-body-title a{padding:5px 15px;color:initial}.layui-menu li{position:relative;margin:0 0 1px;line-height:26px;color:rgba(0,0,0,.8);font-size:14px;white-space:nowrap;cursor:pointer;transition:all .3s}.layui-menu li:hover{background-color:#f8f8f8}.layui-menu li.layui-disabled,.layui-menu li.layui-disabled *{background:0 0!important;color:#d2d2d2!important;cursor:not-allowed!important}.layui-menu-item-parent:hover>.layui-menu-body-panel{display:block;animation-name:layui-fadein;animation-duration:.3s;animation-fill-mode:both;animation-delay:.2s}.layui-menu-item-group>.layui-menu-body-title,.layui-menu-item-parent>.layui-menu-body-title{padding-right:38px}.layui-menu .layui-menu-item-divider:hover,.layui-menu .layui-menu-item-group:hover,.layui-menu .layui-menu-item-none:hover{background:0 0;cursor:default}.layui-menu .layui-menu-item-group>ul{margin:5px 0 -5px}.layui-menu .layui-menu-item-group>.layui-menu-body-title{color:rgba(0,0,0,.35);user-select:none}.layui-menu .layui-menu-item-none{color:rgba(0,0,0,.35);cursor:default}.layui-menu .layui-menu-item-none{text-align:center}.layui-menu .layui-menu-item-divider{margin:5px 0;padding:0;height:0;line-height:0;border-bottom:1px solid #eee;overflow:hidden}.layui-menu .layui-menu-item-down:hover,.layui-menu .layui-menu-item-up:hover{cursor:pointer}.layui-menu .layui-menu-item-up>.layui-menu-body-title{color:rgba(0,0,0,.8)}.layui-menu .layui-menu-item-up>ul{visibility:hidden;height:0;overflow:hidden}.layui-menu .layui-menu-item-down>.layui-menu-body-title>.layui-icon-down{transform:rotate(180deg)}.layui-menu .layui-menu-item-up>.layui-menu-body-title>.layui-icon-up{transform:rotate(-180deg)}.layui-menu .layui-menu-item-down:hover>.layui-menu-body-title>.layui-icon,.layui-menu .layui-menu-item-up>.layui-menu-body-title:hover>.layui-icon{color:#000}.layui-menu .layui-menu-item-down>ul{visibility:visible;height:auto}.layui-menu .layui-menu-item-checked,.layui-menu .layui-menu-item-checked2{background-color:#f8f8f8!important;color:#16b777}.layui-menu .layui-menu-item-checked a,.layui-menu .layui-menu-item-checked2 a{color:#16b777}.layui-menu .layui-menu-item-checked:after{position:absolute;right:-1px;top:0;bottom:0;border-right:3px solid #16b777;content:\"\"}.layui-menu-body-title{position:relative;margin:-5px -15px;overflow:hidden;text-overflow:ellipsis}.layui-menu-body-title a{display:block;margin:-5px -15px;color:rgba(0,0,0,.8)}.layui-menu-body-title a:hover{transition:all .3s}.layui-menu-body-title>.layui-icon{position:absolute;right:15px;top:50%;margin-top:-6px;line-height:normal;font-size:14px;transition:all .2s;-webkit-transition:all .2s}.layui-menu-body-title>.layui-icon:hover{transition:all .3s}.layui-menu-body-title>.layui-icon-right{right:14px}.layui-menu-body-panel{display:none;position:absolute;top:-7px;left:100%;z-index:1000;margin-left:13px;padding:5px 0}.layui-menu-body-panel:before{content:\"\";position:absolute;width:20px;left:-16px;top:0;bottom:0}.layui-menu-body-panel-left{left:auto;right:100%;margin:0 13px 0}.layui-menu-body-panel-left:before{left:auto;right:-16px}.layui-menu-lg li{line-height:32px}.layui-menu-lg .layui-menu-body-title a:hover,.layui-menu-lg li:hover{background:0 0;color:#16b777}.layui-menu-lg li .layui-menu-body-panel{margin-left:14px}.layui-menu-lg li .layui-menu-body-panel-left{margin:0 15px 0}.layui-dropdown{position:absolute;left:-999999px;top:-999999px;z-index:77777777;margin:5px 0;min-width:100px}.layui-dropdown:before{content:\"\";position:absolute;width:100%;height:6px;left:0;top:-6px}.layui-dropdown-shade{top:0;left:0;width:100%;height:100%;position:fixed;pointer-events:auto}.layui-tabs{position:relative}.layui-tabs *{box-sizing:border-box}.layui-tabs.layui-hide-v{overflow:hidden}.layui-tabs-header{position:relative;left:0;height:40px;padding:0!important;white-space:nowrap;font-size:0;transition:all .16s;-webkit-transition:all .16s}.layui-tabs-header:after,.layui-tabs-scroll:after{content:\"\";position:absolute;left:0;bottom:0;z-index:0;width:100%;border-bottom:1px solid #eee}.layui-tabs-header li{position:relative;display:inline-block;vertical-align:middle;line-height:40px;margin:0!important;padding:0 16px;text-align:center;cursor:pointer;font-size:14px;transition:all .16s;-webkit-transition:all .16s}.layui-tabs-header li:first-child{margin-left:0}.layui-tabs-header li a{display:block;padding:0 16px;margin:0 -16px;color:inherit}.layui-tabs-header li a:hover{text-decoration:none" +
            "}.layui-tabs-header .layui-this,.layui-tabs-header li:hover{color:#16baaa}.layui-tabs-header .layui-this:after{content:\"\";position:absolute;left:0;top:0;z-index:1;width:100%;height:100%;border-bottom:3px solid #16baaa;box-sizing:border-box;pointer-events:none}.layui-tabs-header .layui-badge,.layui-tabs-header .layui-badge-dot{left:5px;top:-1px}.layui-tabs-scroll{position:relative;overflow:hidden;padding:0 40px}.layui-tabs-scroll .layui-tabs-header:after{display:none;content:none;border:0}.layui-tabs-bar .layui-icon{position:absolute;left:0;top:0;z-index:3;width:40px;height:100%;line-height:40px;border:1px solid #eee;text-align:center;cursor:pointer;box-sizing:border-box;background-color:#fff;box-shadow:2px 0 5px 0 rgb(0 0 0 / 6%)}.layui-tabs-bar .layui-icon-next{left:auto;right:0;box-shadow:-2px 0 5px 0 rgb(0 0 0 / 6%)}.layui-tabs-header li .layui-tabs-close{position:relative;display:inline-block;width:16px;height:16px;line-height:18px;margin-left:8px;top:0;text-align:center;font-size:12px;color:#959595;border-radius:50%;font-weight:700;transition:all .16s;-webkit-transition:all .16s}.layui-tabs-header li .layui-tabs-close:hover{background-color:#ff5722;color:#fff}.layui-tabs-header li[lay-closable=false] .layui-tabs-close{display:none}.layui-tabs-body{padding:16px 0}.layui-tabs-item{display:none}.layui-tabs-card>.layui-tabs-header .layui-this{background-color:#fff}.layui-tabs-card>.layui-tabs-header .layui-this:after{border:1px solid #eee;border-bottom-color:#fff;border-radius:2px 2px 0 0}.layui-tabs-card>.layui-tabs-header li:first-child.layui-this:after{margin-left:-1px}.layui-tabs-card>.layui-tabs-header li:last-child.layui-this:after{margin-right:-1px}.layui-tabs-card.layui-panel>.layui-tabs-header .layui-this:after{border-top:0;border-radius:0}.layui-tabs-card.layui-panel>.layui-tabs-body{padding:16px}.layui-nav{position:relative;padding:0 15px;background-color:#2f363c;color:#fff;border-radius:2px;font-size:0;box-sizing:border-box}.layui-nav *{font-size:14px}.layui-nav .layui-nav-item{position:relative;display:inline-block;margin-top:0;list-style:none;vertical-align:middle;line-height:60px}.layui-nav .layui-nav-item a{display:block;padding:0 20px;color:#fff;color:rgba(255,255,255,.7);transition:all .3s;-webkit-transition:all .3s}.layui-nav .layui-this:after,.layui-nav-bar{content:\"\";position:absolute;left:0;top:0;width:0;height:3px;background-color:#16b777;transition:all .2s;-webkit-transition:all .2s;pointer-events:none}.layui-nav-bar{z-index:1000}.layui-nav[lay-bar=disabled] .layui-nav-bar{display:none}.layui-nav .layui-nav-item a:hover,.layui-nav .layui-this a{color:#fff;text-decoration:none}.layui-nav .layui-this:after{top:auto;bottom:0;width:100%}.layui-nav-img{width:30px;height:30px;margin-right:10px;border-radius:50%}.layui-nav .layui-nav-more{position:absolute;top:0;right:3px;left:auto!important;margin-top:0;font-size:12px;cursor:pointer;transition:all .2s;-webkit-transition:all .2s}.layui-nav .layui-nav-mored,.layui-nav-itemed>a .layui-nav-more{transform:rotate(180deg)}.layui-nav-child{display:none;position:absolute;left:0;top:65px;min-width:100%;line-height:36px;padding:5px 0;box-shadow:0 2px 4px rgba(0,0,0,.12);border:1px solid #eee;background-color:#fff;z-index:100;border-radius:2px;white-space:nowrap;box-sizing:border-box}.layui-nav .layui-nav-child a{color:#5f5f5f;color:rgba(0,0,0,.8)}.layui-nav .layui-nav-child a:hover{background-color:#f8f8f8;color:rgba(0,0,0,.8)}.layui-nav-child dd{margin:1px 0;position:relative}.layui-nav-child dd.layui-this{background-color:#f8f8f8;color:#000}.layui-nav-child dd.layui-this:after{display:none}.layui-nav-child-r{left:auto;right:0}.layui-nav-child-c{text-align:center}.layui-nav.layui-nav-tree{width:200px;padding:0}.layui-nav-tree .layui-nav-item{display:block;width:100%;line-height:40px}.layui-nav-tree .layui-nav-item a{position:relative;height:40px;line-height:40px;text-overflow:ellipsis;overflow:hidden;white-space:nowrap}.layui-nav-tree .layui-nav-item>a{padding-top:5px;padding-bottom:5px}.layui-nav-tree .layui-nav-more{right:15px}.layui-nav-tree .layui-nav-item>a .layui-nav-more{padding:5px 0}.layui-nav-tree .layui-nav-bar{width:5px;height:0}.layui-side .layui-nav-tree .layui-nav-bar{width:2px}.layui-nav-tree .layui-nav-child dd.layui-this,.layui-nav-tree .layui-nav-child dd.layui-this a,.layui-nav-tree .layui-this,.layui-nav-tree .layui-this>a,.layui-nav-tree .layui-this>a:hover{background-color:#16baaa;color:#fff}.layui-nav-tree .layui-this:after{display:none}.layui-nav-itemed>a,.layui-nav-tree .layui-nav-title a,.layui-nav-tree .layui-nav-title a:hover{color:#fff!important}.layui-nav-tree .layui-nav-bar{background-color:#16baaa}.layui-nav-tree .layui-nav-child{position:relative;z-index:0;top:0;border:none;background:0 0;background-color:rgba(0,0,0,.3);box-shadow:none}.layui-nav-tree .layui-nav-child dd{margin:0}.layui-nav-tree .layui-nav-child a{color:#fff;color:rgba(255,255,255,.7)}.layui-nav-tree .layui-nav-child a:hover{background:0 0;color:#fff}.layui-nav-itemed>.layui-nav-child,.layui-nav-itemed>.layui-nav-child>.layui-this>.layui-nav-child{display:block}.layui-nav-side{position:fixed;top:0;bottom:0;left:0;overflow-x:hidden;z-index:999}.layui-nav-tree.layui-bg-gray a,.layui-nav.layui-bg-gray .layui-nav-item a{color:#373737;color:rgba(0,0,0,.8)}.layui-nav-tree.layui-bg-gray .layui-nav-itemed>a{color:#000!important}.layui-nav.layui-bg-gray .layui-this a{color:#16b777}.layui-nav-tree.layui-bg-gray .layui-nav-child{padding-left:11px;background:0 0}.layui-nav-tree.layui-bg-gray .layui-nav-child dd.layui-this,.layui-nav-tree.layui-bg-gray .layui-nav-child dd.layui-this a,.layui-nav-tree.layui-bg-gray .layui-this,.layui-nav-tree.layui-bg-gray .layui-this>a{background:0 0!important;color:#16b777!important;font-weight:700}.layui-nav-tree.layui-bg-gray .layui-nav-bar{background-color:#16b777}.layui-breadcrumb{visibility:hidden;font-size:0}.layui-breadcrumb>*{font-size:14px}.layui-breadcrumb a{color:#999!important}.layui-breadcrumb a:hover{color:#16b777!important}.layui-breadcrumb a cite{color:#5f5f5f;font-style:normal}.layui-breadcrumb span[lay-separator]{margin:0 10px;color:#999}.layui-tab{margin:10px 0;text-align:left!important}.layui-tab[overflow]>.layui-tab-title{overflow:hidden}.layui-tab .layui-tab-title{position:relative;left:0;height:40px;white-space:nowrap;font-size:0;transition:all .2s;-webkit-transition:all .2s}.layui-tab .layui-tab-title:after{content:\"\";border-bottom-color:#eee;border-bottom-width:1px;border-" +
            "style:none none solid;bottom:0;left:0;right:auto;top:auto;pointer-events:none;position:absolute;width:100%;z-index:8}.layui-tab .layui-tab-title li{display:inline-block;vertical-align:middle;font-size:14px;transition:all .2s;-webkit-transition:all .2s}.layui-tab .layui-tab-title li{position:relative;line-height:40px;min-width:65px;margin:0;padding:0 15px;text-align:center;cursor:pointer}.layui-tab .layui-tab-title li a{display:block;padding:0 15px;margin:0 -15px}.layui-tab-title .layui-this{color:#000}.layui-tab-title .layui-this:after{position:absolute;left:0;top:0;content:\"\";width:100%;height:40px;border-width:1px;border-bottom-width:1px;border-style:solid;border-bottom-color:#fff;border-radius:2px 2px 0 0;box-sizing:border-box;pointer-events:none;z-index:9}.layui-tab-bar{box-sizing:border-box;position:absolute;right:0;top:0;z-index:10;width:30px;height:40px;line-height:40px;border-width:1px;border-style:solid;border-radius:2px;text-align:center;background-color:#fff;cursor:pointer}.layui-tab-bar .layui-icon{position:relative;display:inline-block;top:3px;transition:all .3s;-webkit-transition:all .3s}.layui-tab-item{display:none}.layui-tab-more{padding-right:30px;height:auto!important;white-space:normal!important}.layui-tab-more li.layui-this:after{border-bottom-color:#eee;border-radius:2px}.layui-tab-more .layui-tab-bar .layui-icon{top:-2px;top:3px\\0;-webkit-transform:rotate(180deg);transform:rotate(180deg)}:root .layui-tab-more .layui-tab-bar .layui-icon{top:-2px\\0/IE9}.layui-tab-content{padding:15px 0}.layui-tab-title li .layui-tab-close{position:relative;display:inline-block;width:18px;height:18px;line-height:20px;margin-left:8px;top:1px;text-align:center;font-size:14px;color:#c2c2c2;transition:all .2s;-webkit-transition:all .2s}.layui-tab-title li .layui-tab-close:hover{border-radius:2px;background-color:#ff5722;color:#fff}.layui-tab-brief>.layui-tab-title .layui-this{color:#16baaa}.layui-tab-brief>.layui-tab-more li.layui-this:after,.layui-tab-brief>.layui-tab-title .layui-this:after{border:none;border-radius:0;border-bottom:2px solid #16b777}.layui-tab-card{border-width:1px;border-style:solid;border-radius:2px;box-shadow:0 2px 5px 0 rgba(0,0,0,.1)}.layui-tab-card>.layui-tab-title{background-color:#fafafa}.layui-tab-card>.layui-tab-title li{margin-right:-1px;margin-left:-1px}.layui-tab-card>.layui-tab-title .layui-this{background-color:#fff}.layui-tab-card>.layui-tab-title .layui-this:after{border-top:none;border-width:1px;border-bottom-color:#fff}.layui-tab-card>.layui-tab-title .layui-tab-bar{height:40px;line-height:40px;border-radius:0;border-top:none;border-right:none}.layui-tab-card>.layui-tab-more .layui-this{background:0 0;color:#16b777}.layui-tab-card>.layui-tab-more .layui-this:after{border:none}.layui-timeline{padding-left:5px}.layui-timeline-item{position:relative;padding-bottom:20px}.layui-timeline-axis{position:absolute;left:-5px;top:0;z-index:10;width:20px;height:20px;line-height:20px;background-color:#fff;color:#16b777;border-radius:50%;text-align:center;cursor:pointer}.layui-timeline-axis:hover{color:#ff5722}.layui-timeline-item:before{content:\"\";position:absolute;left:5px;top:0;z-index:0;width:1px;height:100%}.layui-timeline-item:first-child:before{display:block}.layui-timeline-item:last-child:before{display:none}.layui-timeline-content{padding-left:25px}.layui-timeline-title{position:relative;margin-bottom:10px;line-height:22px}.layui-badge,.layui-badge-dot,.layui-badge-rim{position:relative;display:inline-block;padding:0 6px;font-size:12px;text-align:center;background-color:#ff5722;color:#fff;border-radius:2px}.layui-badge{height:18px;line-height:18px}.layui-badge-dot{width:8px;height:8px;padding:0;border-radius:50%}.layui-badge-rim{height:18px;line-height:18px;border-width:1px;border-style:solid;background-color:#fff;color:#5f5f5f}.layui-btn .layui-badge,.layui-btn .layui-badge-dot{margin-left:5px}.layui-nav .layui-badge,.layui-nav .layui-badge-dot{position:absolute;top:50%;margin:-5px 6px 0}.layui-nav .layui-badge{margin-top:-10px}.layui-tab-title .layui-badge,.layui-tab-title .layui-badge-dot{left:5px;top:-2px}.layui-carousel{position:relative;left:0;top:0;background-color:#f8f8f8}.layui-carousel>[carousel-item]{position:relative;width:100%;height:100%;overflow:hidden}.layui-carousel>[carousel-item]:before{position:absolute;content:'\\e63d';left:50%;top:50%;width:100px;line-height:20px;margin:-10px 0 0 -50px;text-align:center;color:#c2c2c2;font-family:layui-icon!important;font-size:30px;font-style:normal;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}.layui-carousel>[carousel-item]>*{display:none;position:absolute;left:0;top:0;width:100%;height:100%;background-color:#f8f8f8;transition-duration:.3s;-webkit-transition-duration:.3s}.layui-carousel-updown>*{-webkit-transition:.3s ease-in-out up;transition:.3s ease-in-out up}.layui-carousel-arrow{display:none\\0;opacity:0;position:absolute;left:10px;top:50%;margin-top:-18px;width:36px;height:36px;line-height:36px;text-align:center;font-size:20px;border:none 0;border-radius:50%;background-color:rgba(0,0,0,.2);color:#fff;-webkit-transition-duration:.3s;transition-duration:.3s;cursor:pointer}.layui-carousel-arrow[lay-type=add]{left:auto!important;right:10px}.layui-carousel[lay-arrow=always] .layui-carousel-arrow{opacity:1;left:20px}.layui-carousel[lay-arrow=always] .layui-carousel-arrow[lay-type=add]{right:20px}.layui-carousel[lay-arrow=none] .layui-carousel-arrow{display:none}.layui-carousel-arrow:hover,.layui-carousel-ind ul:hover{background-color:rgba(0,0,0,.35)}.layui-carousel:hover .layui-carousel-arrow{display:block\\0;opacity:1;left:20px}.layui-carousel:hover .layui-carousel-arrow[lay-type=add]{right:20px}.layui-carousel-ind{position:relative;top:-35px;width:100%;line-height:0!important;text-align:center;font-size:0}.layui-carousel[lay-indicator=outside]{margin-bottom:30px}.layui-carousel[lay-indicator=outside] .layui-carousel-ind{top:10px}.layui-carousel[lay-indicator=outside] .layui-carousel-ind ul{background-color:rgba(0,0,0,.5)}.layui-carousel[lay-indicator=none] .layui-carousel-ind{display:none}.layui-carousel-ind ul{display:inline-block;padding:5px;background-color:rgba(0,0,0,.2);border-radius:10px;-webkit-transition-duration:.3s;transition-duration:.3s}.layui-carousel-ind ul li{display:inline-block;width:10px;height:10px;margin:0 3px;font-size:14px;background-color:#eee;background-color:rgba(255,255,255,.5);border-radius:50%;cursor:pointer;-webkit-transition-duration:.3s;tra" +
            "nsition-duration:.3s}.layui-carousel-ind ul li:hover{background-color:rgba(255,255,255,.7)}.layui-carousel-ind ul li.layui-this{background-color:#fff}.layui-carousel>[carousel-item]>.layui-carousel-next,.layui-carousel>[carousel-item]>.layui-carousel-prev,.layui-carousel>[carousel-item]>.layui-this{display:block}.layui-carousel>[carousel-item]>.layui-this{left:0}.layui-carousel>[carousel-item]>.layui-carousel-prev{left:-100%}.layui-carousel>[carousel-item]>.layui-carousel-next{left:100%}.layui-carousel>[carousel-item]>.layui-carousel-next.layui-carousel-left,.layui-carousel>[carousel-item]>.layui-carousel-prev.layui-carousel-right{left:0}.layui-carousel>[carousel-item]>.layui-this.layui-carousel-left{left:-100%}.layui-carousel>[carousel-item]>.layui-this.layui-carousel-right{left:100%}.layui-carousel[lay-anim=updown] .layui-carousel-arrow{left:50%!important;top:20px;margin:0 0 0 -18px}.layui-carousel[lay-anim=updown] .layui-carousel-arrow[lay-type=add]{top:auto!important;bottom:20px}.layui-carousel[lay-anim=updown] .layui-carousel-ind{position:absolute;top:50%;right:20px;width:auto;height:auto}.layui-carousel[lay-anim=updown] .layui-carousel-ind ul{padding:3px 5px}.layui-carousel[lay-anim=updown] .layui-carousel-ind li{display:block;margin:6px 0}.layui-carousel[lay-anim=updown]>[carousel-item]>*{left:0!important}.layui-carousel[lay-anim=updown]>[carousel-item]>.layui-this{top:0}.layui-carousel[lay-anim=updown]>[carousel-item]>.layui-carousel-prev{top:-100%}.layui-carousel[lay-anim=updown]>[carousel-item]>.layui-carousel-next{top:100%}.layui-carousel[lay-anim=updown]>[carousel-item]>.layui-carousel-next.layui-carousel-left,.layui-carousel[lay-anim=updown]>[carousel-item]>.layui-carousel-prev.layui-carousel-right{top:0}.layui-carousel[lay-anim=updown]>[carousel-item]>.layui-this.layui-carousel-left{top:-100%}.layui-carousel[lay-anim=updown]>[carousel-item]>.layui-this.layui-carousel-right{top:100%}.layui-carousel[lay-anim=fade]>[carousel-item]>*{left:0!important}.layui-carousel[lay-anim=fade]>[carousel-item]>.layui-carousel-next,.layui-carousel[lay-anim=fade]>[carousel-item]>.layui-carousel-prev{opacity:0}.layui-carousel[lay-anim=fade]>[carousel-item]>.layui-carousel-next.layui-carousel-left,.layui-carousel[lay-anim=fade]>[carousel-item]>.layui-carousel-prev.layui-carousel-right{opacity:1}.layui-carousel[lay-anim=fade]>[carousel-item]>.layui-this.layui-carousel-left,.layui-carousel[lay-anim=fade]>[carousel-item]>.layui-this.layui-carousel-right{opacity:0}.layui-fixbar{position:fixed;right:16px;bottom:16px;z-index:999999}.layui-fixbar li{width:50px;height:50px;line-height:50px;margin-bottom:1px;text-align:center;cursor:pointer;font-size:30px;background-color:#9f9f9f;color:#fff;border-radius:2px;opacity:.95}.layui-fixbar li:hover{opacity:.85}.layui-fixbar li:active{opacity:1}.layui-fixbar .layui-fixbar-top{display:none;font-size:40px}body .layui-util-face{border:none;background:0 0}body .layui-util-face .layui-layer-content{padding:0;background-color:#fff;color:#5f5f5f;box-shadow:none}.layui-util-face .layui-layer-TipsG{display:none}.layui-util-face ul{position:relative;width:372px;padding:10px;border:1px solid #d9d9d9;background-color:#fff;box-shadow:0 0 20px rgba(0,0,0,.2)}.layui-util-face ul li{cursor:pointer;float:left;border:1px solid #e8e8e8;height:22px;width:26px;overflow:hidden;margin:-1px 0 0 -1px;padding:4px 2px;text-align:center}.layui-util-face ul li:hover{position:relative;z-index:2;border:1px solid #eb7350;background:#fff9ec}.layui-code{display:block;position:relative;padding:15px;line-height:20px;border:1px solid #eee;border-left-width:6px;background-color:#fff;color:#333;font-family:\"Courier New\",Consolas,\"Lucida Console\",monospace;font-size:12px}.layui-transfer-box,.layui-transfer-header,.layui-transfer-search{border-width:0;border-style:solid;border-color:#eee}.layui-transfer-box{position:relative;display:inline-block;vertical-align:middle;border-width:1px;width:200px;height:360px;border-radius:2px;background-color:#fff}.layui-transfer-box .layui-form-checkbox{width:100%;margin:0!important}.layui-transfer-header{height:38px;line-height:38px;padding:0 11px;border-bottom-width:1px}.layui-transfer-search{position:relative;padding:11px;border-bottom-width:1px}.layui-transfer-search .layui-input{height:32px;padding-left:30px;font-size:12px}.layui-transfer-search .layui-icon-search{position:absolute;left:20px;top:50%;line-height:normal;margin-top:-8px;color:#5f5f5f}.layui-transfer-active{margin:0 15px;display:inline-block;vertical-align:middle}.layui-transfer-active .layui-btn{display:block;margin:0;padding:0 15px;background-color:#16b777;border-color:#16b777;color:#fff}.layui-transfer-active .layui-btn-disabled{background-color:#fbfbfb;border-color:#eee;color:#d2d2d2}.layui-transfer-active .layui-btn:first-child{margin-bottom:15px}.layui-transfer-active .layui-btn .layui-icon{margin:0;font-size:14px!important}.layui-transfer-data{padding:5px 0;overflow:auto}.layui-transfer-data li{height:32px;line-height:32px;margin-top:0!important;padding:0 11px;list-style-type:none!important}.layui-transfer-data li:hover{background-color:#f8f8f8;transition:.5s all}.layui-transfer-data .layui-none{padding:15px 11px;text-align:center;color:#999}.layui-rate,.layui-rate *{display:inline-block;vertical-align:middle}.layui-rate{padding:11px 6px 11px 0;font-size:0}.layui-rate li{margin-top:0!important}.layui-rate li i.layui-icon{font-size:20px;color:#ffb800}.layui-rate li i.layui-icon{margin-right:5px;transition:all .3s;-webkit-transition:all .3s}.layui-rate li i:hover,.layui-rate-hover{cursor:pointer;transform:scale(1.12);-webkit-transform:scale(1.12)}.layui-rate[readonly] li i:hover{cursor:default;transform:scale(1)}.layui-colorpicker{width:38px;height:38px;border:1px solid #eee;padding:5px;border-radius:2px;line-height:24px;display:inline-block;cursor:pointer;transition:all .3s;-webkit-transition:all .3s;box-sizing:border-box}.layui-colorpicker:hover{border-color:#d2d2d2}.layui-colorpicker.layui-colorpicker-lg{width:44px;height:44px;line-height:30px}.layui-colorpicker.layui-colorpicker-sm{width:30px;height:30px;line-height:20px;padding:3px}.layui-colorpicker.layui-colorpicker-xs{width:22px;height:22px;line-height:16px;padding:1px}.layui-colorpicker-trigger-bgcolor{display:block;background:url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAIAAADZF8uwAAAAGUlEQVQYV2M4gwH+YwCGIasIUwhT25BVBADtzYNYrHvv4gAAAABJRU5ErkJggg==);border-radius:2px}.layui-colorpicker-trigger-span{display:bloc" +
            "k;height:100%;box-sizing:border-box;border:1px solid rgba(0,0,0,.15);border-radius:2px;text-align:center}.layui-colorpicker-trigger-i{display:inline-block;color:#fff;font-size:12px}.layui-colorpicker-trigger-i.layui-icon-close{color:#999}.layui-colorpicker-main{position:absolute;left:-999999px;top:-999999px;z-index:77777777;width:280px;margin:5px 0;padding:7px;background:#fff;border:1px solid #d2d2d2;border-radius:2px;box-shadow:0 2px 4px rgba(0,0,0,.12)}.layui-colorpicker-main-wrapper{height:180px;position:relative}.layui-colorpicker-basis{width:260px;height:100%;position:relative;overflow:hidden}.layui-colorpicker-basis-white{width:100%;height:100%;position:absolute;top:0;left:0;background:linear-gradient(90deg,#fff,hsla(0,0%,100%,0))}.layui-colorpicker-basis-black{width:100%;height:100%;position:absolute;top:0;left:0;background:linear-gradient(0deg,#000,transparent)}.layui-colorpicker-basis-cursor{width:10px;height:10px;border:1px solid #fff;border-radius:50%;position:absolute;top:0;right:100%;cursor:pointer;transform:translate(-50%,-50%)}.layui-colorpicker-side{position:absolute;top:0;right:0;width:12px;height:100%;background:linear-gradient(red,#ff0,#0f0,#0ff,#00f,#f0f,red)}.layui-colorpicker-side-slider{width:100%;height:5px;box-shadow:0 0 1px #888;box-sizing:border-box;background:#fff;border-radius:1px;border:1px solid #f0f0f0;cursor:pointer;position:absolute;left:0}.layui-colorpicker-main-alpha{display:none;height:12px;margin-top:7px;background:url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAIAAADZF8uwAAAAGUlEQVQYV2M4gwH+YwCGIasIUwhT25BVBADtzYNYrHvv4gAAAABJRU5ErkJggg==)}.layui-colorpicker-alpha-bgcolor{height:100%;position:relative}.layui-colorpicker-alpha-slider{width:5px;height:100%;box-shadow:0 0 1px #888;box-sizing:border-box;background:#fff;border-radius:1px;border:1px solid #f0f0f0;cursor:pointer;position:absolute;top:0}.layui-colorpicker-main-pre{padding-top:7px;font-size:0}.layui-colorpicker-pre{width:20px;height:20px;border-radius:2px;display:inline-block;margin-left:6px;margin-bottom:7px;cursor:pointer}.layui-colorpicker-pre:nth-child(11n+1){margin-left:0}.layui-colorpicker-pre-isalpha{background:url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAIAAADZF8uwAAAAGUlEQVQYV2M4gwH+YwCGIasIUwhT25BVBADtzYNYrHvv4gAAAABJRU5ErkJggg==)}.layui-colorpicker-pre.layui-this{box-shadow:0 0 3px 2px rgba(0,0,0,.15)}.layui-colorpicker-pre>div{height:100%;border-radius:2px}.layui-colorpicker-main-input{text-align:right;padding-top:7px}.layui-colorpicker-main-input .layui-btn-container .layui-btn{margin:0 0 0 10px}.layui-colorpicker-main-input div.layui-inline{float:left;font-size:14px}.layui-colorpicker-main-input input.layui-input{width:168px;height:30px;color:#5f5f5f;padding-left:5px}.layui-slider{height:4px;background:#eee;border-radius:3px;position:relative;cursor:pointer}.layui-slider-bar{border-radius:3px;position:absolute;height:100%}.layui-slider-step{position:absolute;top:0;width:4px;height:4px;border-radius:50%;background:#fff;-webkit-transform:translateX(-50%);transform:translateX(-50%)}.layui-slider-wrap{width:36px;height:36px;position:absolute;top:-16px;-webkit-transform:translateX(-50%);transform:translateX(-50%);z-index:10;text-align:center}.layui-slider-wrap-btn{width:12px;height:12px;border-radius:50%;background:#fff;display:inline-block;vertical-align:middle;cursor:pointer;transition:.3s}.layui-slider-wrap:after{content:\"\";height:100%;display:inline-block;vertical-align:middle}.layui-slider-wrap-btn.layui-slider-hover,.layui-slider-wrap-btn:hover{transform:scale(1.2)}.layui-slider-wrap-btn.layui-disabled:hover{transform:scale(1)!important}.layui-slider-tips{position:absolute;top:-42px;z-index:77777777;white-space:nowrap;-webkit-transform:translateX(-50%);transform:translateX(-50%);color:#fff;background:#000;border-radius:3px;height:25px;line-height:25px;padding:0 10px}.layui-slider-tips:after{content:\"\";position:absolute;bottom:-12px;left:50%;margin-left:-6px;width:0;height:0;border-width:6px;border-style:solid;border-color:#000 transparent transparent transparent}.layui-slider-input{width:70px;height:32px;border:1px solid #eee;border-radius:3px;font-size:16px;line-height:32px;position:absolute;right:0;top:-14px;box-sizing:border-box}.layui-slider-input-btn{position:absolute;top:0;right:0;width:20px;height:100%;border-left:1px solid #eee}.layui-slider-input-btn i{cursor:pointer;position:absolute;right:0;bottom:0;width:20px;height:50%;font-size:12px;line-height:16px;text-align:center;color:#999}.layui-slider-input-btn i:first-child{top:0;border-bottom:1px solid #eee}.layui-slider-input-txt{height:100%;font-size:14px}.layui-slider-input-txt input{height:100%;border:none;padding-right:21px}.layui-slider-input-btn i:hover{color:#16baaa}.layui-slider-vertical{width:4px;margin-left:33px}.layui-slider-vertical .layui-slider-bar{width:4px}.layui-slider-vertical .layui-slider-step{top:auto;left:0;-webkit-transform:translateY(50%);transform:translateY(50%)}.layui-slider-vertical .layui-slider-wrap{top:auto;left:-16px;-webkit-transform:translateY(50%);transform:translateY(50%)}.layui-slider-vertical .layui-slider-tips{top:auto;left:2px}@media \\0screen{.layui-slider-wrap-btn{margin-left:-20px}.layui-slider-vertical .layui-slider-wrap-btn{margin-left:0;margin-bottom:-20px}.layui-slider-vertical .layui-slider-tips{margin-left:-8px}.layui-slider>span{margin-left:8px}}.layui-tree{line-height:22px}.layui-tree .layui-form-checkbox{margin:0!important}.layui-tree-set{width:100%;position:relative}.layui-tree-pack{display:none;padding-left:20px;position:relative}.layui-tree-line .layui-tree-pack{padding-left:27px}.layui-tree-line .layui-tree-set .layui-tree-set:after{content:\"\";position:absolute;top:14px;left:-9px;width:17px;height:0;border-top:1px dotted #c0c4cc}.layui-tree-entry{position:relative;padding:3px 0;height:26px;white-space:nowrap}.layui-tree-entry:hover{background-color:#eee}.layui-tree-line .layui-tree-entry:hover{background-color:rgba(0,0,0,0)}.layui-tree-line .layui-tree-entry:hover .layui-tree-txt{color:#999;text-decoration:underline;transition:.3s}.layui-tree-main{display:inline-block;vertical-align:middle;cursor:pointer;padding-right:10px}.layui-tree-line .layui-tree-set:before{content:\"\";position:absolute;top:0;left:-9px;width:0;height:100%;border-left:1px dotted #c0c4cc}.layui-tree-line .layui-tree-set.layui-tree-setLineShort:before{height:13px}.layui-tree-line .layui-tree-set.layui-tree-setHide:before{height:0}.layui-tree-iconClick{display:in" +
            "line-block;vertical-align:middle;position:relative;height:20px;line-height:20px;margin:0 10px;color:#c0c4cc}.layui-tree-icon{height:14px;line-height:12px;width:14px;text-align:center;border:1px solid #c0c4cc}.layui-tree-iconClick .layui-icon{font-size:18px}.layui-tree-icon .layui-icon{font-size:12px;color:#5f5f5f}.layui-tree-iconArrow{padding:0 5px}.layui-tree-iconArrow:after{content:\"\";position:absolute;left:4px;top:3px;z-index:100;width:0;height:0;border-width:5px;border-style:solid;border-color:transparent transparent transparent #c0c4cc;transition:.5s}.layui-tree-spread>.layui-tree-entry .layui-tree-iconClick>.layui-tree-iconArrow:after{transform:rotate(90deg) translate(3px,4px)}.layui-tree-txt{display:inline-block;vertical-align:middle;color:#555}.layui-tree-search{margin-bottom:15px;color:#5f5f5f}.layui-tree-btnGroup{visibility:hidden;display:inline-block;vertical-align:middle;position:relative}.layui-tree-btnGroup .layui-icon{display:inline-block;vertical-align:middle;padding:0 2px;cursor:pointer}.layui-tree-btnGroup .layui-icon:hover{color:#999;transition:.3s}.layui-tree-entry:hover .layui-tree-btnGroup{visibility:visible}.layui-tree-editInput{position:relative;display:inline-block;vertical-align:middle;height:20px;line-height:20px;padding:0;border:none;background-color:rgba(0,0,0,.05)}.layui-tree-emptyText{text-align:center;color:#999}.layui-anim{-webkit-animation-duration:.3s;-webkit-animation-fill-mode:both;animation-duration:.3s;animation-fill-mode:both}.layui-anim.layui-icon{display:inline-block}.layui-anim-loop{-webkit-animation-iteration-count:infinite;animation-iteration-count:infinite}.layui-trans,.layui-trans a{transition:all .2s;-webkit-transition:all .2s}@-webkit-keyframes layui-rotate{from{-webkit-transform:rotate(0)}to{-webkit-transform:rotate(360deg)}}@keyframes layui-rotate{from{transform:rotate(0)}to{transform:rotate(360deg)}}.layui-anim-rotate{-webkit-animation-name:layui-rotate;animation-name:layui-rotate;-webkit-animation-duration:1s;animation-duration:1s;-webkit-animation-timing-function:linear;animation-timing-function:linear}@-webkit-keyframes layui-up{from{-webkit-transform:translate3d(0,100%,0);opacity:.3}to{-webkit-transform:translate3d(0,0,0);opacity:1}}@keyframes layui-up{from{transform:translate3d(0,100%,0);opacity:.3}to{transform:translate3d(0,0,0);opacity:1}}.layui-anim-up{-webkit-animation-name:layui-up;animation-name:layui-up}@-webkit-keyframes layui-upbit{from{-webkit-transform:translate3d(0,15px,0);opacity:.3}to{-webkit-transform:translate3d(0,0,0);opacity:1}}@keyframes layui-upbit{from{transform:translate3d(0,15px,0);opacity:.3}to{transform:translate3d(0,0,0);opacity:1}}.layui-anim-upbit{-webkit-animation-name:layui-upbit;animation-name:layui-upbit}@keyframes layui-down{0%{opacity:.3;transform:translate3d(0,-100%,0)}100%{opacity:1;transform:translate3d(0,0,0)}}.layui-anim-down{animation-name:layui-down}@keyframes layui-downbit{0%{opacity:.3;transform:translate3d(0,-5px,0)}100%{opacity:1;transform:translate3d(0,0,0)}}.layui-anim-downbit{animation-name:layui-downbit}@-webkit-keyframes layui-scale{0%{opacity:.3;-webkit-transform:scale(.5)}100%{opacity:1;-webkit-transform:scale(1)}}@keyframes layui-scale{0%{opacity:.3;-ms-transform:scale(.5);transform:scale(.5)}100%{opacity:1;-ms-transform:scale(1);transform:scale(1)}}.layui-anim-scale{-webkit-animation-name:layui-scale;animation-name:layui-scale}@-webkit-keyframes layui-scale-spring{0%{opacity:.5;-webkit-transform:scale(.5)}80%{opacity:.8;-webkit-transform:scale(1.1)}100%{opacity:1;-webkit-transform:scale(1)}}@keyframes layui-scale-spring{0%{opacity:.5;transform:scale(.5)}80%{opacity:.8;transform:scale(1.1)}100%{opacity:1;transform:scale(1)}}.layui-anim-scaleSpring{-webkit-animation-name:layui-scale-spring;animation-name:layui-scale-spring}@keyframes layui-scalesmall{0%{opacity:.3;transform:scale(1.5)}100%{opacity:1;transform:scale(1)}}.layui-anim-scalesmall{animation-name:layui-scalesmall}@keyframes layui-scalesmall-spring{0%{opacity:.3;transform:scale(1.5)}80%{opacity:.8;transform:scale(.9)}100%{opacity:1;transform:scale(1)}}.layui-anim-scalesmall-spring{animation-name:layui-scalesmall-spring}@-webkit-keyframes layui-fadein{0%{opacity:0}100%{opacity:1}}@keyframes layui-fadein{0%{opacity:0}100%{opacity:1}}.layui-anim-fadein{-webkit-animation-name:layui-fadein;animation-name:layui-fadein}@-webkit-keyframes layui-fadeout{0%{opacity:1}100%{opacity:0}}@keyframes layui-fadeout{0%{opacity:1}100%{opacity:0}}.layui-anim-fadeout{-webkit-animation-name:layui-fadeout;animation-name:layui-fadeout}html #layuicss-skincodecss{display:none;position:absolute;width:1989px}.layui-code-wrap{font-size:13px;font-family:\"Courier New\",Consolas,\"Lucida Console\",monospace}.layui-code-view{display:block;position:relative;padding:0!important;border:1px solid #eee;border-left-width:6px;background-color:#fff;color:#333}.layui-code-view pre{margin:0!important}.layui-code-header{position:relative;z-index:3;padding:0 11px;height:40px;line-height:40px;border-bottom:1px solid #eee;background-color:#fafafa;font-size:12px}.layui-code-header>.layui-code-header-about{position:absolute;right:11px;top:0;color:#b7b7b7}.layui-code-header-about>a{padding-left:10px}.layui-code-wrap{position:relative;display:block;z-index:1;margin:0!important;padding:11px 0!important;overflow-x:hidden;overflow-y:auto}.layui-code-line{position:relative;line-height:19px;margin:0!important}.layui-code-line-number{position:absolute;left:0;top:0;padding:0 8px;min-width:45px;height:100%;text-align:right;user-select:none;white-space:nowrap;overflow:hidden}.layui-code-line-content{padding:0 11px;word-wrap:break-word;white-space:pre-wrap}.layui-code-ln-mode>.layui-code-wrap>.layui-code-line{padding-left:45px}.layui-code-ln-side{position:absolute;left:0;top:0;bottom:0;z-index:0;width:45px;border-right:1px solid #eee;border-color:rgb(126 122 122 / 15%);background-color:#fafafa;pointer-events:none}.layui-code-nowrap>.layui-code-wrap{overflow:auto}.layui-code-nowrap>.layui-code-wrap>.layui-code-line>.layui-code-line-content{white-space:pre;word-wrap:normal}.layui-code-nowrap>.layui-code-ln-side{border-right-width:0!important;background:0 0!important}.layui-code-fixbar{position:absolute;top:8px;right:11px;padding-right:45px;z-index:5}.layui-code-fixbar>span{position:absolute;right:0;top:0;padding:0 8px;color:#777;transition:all .3s}.layui-code-fixbar>span:hover{color:#16b777}.layui-code-copy{display:none;cursor:pointer}.layui-code-preview>.layui-code-view>.layui" +
            "-code-fixbar .layui-code-copy{display:none!important}.layui-code-view:hover>.layui-code-fixbar .layui-code-copy{display:block}.layui-code-view:hover>.layui-code-fixbar .layui-code-lang-marker{display:none}.layui-code-theme-dark,.layui-code-theme-dark>.layui-code-header{border-color:rgb(126 122 122 / 15%);background-color:#1f1f1f}.layui-code-theme-dark{border-width:1px;color:#ccc}.layui-code-theme-dark>.layui-code-ln-side{border-right-color:#2a2a2a;background:0 0;color:#6e7681}.layui-code textarea{display:none}.layui-code-preview>.layui-code,.layui-code-preview>.layui-code-view{margin:0}.layui-code-preview>.layui-tab{position:relative;z-index:1;margin-bottom:0}.layui-code-preview .layui-code-item{display:none;border-top-width:0}.layui-code-item-preview{position:relative;padding:16px}.layui-code-item-preview>iframe{position:absolute;top:0;left:0;width:100%;height:100%;border:none}.layui-code-tools{position:absolute;right:11px;top:8px;line-height:normal}.layui-code-tools>i{display:inline-block;margin-left:6px;padding:3px;cursor:pointer}.layui-code-tools>i.layui-icon-file-b{color:#999}.layui-code-tools>i:hover{color:#16b777}.layui-code-full{position:fixed;left:0;top:0;z-index:1111111;width:100%;height:100%;background-color:#fff}.layui-code-full .layui-code-item{width:100%!important;border-width:0!important}.layui-code-full .layui-code-item,.layui-code-full .layui-code-view,.layui-code-full .layui-code-wrap{height:calc(100vh - 51px)!important;box-sizing:border-box}.layui-code-full .layui-code-item-preview{overflow:auto}.layui-code-view.layui-code-hl{line-height:20px!important;border-left-width:1px}.layui-code-view.layui-code-hl>.layui-code-ln-side{background-color:transparent}.layui-code-theme-dark.layui-code-hl,.layui-code-theme-dark.layui-code-hl>.layui-code-ln-side{border-color:rgb(126 122 122 / 15%)}html #layuicss-laydate{display:none;position:absolute;width:1989px}.layui-laydate *{margin:0;padding:0}.layui-laydate,.layui-laydate *{box-sizing:border-box}.layui-laydate{position:absolute;z-index:99999999;margin:5px 0;border-radius:2px;font-size:14px;line-height:normal;-webkit-animation-duration:.2s;animation-duration:.2s;-webkit-animation-fill-mode:both;animation-fill-mode:both}.layui-laydate-main{width:272px}.layui-laydate-content td,.layui-laydate-header *,.layui-laydate-list li{transition-duration:.3s;-webkit-transition-duration:.3s}.layui-laydate-shade{top:0;left:0;width:100%;height:100%;_height:expression(document.body.offsetHeight+\"px\");position:fixed;_position:absolute;pointer-events:auto}@keyframes laydate-downbit{0%{opacity:.3;transform:translate3d(0,-5px,0)}100%{opacity:1;transform:translate3d(0,0,0)}}.layui-laydate{animation-name:laydate-downbit}.layui-laydate-static{position:relative;z-index:0;display:inline-block;margin:0;-webkit-animation:none;animation:none}.laydate-ym-show .laydate-next-m,.laydate-ym-show .laydate-prev-m{display:none!important}.laydate-ym-show .laydate-next-y,.laydate-ym-show .laydate-prev-y{display:inline-block!important}.laydate-ym-show .laydate-set-ym span[lay-type=month]{display:none!important}.laydate-time-show .laydate-set-ym span[lay-type=month],.laydate-time-show .laydate-set-ym span[lay-type=year],.laydate-time-show .layui-laydate-header .layui-icon{display:none!important}.layui-laydate-header{position:relative;line-height:30px;padding:10px 70px 5px}.layui-laydate-header *{display:inline-block;vertical-align:bottom}.layui-laydate-header i{position:absolute;top:10px;padding:0 5px;color:#999;font-size:18px;cursor:pointer}.layui-laydate-header i.laydate-prev-y{left:15px}.layui-laydate-header i.laydate-prev-m{left:45px}.layui-laydate-header i.laydate-next-y{right:15px}.layui-laydate-header i.laydate-next-m{right:45px}.laydate-set-ym{width:100%;text-align:center;box-sizing:border-box;text-overflow:ellipsis;overflow:hidden;white-space:nowrap}.laydate-set-ym span{padding:0 10px;cursor:pointer}.laydate-time-text{cursor:default!important}.layui-laydate-content{position:relative;padding:10px;-moz-user-select:none;-webkit-user-select:none;-ms-user-select:none}.layui-laydate-content table{border-collapse:collapse;border-spacing:0}.layui-laydate-content td,.layui-laydate-content th{width:36px;height:30px;padding:0;text-align:center}.layui-laydate-content th{font-weight:400}.layui-laydate-content td{position:relative;cursor:pointer}.laydate-day-mark{position:absolute;left:0;top:0;width:100%;line-height:30px;font-size:12px;overflow:hidden}.laydate-day-mark::after{position:absolute;content:'';right:2px;top:2px;width:5px;height:5px;border-radius:50%}.laydate-day-holidays:before{position:absolute;left:0;top:0;font-size:12px;transform:scale(.7)}.laydate-day-holidays:before{content:'\\4F11';color:#ff5722}.laydate-day-holidays[type=workdays]:before{content:'\\73ED';color:inherit}.layui-laydate .layui-this .laydate-day-holidays:before{color:#fff}.layui-laydate-footer{position:relative;height:46px;line-height:26px;padding:10px}.layui-laydate-footer span{display:inline-block;vertical-align:top;height:26px;line-height:24px;padding:0 10px;border:1px solid #c9c9c9;border-radius:2px;background-color:#fff;font-size:12px;cursor:pointer;white-space:nowrap;transition:all .3s}.layui-laydate-footer span:hover{color:#16b777}.layui-laydate-footer span.layui-laydate-preview{cursor:default;border-color:transparent!important}.layui-laydate-footer span.layui-laydate-preview:hover{color:#777}.layui-laydate-footer span:first-child.layui-laydate-preview{padding-left:0}.laydate-footer-btns{position:absolute;right:10px;top:10px}.laydate-footer-btns span{margin:0 0 0 -1px;border-radius:0}.laydate-footer-btns span:first-child{border-radius:2px 0 0 2px}.laydate-footer-btns span:last-child{border-radius:0 2px 2px 0}.layui-laydate-shortcut{width:80px;padding:6px 0;display:inline-block;vertical-align:top;overflow:auto;max-height:276px;text-align:center}.layui-laydate-shortcut+.layui-laydate-main{display:inline-block;border-left:1px solid #e2e2e2}.layui-laydate-shortcut>li{padding:5px 8px;cursor:pointer;line-height:18px}.layui-laydate .layui-laydate-list{position:absolute;left:0;top:0;width:100%;height:100%;padding:10px;box-sizing:border-box;background-color:#fff}.layui-laydate .layui-laydate-list>li{position:relative;display:inline-block;width:33.3%;height:36px;line-height:36px;margin:3px 0;vertical-align:middle;text-align:center;cursor:pointer;list-style:none}.layui-laydate .laydate-month-list>li{width:25%;margin:17px 0}.laydate-time-list{display:table}.layui-laydate .laydate-time-list>li{d" +
            "isplay:table-cell;height:100%;margin:0;line-height:normal;cursor:default}.layui-laydate .laydate-time-list p{position:relative;top:-4px;margin:0;line-height:29px}.layui-laydate .laydate-time-list ol{height:181px;overflow:hidden}.layui-laydate .laydate-time-list>li:hover ol{overflow-y:auto}.layui-laydate .laydate-time-list ol li{width:130%;padding-left:33px;height:30px;line-height:30px;text-align:left;cursor:pointer}.layui-laydate .laydate-time-list-hide-1 ol li{padding-left:53px}.layui-laydate .laydate-time-list-hide-2 ol li{padding-left:117px}.layui-laydate-hint{position:absolute;top:115px;left:50%;width:250px;margin-left:-125px;line-height:20px;padding:15px;text-align:center;font-size:12px;color:#ff5722}.layui-laydate-range{width:546px}.layui-laydate-range .layui-laydate-main{display:inline-block;vertical-align:middle;max-width:50%}.layui-laydate-range .laydate-main-list-1 .layui-laydate-content,.layui-laydate-range .laydate-main-list-1 .layui-laydate-header{border-left:1px solid #e2e2e2}.layui-laydate-range.layui-laydate-linkage .laydate-main-list-0 .laydate-next-m,.layui-laydate-range.layui-laydate-linkage .laydate-main-list-0 .laydate-next-y,.layui-laydate-range.layui-laydate-linkage .laydate-main-list-1 .laydate-prev-m,.layui-laydate-range.layui-laydate-linkage .laydate-main-list-1 .laydate-prev-y{display:none}.layui-laydate-range.layui-laydate-linkage .laydate-main-list-1 .layui-laydate-content,.layui-laydate-range.layui-laydate-linkage .laydate-main-list-1 .layui-laydate-header{border-left-style:dashed}.layui-laydate,.layui-laydate-hint{border:1px solid #d2d2d2;box-shadow:0 2px 4px rgba(0,0,0,.12);background-color:#fff;color:#777}.layui-laydate-header{border-bottom:1px solid #e2e2e2}.layui-laydate-header i:hover,.layui-laydate-header span:hover{color:#16b777}.layui-laydate-content{border-top:none 0;border-bottom:none 0}.layui-laydate-content th{color:#333}.layui-laydate-content td{color:#777}.layui-laydate-content td.laydate-day-now{color:#16b777}.layui-laydate-content td.laydate-day-now:after{content:'';position:absolute;width:100%;height:30px;left:0;top:0;border:1px solid #16b777;box-sizing:border-box}.layui-laydate-linkage .layui-laydate-content td.laydate-selected>div{background-color:#cffae9;transition:all .3s}.layui-laydate-linkage .laydate-selected:hover>div{background-color:#cffae9!important}.layui-laydate-content td.laydate-selected:after,.layui-laydate-content td:hover:after{content:none}.layui-laydate-content td>div:hover,.layui-laydate-list li:hover,.layui-laydate-shortcut>li:hover{background-color:#eee;color:#333;transition:all .3s}.laydate-time-list li ol{margin:0;padding:0;border:1px solid #e2e2e2;border-left-width:0}.laydate-time-list li:first-child ol{border-left-width:1px}.laydate-time-list>li:hover{background:0 0}.layui-laydate-content .laydate-day-next,.layui-laydate-content .laydate-day-prev{color:#d2d2d2}.layui-laydate-linkage .laydate-selected.laydate-day-next>div,.layui-laydate-linkage .laydate-selected.laydate-day-prev>div{background:0 0!important}.layui-laydate-footer{border-top:1px solid #e2e2e2}.layui-laydate-hint{color:#ff5722}.laydate-day-mark::after{background-color:#16b777}.layui-laydate-content td.layui-this .laydate-day-mark::after{display:none}.layui-laydate-footer span[lay-type=date]{color:#16b777}.layui-laydate .layui-this,.layui-laydate .layui-this>div{background-color:#16b777!important;color:#fff!important}.layui-laydate .laydate-disabled,.layui-laydate .laydate-disabled:hover{background:0 0!important;color:#d2d2d2!important;cursor:not-allowed!important;-moz-user-select:none;-webkit-user-select:none;-ms-user-select:none}.layui-laydate .layui-this.laydate-disabled,.layui-laydate .layui-this.laydate-disabled>div{background-color:#eee!important}.layui-laydate-content td>div{padding:7px 0;height:100%}.laydate-theme-molv{border:none}.laydate-theme-molv.layui-laydate-range{width:548px}.laydate-theme-molv .layui-laydate-main{width:274px}.laydate-theme-molv .layui-laydate-header{border:none;background-color:#16baaa}.laydate-theme-molv .layui-laydate-header i,.laydate-theme-molv .layui-laydate-header span{color:#f6f6f6}.laydate-theme-molv .layui-laydate-header i:hover,.laydate-theme-molv .layui-laydate-header span:hover{color:#fff}.laydate-theme-molv .layui-laydate-content{border:1px solid #e2e2e2;border-top:none;border-bottom:none}.laydate-theme-molv .laydate-main-list-1 .layui-laydate-content{border-left:none}.laydate-theme-molv .layui-this,.laydate-theme-molv .layui-this>div{background-color:#16baaa!important}.laydate-theme-molv .layui-laydate-footer{border:1px solid #e2e2e2}.laydate-theme-grid .laydate-month-list>li,.laydate-theme-grid .laydate-year-list>li,.laydate-theme-grid .layui-laydate-content td,.laydate-theme-grid .layui-laydate-content thead{border:1px solid #e2e2e2}.layui-laydate-linkage.laydate-theme-grid .laydate-selected,.layui-laydate-linkage.laydate-theme-grid .laydate-selected:hover{background-color:#f2f2f2!important;color:#16baaa!important}.layui-laydate-linkage.laydate-theme-grid .laydate-selected.laydate-day-next,.layui-laydate-linkage.laydate-theme-grid .laydate-selected.laydate-day-prev{color:#d2d2d2!important}.laydate-theme-grid .laydate-month-list,.laydate-theme-grid .laydate-year-list{margin:1px 0 0 1px}.laydate-theme-grid .laydate-month-list>li,.laydate-theme-grid .laydate-year-list>li{margin:0 -1px -1px 0}.laydate-theme-grid .laydate-year-list>li{height:43px;line-height:43px}.laydate-theme-grid .laydate-month-list>li{height:71px;line-height:71px}.laydate-theme-grid .layui-laydate-content td>div{height:29px;margin-top:-1px}.laydate-theme-circle .layui-laydate-content td.layui-this>div,.laydate-theme-circle .layui-laydate-content td>div{width:28px;height:28px;line-height:28px;border-radius:14px;margin:0 4px;padding:0}.layui-laydate.laydate-theme-circle .layui-laydate-content table td.layui-this{background-color:transparent!important}.laydate-theme-grid.laydate-theme-circle .layui-laydate-content td>div{margin:0 3.5px}.laydate-theme-fullpanel .layui-laydate-main{width:526px}.laydate-theme-fullpanel .layui-laydate-list{width:252px;left:272px}.laydate-theme-fullpanel .laydate-set-ym span{display:none}.laydate-theme-fullpanel .laydate-time-show .laydate-set-ym span[lay-type=month],.laydate-theme-fullpanel .laydate-time-show .laydate-set-ym span[lay-type=year],.laydate-theme-fullpanel .laydate-time-show .layui-laydate-header .layui-icon{display:inline-block!important}.laydate-theme-fullpanel .laydate-btns-time{display" +
            ":none}.laydate-theme-fullpanel .laydate-time-list-hide-1 ol li{padding-left:49px}.laydate-theme-fullpanel .laydate-time-list-hide-2 ol li{padding-left:107px}html #layuicss-layer{display:none;position:absolute;width:1989px}.layui-layer,.layui-layer-shade{position:fixed;_position:absolute;pointer-events:auto}.layui-layer-shade{opacity:0;transition:opacity .35s cubic-bezier(.34,.69,.1,1);top:0;left:0;width:100%;height:100%;_height:expression(document.body.offsetHeight+\"px\")}.layui-layer{-webkit-overflow-scrolling:touch}.layui-layer{top:150px;left:0;margin:0;padding:0;background-color:#fff;-webkit-background-clip:content;border-radius:2px;box-shadow:1px 1px 50px rgba(0,0,0,.3)}.layui-layer-close{position:absolute}.layui-layer-content{position:relative}.layui-layer-border{border:1px solid #b2b2b2;border:1px solid rgba(0,0,0,.1);box-shadow:1px 1px 5px rgba(0,0,0,.2)}.layui-layer-load{background:url(data:image/gif;base64,R0lGODlhJQAlAJECAL3L2AYrTv///wAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQFCgACACwAAAAAJQAlAAACi5SPqcvtDyGYIFpF690i8xUw3qJBwUlSadmcLqYmGQu6KDIeM13beGzYWWy3DlB4IYaMk+Dso2RWkFCfLPcRvFbZxFLUDTt21BW56TyjRep1e20+i+eYMR145W2eefj+6VFmgTQi+ECVY8iGxcg35phGo/iDFwlTyXWphwlm1imGRdcnuqhHeop6UAAAIfkEBQoAAgAsEAACAAQACwAAAgWMj6nLXAAh+QQFCgACACwVAAUACgALAAACFZQvgRi92dyJcVJlLobUdi8x4bIhBQAh+QQFCgACACwXABEADAADAAACBYyPqcsFACH5BAUKAAIALBUAFQAKAAsAAAITlGKZwWoMHYxqtmplxlNT7ixGAQAh+QQFCgACACwQABgABAALAAACBYyPqctcACH5BAUKAAIALAUAFQAKAAsAAAIVlC+BGL3Z3IlxUmUuhtR2LzHhsiEFACH5BAUKAAIALAEAEQAMAAMAAAIFjI+pywUAIfkEBQoAAgAsBQAFAAoACwAAAhOUYJnAagwdjGq2amXGU1PuLEYBACH5BAUKAAIALBAAAgAEAAsAAAIFhI+py1wAIfkEBQoAAgAsFQAFAAoACwAAAhWUL4AIvdnciXFSZS6G1HYvMeGyIQUAIfkEBQoAAgAsFwARAAwAAwAAAgWEj6nLBQAh+QQFCgACACwVABUACgALAAACE5RgmcBqDB2MarZqZcZTU+4sRgEAIfkEBQoAAgAsEAAYAAQACwAAAgWEj6nLXAAh+QQFCgACACwFABUACgALAAACFZQvgAi92dyJcVJlLobUdi8x4bIhBQAh+QQFCgACACwBABEADAADAAACBYSPqcsFADs=) #fff center center no-repeat}.layui-layer-btn a,.layui-layer-setwin span{display:inline-block;vertical-align:middle;*display:inline;*zoom:1}.layui-layer-move{display:none;position:fixed;*position:absolute;left:0;top:0;width:100%;height:100%;cursor:move;opacity:0;filter:alpha(opacity=0);background-color:#fff;z-index:2147483647}.layui-layer-resize{position:absolute;width:15px;height:15px;right:0;bottom:0;cursor:se-resize}.layer-anim{-webkit-animation-fill-mode:both;animation-fill-mode:both;-webkit-animation-duration:.3s;animation-duration:.3s}@-webkit-keyframes layer-bounceIn{0%{opacity:0;-webkit-transform:scale(.5);transform:scale(.5)}100%{opacity:1;-webkit-transform:scale(1);transform:scale(1)}}@keyframes layer-bounceIn{0%{opacity:0;-webkit-transform:scale(.5);-ms-transform:scale(.5);transform:scale(.5)}100%{opacity:1;-webkit-transform:scale(1);-ms-transform:scale(1);transform:scale(1)}}.layer-anim-00{-webkit-animation-name:layer-bounceIn;animation-name:layer-bounceIn}@-webkit-keyframes layer-zoomInDown{0%{opacity:0;-webkit-transform:scale(.1) translateY(-2000px);transform:scale(.1) translateY(-2000px);-webkit-animation-timing-function:ease-in-out;animation-timing-function:ease-in-out}60%{opacity:1;-webkit-transform:scale(.475) translateY(60px);transform:scale(.475) translateY(60px);-webkit-animation-timing-function:ease-out;animation-timing-function:ease-out}}@keyframes layer-zoomInDown{0%{opacity:0;-webkit-transform:scale(.1) translateY(-2000px);-ms-transform:scale(.1) translateY(-2000px);transform:scale(.1) translateY(-2000px);-webkit-animation-timing-function:ease-in-out;animation-timing-function:ease-in-out}60%{opacity:1;-webkit-transform:scale(.475) translateY(60px);-ms-transform:scale(.475) translateY(60px);transform:scale(.475) translateY(60px);-webkit-animation-timing-function:ease-out;animation-timing-function:ease-out}}.layer-anim-01{-webkit-animation-name:layer-zoomInDown;animation-name:layer-zoomInDown}@-webkit-keyframes layer-fadeInUpBig{0%{opacity:0;-webkit-transform:translateY(2000px);transform:translateY(2000px)}100%{opacity:1;-webkit-transform:translateY(0);transform:translateY(0)}}@keyframes layer-fadeInUpBig{0%{opacity:0;-webkit-transform:translateY(2000px);-ms-transform:translateY(2000px);transform:translateY(2000px)}100%{opacity:1;-webkit-transform:translateY(0);-ms-transform:translateY(0);transform:translateY(0)}}.layer-anim-02{-webkit-animation-name:layer-fadeInUpBig;animation-name:layer-fadeInUpBig}@-webkit-keyframes layer-zoomInLeft{0%{opacity:0;-webkit-transform:scale(.1) translateX(-2000px);transform:scale(.1) translateX(-2000px);-webkit-animation-timing-function:ease-in-out;animation-timing-function:ease-in-out}60%{opacity:1;-webkit-transform:scale(.475) translateX(48px);transform:scale(.475) translateX(48px);-webkit-animation-timing-function:ease-out;animation-timing-function:ease-out}}@keyframes layer-zoomInLeft{0%{opacity:0;-webkit-transform:scale(.1) translateX(-2000px);-ms-transform:scale(.1) translateX(-2000px);transform:scale(.1) translateX(-2000px);-webkit-animation-timing-function:ease-in-out;animation-timing-function:ease-in-out}60%{opacity:1;-webkit-transform:scale(.475) translateX(48px);-ms-transform:scale(.475) translateX(48px);transform:scale(.475) translateX(48px);-webkit-animation-timing-function:ease-out;animation-timing-function:ease-out}}.layer-anim-03{-webkit-animation-name:layer-zoomInLeft;animation-name:layer-zoomInLeft}@-webkit-keyframes layer-rollIn{0%{opacity:0;-webkit-transform:translateX(-100%) rotate(-120deg);transform:translateX(-100%) rotate(-120deg)}100%{opacity:1;-webkit-transform:translateX(0) rotate(0);transform:translateX(0) rotate(0)}}@keyframes layer-rollIn{0%{opacity:0;-webkit-transform:translateX(-100%) rotate(-120deg);-ms-transform:translateX(-100%) rotate(-120deg);transform:translateX(-100%) rotate(-120deg)}100%{opacity:1;-webkit-transform:translateX(0) rotate(0);-ms-transform:translateX(0) rotate(0);transform:translateX(0) rotate(0)}}.layer-anim-04{-webkit-animation-name:layer-rollIn;animation-name:layer-rollIn}@keyframes layer-fadeIn{0%{opacity:0}100%{opacity:1}}.layer-anim-05{-webkit-animation-name:layer-fadeIn;animation-name:layer-fadeIn}@-webkit-keyframes layer-shake{0%,100%{-webkit-transform:translateX(0);transform:translateX(0)}10%,30%,50%,70%,90%{-webkit-transform:translateX(-10px);transform:translateX(-10px)}20%,40%,60%,80%{-webkit-transform:translateX(10px);transform:translateX(10px)}}@keyframes layer-shake{0%,100%{-webkit-transform:translateX(0);-ms-transform:translateX(0);transform:translateX(0)}10%,30%,50%,70%,90%{-webkit-transform:translateX(-10px);-ms-transform:tra" +
            "nslateX(-10px);transform:translateX(-10px)}20%,40%,60%,80%{-webkit-transform:translateX(10px);-ms-transform:translateX(10px);transform:translateX(10px)}}.layer-anim-06{-webkit-animation-name:layer-shake;animation-name:layer-shake}@-webkit-keyframes fadeIn{0%{opacity:0}100%{opacity:1}}@keyframes layer-slide-down{from{transform:translate3d(0,-100%,0)}to{transform:translate3d(0,0,0)}}@keyframes layer-slide-down-out{from{transform:translate3d(0,0,0)}to{transform:translate3d(0,-100%,0)}}.layer-anim-slide-down{animation-name:layer-slide-down}.layer-anim-slide-down-out{animation-name:layer-slide-down-out}@keyframes layer-slide-left{from{transform:translate3d(100%,0,0)}to{transform:translate3d(0,0,0)}}@keyframes layer-slide-left-out{from{transform:translate3d(0,0,0)}to{transform:translate3d(100%,0,0)}}.layer-anim-slide-left{animation-name:layer-slide-left}.layer-anim-slide-left-out{animation-name:layer-slide-left-out}@keyframes layer-slide-up{from{transform:translate3d(0,100%,0)}to{transform:translate3d(0,0,0)}}@keyframes layer-slide-up-out{from{transform:translate3d(0,0,0)}to{transform:translate3d(0,100%,0)}}.layer-anim-slide-up{animation-name:layer-slide-up}.layer-anim-slide-up-out{animation-name:layer-slide-up-out}@keyframes layer-slide-right{from{transform:translate3d(-100%,0,0)}to{transform:translate3d(0,0,0)}}@keyframes layer-slide-right-out{from{transform:translate3d(0,0,0)}to{transform:translate3d(-100%,0,0)}}.layer-anim-slide-right{animation-name:layer-slide-right}.layer-anim-slide-right-out{animation-name:layer-slide-right-out}.layui-layer-title{padding:0 81px 0 16px;height:50px;line-height:50px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#333;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-radius:2px 2px 0 0}.layui-layer-setwin{position:absolute;right:15px;*right:0;top:16px;font-size:0;line-height:initial}.layui-layer-setwin span{position:relative;width:16px;height:16px;line-height:18px;margin-left:10px;text-align:center;font-size:16px;cursor:pointer;color:#000;_overflow:hidden;box-sizing:border-box}.layui-layer-setwin .layui-layer-min:before{content:'';position:absolute;width:12px;border-bottom:1px solid #2e2d3c;left:50%;top:50%;margin:-.5px 0 0 -6px;cursor:pointer;_overflow:hidden}.layui-layer-setwin .layui-layer-min:hover:before{background-color:#2d93ca}.layui-layer-setwin .layui-layer-max:after,.layui-layer-setwin .layui-layer-max:before{content:'';position:absolute;left:50%;top:50%;z-index:1;width:9px;height:9px;margin:-5px 0 0 -5px;border:1px solid #2e2d3c}.layui-layer-setwin .layui-layer-max:hover:after,.layui-layer-setwin .layui-layer-max:hover:before{border-color:#2d93ca}.layui-layer-setwin .layui-layer-min:hover:before{background-color:#2d93ca}.layui-layer-setwin .layui-layer-maxmin:after,.layui-layer-setwin .layui-layer-maxmin:before{width:7px;height:7px;margin:-3px 0 0 -3px;background-color:#fff}.layui-layer-setwin .layui-layer-maxmin:after{z-index:0;margin:-5px 0 0 -1px}.layui-layer-setwin .layui-layer-close{cursor:pointer}.layui-layer-setwin .layui-layer-close:hover{opacity:.7}.layui-layer-setwin .layui-layer-close2{position:absolute;right:-28px;top:-28px;color:#fff;background-color:#787878;padding:3px;border:3px solid;width:28px;height:28px;font-size:16px;font-weight:bolder;border-radius:50%;margin-left:0;*right:-18px;_display:none}.layui-layer-setwin .layui-layer-close2:hover{opacity:unset;background-color:#3888f6}.layui-layer-btn{text-align:right;padding:0 15px 12px;pointer-events:auto;user-select:none;-webkit-user-select:none}.layui-layer-btn a{height:30px;line-height:30px;margin:5px 5px 0;padding:0 16px;border:1px solid #dedede;background-color:#fff;color:#333;border-radius:2px;font-weight:400;cursor:pointer;text-decoration:none;box-sizing:border-box}.layui-layer-btn a:hover{opacity:.9;text-decoration:none}.layui-layer-btn a:active{opacity:.8}.layui-layer-btn .layui-layer-btn0{border-color:transparent;background-color:#1e9fff;color:#fff}.layui-layer-btn-l{text-align:left}.layui-layer-btn-c{text-align:center}.layui-layer-btn-is-loading{opacity:.5!important;cursor:not-allowed!important;cursor:wait!important;overflow:hidden;white-space:nowrap;-webkit-user-select:none;-ms-user-select:none;user-select:none}.layui-layer-btn-is-loading .layui-layer-btn-loading-icon{margin-right:8px;font-size:14px}.layui-layer-dialog{min-width:240px}.layui-layer-dialog .layui-layer-content{position:relative;padding:16px;line-height:24px;word-break:break-all;overflow:hidden;font-size:14px;overflow-x:hidden;overflow-y:auto}.layui-layer-dialog .layui-layer-content .layui-layer-face{position:absolute;top:18px;left:16px;color:#959595;font-size:32px;_left:-40px}.layui-layer-dialog .layui-layer-content .layui-icon-tips{color:#f39b12}.layui-layer-dialog .layui-layer-content .layui-icon-success{color:#16b777}.layui-layer-dialog .layui-layer-content .layui-icon-error{top:19px;color:#ff5722}.layui-layer-dialog .layui-layer-content .layui-icon-question{color:#ffb800}.layui-layer-dialog .layui-layer-content .layui-icon-lock{color:#787878}.layui-layer-dialog .layui-layer-content .layui-icon-face-cry{color:#ff5722}.layui-layer-dialog .layui-layer-content .layui-icon-face-smile{color:#16b777}.layui-layer-rim{border:6px solid #8d8d8d;border:6px solid rgba(0,0,0,.3);border-radius:5px;box-shadow:none}.layui-layer-msg{min-width:180px;border:1px solid #d3d4d3;box-shadow:none}.layui-layer-hui{min-width:100px;background-color:#000;filter:alpha(opacity=60);background-color:rgba(0,0,0,.6);color:#fff;border:none}.layui-layer-hui .layui-layer-close{color:#fff}.layui-layer-hui .layui-layer-content{padding:11px 24px;text-align:center}.layui-layer-dialog .layui-layer-padding{padding:18px 24px 18px 58px;text-align:left}.layui-layer-page .layui-layer-content{position:relative;overflow:auto}.layui-layer-iframe .layui-layer-btn,.layui-layer-page .layui-layer-btn{padding-top:10px}.layui-layer-nobg{background:0 0}.layui-layer-iframe iframe{display:block;width:100%}.layui-layer-loading{border-radius:100%;background:0 0;box-shadow:none;border:none}.layui-layer-loading .layui-layer-content{width:76px;height:38px;line-height:38px;text-align:center}.layui-layer-loading-icon{font-size:38px;color:#959595}.layui-layer-loading2{text-align:center}.layui-layer-loading-2{position:relative;height:38px}.layui-layer-loading-2:after,.layui-layer-loading-2:before{content:'';position:absolute;left:50%;top:50%;width:38px;height:38px;margin:-19px 0 0 -19px;border-radius:50%;border:3px solid #d2d2d2;box-sizing:" +
            "border-box}.layui-layer-loading-2:after{border-color:transparent;border-left-color:#1e9fff}.layui-layer-tips{background:0 0;box-shadow:none;border:none}.layui-layer-tips .layui-layer-content{position:relative;line-height:22px;min-width:12px;padding:8px 15px;font-size:12px;_float:left;border-radius:2px;box-shadow:1px 1px 3px rgba(0,0,0,.2);background-color:#000;color:#fff}.layui-layer-tips .layui-layer-close{right:-2px;top:-1px}.layui-layer-tips i.layui-layer-TipsG{position:absolute;width:0;height:0;border-width:8px;border-color:transparent;border-style:dashed;*overflow:hidden}.layui-layer-tips i.layui-layer-TipsB,.layui-layer-tips i.layui-layer-TipsT{left:5px;border-right-style:solid;border-right-color:#000}.layui-layer-tips i.layui-layer-TipsT{bottom:-8px}.layui-layer-tips i.layui-layer-TipsB{top:-8px}.layui-layer-tips i.layui-layer-TipsL,.layui-layer-tips i.layui-layer-TipsR{top:5px;border-bottom-style:solid;border-bottom-color:#000}.layui-layer-tips i.layui-layer-TipsR{left:-8px}.layui-layer-tips i.layui-layer-TipsL{right:-8px}.layui-layer-lan .layui-layer-title{background:#4476a7;color:#fff;border:none}.layui-layer-lan .layui-layer-btn{padding:5px 10px 10px;border-top:1px solid #e9e7e7}.layui-layer-lan .layui-layer-btn a{background:#fff;border-color:#e9e7e7;color:#333}.layui-layer-lan .layui-layer-btn .layui-layer-btn1{background:#c9c5c5}.layui-layer-molv .layui-layer-title{background:#009f95;color:#fff;border:none}.layui-layer-molv .layui-layer-btn a{background:#009f95;border-color:#009f95}.layui-layer-molv .layui-layer-btn .layui-layer-btn1{background:#92b8b1}.layui-layer-lan .layui-layer-setwin .layui-icon,.layui-layer-molv .layui-layer-setwin .layui-icon{color:#fff}.layui-layer-win10{border:1px solid #aaa;box-shadow:1px 1px 6px rgba(0,0,0,.3);border-radius:none}.layui-layer-win10 .layui-layer-title{height:32px;line-height:32px;padding-left:8px;border-bottom:none;font-size:12px}.layui-layer-win10 .layui-layer-setwin{right:0;top:0}.layui-layer-win10 .layui-layer-setwin span{margin-left:0;width:32px;height:32px;padding:8px}.layui-layer-win10.layui-layer-page .layui-layer-setwin span{width:38px}.layui-layer-win10 .layui-layer-setwin span:hover{background-color:#e5e5e5}.layui-layer-win10 .layui-layer-setwin span.layui-icon-close:hover{background-color:#e81123;color:#fff}.layui-layer-win10.layui-layer-dialog .layui-layer-content{padding:8px 16px 32px;color:#0033bc}.layui-layer-win10.layui-layer-dialog .layui-layer-padding{padding-top:18px;padding-left:58px}.layui-layer-win10 .layui-layer-btn{padding:5px 5px 10px;border-top:1px solid #dfdfdf;background-color:#f0f0f0}.layui-layer-win10 .layui-layer-btn a{height:20px;line-height:18px;background-color:#e1e1e1;border-color:#adadad;color:#000;font-size:12px;transition:all .3s}.layui-layer-win10 .layui-layer-btn a:hover{border-color:#2a8edd;background-color:#e5f1fb}.layui-layer-win10 .layui-layer-btn .layui-layer-btn0{border-color:#0078d7}.layui-layer-prompt .layui-layer-input{display:block;width:260px;height:36px;margin:0 auto;line-height:30px;padding-left:10px;border:1px solid #e6e6e6;color:#333}.layui-layer-prompt textarea.layui-layer-input{width:300px;height:100px;line-height:20px;padding:6px 10px}.layui-layer-prompt .layui-layer-content{padding:16px}.layui-layer-prompt .layui-layer-btn{padding-top:0}.layui-layer-tab{box-shadow:1px 1px 50px rgba(0,0,0,.4)}.layui-layer-tab .layui-layer-title{padding-left:0;overflow:visible}.layui-layer-tab .layui-layer-title span{position:relative;display:inline-block;vertical-align:top;border-left:1px solid transparent;border-right:1px solid transparent;min-width:80px;max-width:300px;padding:0 16px;text-align:center;cursor:default;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;cursor:pointer}.layui-layer-tab .layui-layer-title span.layui-this{height:51px;border-left-color:#eee;border-right-color:#eee;background-color:#fff;z-index:10}.layui-layer-tab .layui-layer-title span:first-child{border-left-color:transparent}.layui-layer-tabmain{line-height:24px;clear:both}.layui-layer-tabmain .layui-layer-tabli{display:none}.layui-layer-tabmain .layui-layer-tabli.layui-this{display:block}.layui-layer-photos{background:0 0;box-shadow:none}.layui-layer-photos .layui-layer-content{overflow:visible;text-align:center}.layui-layer-photos .layer-layer-photos-main img{position:relative;width:100%;display:inline-block;*display:inline;*zoom:1;vertical-align:top}.layui-layer-photos-next,.layui-layer-photos-prev{position:fixed;top:50%;width:52px;height:52px;line-height:52px;margin-top:-26px;cursor:pointer;font-size:52px;color:#717171}.layui-layer-photos-prev{left:32px}.layui-layer-photos-next{right:32px}.layui-layer-photos-next:hover,.layui-layer-photos-prev:hover{color:#959595}.layui-layer-photos-toolbar{position:fixed;left:0;right:0;bottom:0;width:100%;height:52px;line-height:52px;background-color:#000\\9;filter:Alpha(opacity=60);background-color:rgba(0,0,0,.32);color:#fff;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;font-size:0}.layui-layer-photos-toolbar>*{display:inline-block;vertical-align:top;padding:0 16px;font-size:12px;color:#fff;*display:inline;*zoom:1}.layui-layer-photos-toolbar *{font-size:12px}.layui-layer-photos-header{top:0;bottom:auto}.layui-layer-photos-header>span{cursor:pointer}.layui-layer-photos-header>span:hover{background-color:rgba(51,51,51,.32)}.layui-layer-photos-header .layui-icon{font-size:18px}.layui-layer-photos-footer>h3{max-width:65%;text-overflow:ellipsis;overflow:hidden;white-space:nowrap}.layui-layer-photos-footer a:hover{text-decoration:underline}.layui-layer-photos-footer em{font-style:normal}@-webkit-keyframes layer-bounceOut{100%{opacity:0;-webkit-transform:scale(.7);transform:scale(.7)}30%{-webkit-transform:scale(1.05);transform:scale(1.05)}0%{-webkit-transform:scale(1);transform:scale(1)}}@keyframes layer-bounceOut{100%{opacity:0;-webkit-transform:scale(.7);-ms-transform:scale(.7);transform:scale(.7)}30%{-webkit-transform:scale(1.05);-ms-transform:scale(1.05);transform:scale(1.05)}0%{-webkit-transform:scale(1);-ms-transform:scale(1);transform:scale(1)}}.layer-anim-close{-webkit-animation-name:layer-bounceOut;animation-name:layer-bounceOut;-webkit-animation-fill-mode:both;animation-fill-mode:both;-webkit-animation-duration:.2s;animation-duration:.2s}\n/*# sourceMappingURL=layui.css.map */\n",
        layuiDark: ":root.dark {\n  --color-white: #FFFFFF;\n  --color-black: #000000;\n  --lay-color-white: #FAFAFA;\n  --lay-color-black: #333333;\n  --lay-color-red-1: #FFF1E8;\n  --lay-color-red-2: #FFD7C0;\n  --lay-color-red-3: #FFBB99;\n  --lay-color-red-4: #FF9C71;\n  --lay-color-red-5: #FF7A4A;\n  --lay-color-red-6: #FF5722;\n  --lay-color-red-7: #D23B15;\n  --lay-color-red-8: #A6250B;\n  --lay-color-red-9: #791404;\n  --lay-color-red-10: #4D0800;\n  --lay-color-blue-1: #E8F9FF;\n  --lay-color-blue-2: #C0ECFF;\n  --lay-color-blue-3: #97DCFF;\n  --lay-color-blue-4: #6FCAFF;\n  --lay-color-blue-5: #46B5FF;\n  --lay-color-blue-6: #1E9FFF;\n  --lay-color-blue-7: #1379D2;\n  --lay-color-blue-8: #0A58A6;\n  --lay-color-blue-9: #043A79;\n  --lay-color-blue-10: #00214D;\n  --lay-color-lightblue-1: #E8FDFF;\n  --lay-color-lightblue-2: #C1F4FB;\n  --lay-color-lightblue-3: #9CEAF7;\n  --lay-color-lightblue-4: #77DDF4;\n  --lay-color-lightblue-5: #53CEF0;\n  --lay-color-lightblue-6: #31BDEC;\n  --lay-color-lightblue-7: #1F95C4;\n  --lay-color-lightblue-8: #10709C;\n  --lay-color-lightblue-9: #064E74;\n  --lay-color-lightblue-10: #002F4D;\n  --lay-color-layuigreen-1: #E8FFF9;\n  --lay-color-layuigreen-2: #B5F1E3;\n  --lay-color-layuigreen-3: #87E3D1;\n  --lay-color-layuigreen-4: #5DD6C1;\n  --lay-color-layuigreen-5: #37C8B5;\n  --lay-color-layuigreen-6: #16BAAA;\n  --lay-color-layuigreen-7: #0E9F95;\n  --lay-color-layuigreen-8: #08837F;\n  --lay-color-layuigreen-9: #036868;\n  --lay-color-layuigreen-10: #004A4D;\n  --lay-color-green-1: #E8FFF2;\n  --lay-color-green-2: #B5F1D1;\n  --lay-color-green-3: #86E2B4;\n  --lay-color-green-4: #5CD49C;\n  --lay-color-green-5: #37C588;\n  --lay-color-green-6: #16B777;\n  --lay-color-green-7: #0E9C68;\n  --lay-color-green-8: #088259;\n  --lay-color-green-9: #036749;\n  --lay-color-green-10: #004D38;\n  --lay-color-orange-1: #FFFCE8;\n  --lay-color-orange-2: #FFF5BA;\n  --lay-color-orange-3: #FFEA8B;\n  --lay-color-orange-4: #FFDC5D;\n  --lay-color-orange-5: #FFCB2E;\n  --lay-color-orange-6: #FFB800;\n  --lay-color-orange-7: #D29000;\n  --lay-color-orange-8: #A66C00;\n  --lay-color-orange-9: #794B00;\n  --lay-color-orange-10: #4D2D00;\n  --lay-color-cyan-1: #E8F6FF;\n  --lay-color-cyan-2: #B9CEDD;\n  --lay-color-cyan-3: #8FA7BB;\n  --lay-color-cyan-4: #6A829A;\n  --lay-color-cyan-5: #4A5F78;\n  --lay-color-cyan-6: #2F4056;\n  --lay-color-cyan-7: #223654;\n  --lay-color-cyan-8: #162C51;\n  --lay-color-cyan-9: #0B214F;\n  --lay-color-cyan-10: #00174D;\n  --lay-color-purple-1: #FDE8FF;\n  --lay-color-purple-2: #EDBEF4;\n  --lay-color-purple-3: #DC97E8;\n  --lay-color-purple-4: #C972DD;\n  --lay-color-purple-5: #B651D1;\n  --lay-color-purple-6: #A233C6;\n  --lay-color-purple-7: #8120A8;\n  --lay-color-purple-8: #631289;\n  --lay-color-purple-9: #48076B;\n  --lay-color-purple-10: #2F004D;\n  --lay-color-black-1: #E8F8FF;\n  --lay-color-black-2: #BFD0D8;\n  --lay-color-black-3: #98A8B1;\n  --lay-color-black-4: #73818A;\n  --lay-color-black-5: #505B63;\n  --lay-color-black-6: #2F363C;\n  --lay-color-black-7: #23303C;\n  --lay-color-black-8: #18293C;\n  --lay-color-black-9: #0C213C;\n  --lay-color-black-10: #00183C;\n  --lay-color-gray-1: #FAFAFA;\n  --lay-color-gray-2: #F6F6F6;\n  --lay-color-gray-3: #EEEEEE;\n  --lay-color-gray-4: #E2E2E2;\n  --lay-color-gray-5: #DDDDDD;\n  --lay-color-gray-6: #D2D2D2;\n  --lay-color-gray-7: #CCCCCC;\n  --lay-color-gray-8: #C2C2C2;\n  --lay-color-gray-9: #AAAAAA;\n  --lay-color-gray-10: #939393;\n  --lay-color-gray-11: #858585;\n  --lay-color-gray-12: #7b7b7b;\n  --lay-color-gray-13: #686868;\n  --lay-color-primary: var(--lay-color-layuigreen-6);\n  --lay-color-primary-hover: var(--lay-color-layuigreen-5);\n  --lay-color-primary-active: var(--lay-color-layuigreen-7);\n  --lay-color-primary-disabled: var(--lay-color-layuigreen-3);\n  --lay-color-primary-light: var(--lay-color-layuigreen-4);\n  --lay-color-secondary: var(--lay-color-green-6);\n  --lay-color-secondary-hover: var(--lay-color-green-5);\n  --lay-color-secondary-active: var(--lay-color-green-7);\n  --lay-color-secondary-disabled: var(--lay-color-green-3);\n  --lay-color-secondary-light: var(--lay-color-green-4);\n  --lay-color-info: var(--lay-color-lightblue-6);\n  --lay-color-info-hover: var(--lay-color-lightblue-5);\n  --lay-color-info-active: var(--lay-color-lightblue-7);\n  --lay-color-info-disabled: var(--lay-color-lightblue-3);\n  --lay-color-info-light: var(--lay-color-lightblue-4);\n  --lay-color-normal: var(--lay-color-blue-6);\n  --lay-color-normal-hover: var(--lay-color-blue-5);\n  --lay-color-normal-active: var(--lay-color-blue-7);\n  --lay-color-normal-disabled: var(--lay-color-blue-3);\n  --lay-color-normal-light: var(--lay-color-blue-4);\n  --lay-color-warning: var(--lay-color-orange-6);\n  --lay-color-warning-hover: var(--lay-color-orange-5);\n  --lay-color-warning-active: var(--lay-color-orange-7);\n  --lay-color-warning-disabled: var(--lay-color-orange-3);\n  --lay-color-warning-light: var(--lay-color-orange-4);\n  --lay-color-success: var(--lay-color-green-6);\n  --lay-color-success-hover: var(--lay-color-green-5);\n  --lay-color-success-active: var(--lay-color-green-7);\n  --lay-color-success-disabled: var(--lay-color-green-3);\n  --lay-color-success-light: var(--lay-color-green-4);\n  --lay-color-danger: var(--lay-color-red-6);\n  --lay-color-danger-hover: var(--lay-color-red-5);\n  --lay-color-danger-active: var(--lay-color-red-7);\n  --lay-color-danger-disabled: var(--lay-color-red-3);\n  --lay-color-danger-light: var(--lay-color-red-4);\n  --lay-color-bg-1: #17171A;\n  --lay-color-bg-2: #232324;\n  --lay-color-bg-3: #2a2a2b;\n  --lay-color-bg-4: #313132;\n  --lay-color-bg-5: #373739;\n  --lay-color-bg-white: #f6f6f6;\n  --lay-color-text-1: rgba(255, 255, 255, 0.9);\n  --lay-color-text-2: rgba(255, 255, 255, 0.7);\n  --lay-color-text-3: rgba(255, 255, 255, 0.5);\n  --lay-color-text-4: rgba(255, 255, 255, 0.3);\n  --lay-color-border-1: #2e2e30;\n  --lay-color-border-2: #484849;\n  --lay-color-border-3: #5f5f60;\n  --lay-color-border-4: #929293;\n  --lay-color-fill-1: rgba(255, 255, 255, 0.04);\n  --lay-color-fill-2: rgba(255, 255, 255, 0.08);\n  --lay-color-fill-3: rgba(255, 255, 255, 0.12);\n  --lay-color-fill-4: rgba(255, 255, 255, 0.16);\n  --lay-color-hover: var(--lay-color-fill-3);\n  --lay-color-active: var(--lay-color-fill-3);\n  --lay-shadow-1: 0 4px 6px rgba(0, 0, 0, 0.06), 0 1px 10px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.12);\n  --lay-shadow-2: 0 8px 10px rgba(0, 0, 0, 0.12), 0 3px 14px rgba(0, 0, 0, 0.1), 0 5px 5px rgba(0, 0, 0, 0.16);\n  --lay-shadow-3: 0 16px 24px rgba(0, 0, 0, 0.14), 0 6px 30px r" +
            "gba(0, 0, 0, 0.12), 0 8px 10px rgba(0, 0, 0, 0.2);\n}\n.dark blockquote,\n.dark body,\n.dark button,\n.dark dd,\n.dark div,\n.dark dl,\n.dark dt,\n.dark form,\n.dark h1,\n.dark h2,\n.dark h3,\n.dark h4,\n.dark h5,\n.dark h6,\n.dark input,\n.dark li,\n.dark ol,\n.dark p,\n.dark pre,\n.dark td,\n.dark textarea,\n.dark th,\n.dark ul {\n  -webkit-tap-highlight-color: rgba(0, 0, 0, 0);\n}\n.dark body {\n  color: var(--lay-color-text-2);\n  background-color: var(--lay-color-bg-1);\n  color-scheme: dark;\n}\n.dark hr {\n  border-bottom: 1px solid var(--lay-color-border-2) !important;\n}\n.dark a {\n  color: var(--lay-color-text-1);\n}\n.dark a:hover {\n  color: var(--lay-color-text-3);\n}\n.dark .layui-edge {\n  border-color: transparent;\n}\n.dark .layui-edge-top {\n  border-bottom-color: var(--lay-color-border-4);\n}\n.dark .layui-edge-right {\n  border-left-color: var(--lay-color-border-4);\n}\n.dark .layui-edge-bottom {\n  border-top-color: var(--lay-color-border-4);\n}\n.dark .layui-edge-left {\n  border-right-color: var(--lay-color-border-4);\n}\n.dark .layui-disabled,\n.dark .layui-disabled:hover {\n  color: var(--lay-color-text-4) !important;\n}\n.dark .layui-icon {\n  -moz-osx-font-smoothing: grayscale;\n}\n.dark .layui-layout-admin .layui-header {\n  background-color: var(--lay-color-bg-2);\n}\n.dark .layui-layout-admin .layui-footer {\n  box-shadow: -1px 0 4px rgba(0, 0, 0, 0.12);\n  background-color: var(--lay-color-bg-2);\n}\n.dark .layui-layout-admin .layui-logo {\n  color: var(--lay-color-primary);\n  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.15);\n}\n.dark .layui-elem-quote {\n  border-left: 5px solid var(--lay-color-secondary);\n  background-color: var(--lay-color-fill-1);\n}\n.dark .layui-quote-nm {\n  border-color: var(--lay-color-fill-1);\n}\n.dark .layui-progress {\n  background-color: var(--lay-color-bg-3);\n}\n.dark .layui-progress-bar {\n  background-color: var(--lay-color-secondary);\n}\n.dark .layui-progress-text {\n  color: var(--lay-color-text-2);\n}\n.dark .layui-progress-big .layui-progress-text {\n  color: var(--lay-color-text-1);\n}\n.dark .layui-colla-title {\n  color: var(--lay-color-text-1);\n  background-color: var(--lay-color-bg-2);\n}\n.dark .layui-colla-content {\n  color: var(--lay-color-text-2);\n}\n.dark .layui-card {\n  background-color: var(--lay-color-bg-2);\n  box-shadow: var(--lay-shadow-1);\n}\n.dark .layui-card-header {\n  border-bottom: 1px solid var(--lay-color-border-2);\n  color: var(--lay-color-text-1);\n}\n.dark .layui-panel {\n  box-shadow: var(--lay-shadow-1);\n  background-color: var(--lay-color-bg-2);\n  color: var(--lay-color-text-1);\n}\n.dark .layui-menu-body-panel {\n  box-shadow: var(--lay-shadow-2);\n}\n.dark .layui-panel-window {\n  border-top: 5px solid var(--lay-color-border-2);\n  background-color: var(--lay-color-bg-2);\n}\n.dark .layui-bg-red {\n  background-color: var(--lay-color-red-6) !important;\n  color: var(--lay-color-white) !important;\n}\n.dark .layui-bg-orange {\n  background-color: var(--lay-color-orange-6) !important;\n  color: var(--lay-color-white) !important;\n}\n.dark .layui-bg-green {\n  background-color: var(--lay-color-layuigreen-6) !important;\n  color: var(--lay-color-white) !important;\n}\n.dark .layui-bg-cyan {\n  background-color: var(--lay-color-cyan-6) !important;\n  color: var(--lay-color-white) !important;\n}\n.dark .layui-bg-blue {\n  background-color: var(--lay-color-blue-6) !important;\n  color: var(--lay-color-white) !important;\n}\n.dark .layui-bg-black {\n  background-color: var(--lay-color-black-6) !important;\n  color: var(--lay-color-white) !important;\n}\n.dark .layui-bg-purple {\n  background-color: var(--lay-color-purple-6) !important;\n  color: var(--lay-color-white) !important;\n}\n.dark .layui-bg-gray {\n  background-color: var(--lay-color-gray-1) !important;\n  color: var(--lay-color-black-6) !important;\n}\n.dark .layui-badge-rim,\n.dark .layui-border,\n.dark .layui-colla-content,\n.dark .layui-colla-item,\n.dark .layui-collapse,\n.dark .layui-elem-field,\n.dark .layui-form-pane .layui-form-item[pane],\n.dark .layui-form-pane .layui-form-label,\n.dark .layui-input,\n.dark .layui-input-split,\n.dark .layui-panel,\n.dark .layui-select,\n.dark .layui-tab-bar,\n.dark .layui-tab-card,\n.dark .layui-tab-title,\n.dark .layui-tab-title .layui-this:after,\n.dark .layui-textarea {\n  border-color: var(--lay-color-border-1);\n}\n.dark .layui-border {\n  color: var(--lay-color-text-1) !important;\n}\n.dark .layui-border-red {\n  border-color: var(--lay-color-red-6) !important;\n  color: var(--lay-color-red-6) !important;\n}\n.dark .layui-border-orange {\n  border-color: var(--lay-color-orange-6) !important;\n  color: var(--lay-color-orange-6) !important;\n}\n.dark .layui-border-green {\n  border-color: var(--lay-color-layuigreen-6) !important;\n  color: var(--lay-color-layuigreen-6) !important;\n}\n.dark .layui-border-cyan {\n  border-color: var(--lay-color-cyan-6) !important;\n  color: var(--lay-color-cyan-6) !important;\n}\n.dark .layui-border-blue {\n  border-color: var(--lay-color-blue-6) !important;\n  color: var(--lay-color-blue-6) !important;\n}\n.dark .layui-border-purple {\n  border-color: var(--lay-color-purple-6) !important;\n  color: var(--lay-color-purple-6) !important;\n}\n.dark .layui-border-black {\n  border-color: var(--lay-color-black-6) !important;\n  color: var(--lay-color-text-1) !important;\n}\n.dark .layui-text {\n  color: var(--lay-color-text-2);\n}\n.dark .layui-text-em,\n.dark .layui-word-aux {\n  color: var(--lay-color-text-3) !important;\n}\n.dark .layui-text a:not(.layui-btn) {\n  color: var(--lay-color-lightblue-6);\n}\n.dark .layui-text blockquote:not(.layui-elem-quote) {\n  border-left: 5px solid var(--lay-color-border-4);\n}\n.dark .layui-font-red {\n  color: var(--lay-color-red-6) !important;\n}\n.dark .layui-font-orange {\n  color: var(--lay-color-orange-6) !important;\n}\n.dark .layui-font-green {\n  color: var(--lay-color-layuigreen-6) !important;\n}\n.dark .layui-font-cyan {\n  color: var(--lay-color-cyan-6) !important;\n}\n.dark .layui-font-blue {\n  color: var(--lay-color-lightblue-6) !important;\n}\n.dark .layui-font-black {\n  color: var(--lay-color-black) !important;\n}\n.dark .layui-font-purple {\n  color: var(--lay-color-purple-6) !important;\n}\n.dark .layui-font-gray {\n  color: var(--lay-color-gray-7) !important;\n}\n.dark .layui-btn {\n  border: 1px solid transparent;\n  background-color: var(--lay-color-primary);\n  color: var(--lay-color-text-1);\n}\n.dark .layui-btn:hover {\n  color: var(--lay-color-text-2);\n}\n.dark .layui-btn-primary {\n  border-color: var(--lay-color-border-2);\n  color: var(--lay-color-text-1);\n  background-color: var(--lay-color-bg-4);\n}\n.dark .layui-btn-" +
            "primary:hover {\n  border-color: transparent;\n  color: var(--lay-color-text-2);\n}\n.dark .layui-btn-normal {\n  background-color: var(--lay-color-normal);\n}\n.dark .layui-btn-warm {\n  background-color: var(--lay-color-warning);\n}\n.dark .layui-btn-danger {\n  background-color: var(--lay-color-danger);\n}\n.dark .layui-btn-checked {\n  background-color: var(--lay-color-success);\n}\n.dark .layui-btn-disabled,\n.dark .layui-btn-disabled:active,\n.dark .layui-btn-disabled:hover {\n  border-color: var(--lay-color-border-2) !important;\n  background-color: var(--lay-color-bg-2) !important;\n  color: var(--lay-color-text-4) !important;\n}\n.dark .layui-btn-group .layui-btn {\n  border-left: 1px solid var(--lay-color-border-2);\n}\n.dark .layui-btn-group .layui-btn-primary:hover {\n  border-color: var(--lay-color-border-2);\n  color: var(--lay-color-primary);\n}\n.dark .layui-btn-group .layui-btn-primary:first-child {\n  border-left: 1px solid var(--lay-color-gray-5);\n}\n.dark .layui-input,\n.dark .layui-select,\n.dark .layui-textarea {\n  background-color: var(--lay-color-fill-2);\n  color: var(--lay-color-text-2);\n}\n.dark .layui-input:hover,\n.dark .layui-textarea:hover {\n  border-color: var(--lay-color-border-2) !important;\n}\n.dark .layui-input:focus,\n.dark .layui-textarea:focus {\n  border-color: var(--lay-color-secondary-hover) !important;\n  background-color: var(--lay-color-bg-2);\n  box-shadow: 0 0 0 3px rgba(22, 183, 119, 0.08);\n}\n.dark .layui-input[disabled],\n.dark .layui-select[disabled],\n.dark .layui-textarea[disabled],\n.dark .layui-input.layui-disabled,\n.dark .layui-textarea.layui-disabled {\n  background-color: var(--lay-color-fill-1);\n  color: var(--lay-color-text-4);\n  border-color: var(--lay-color-border-1) !important;\n  box-shadow: 0 0 0 0;\n}\n.dark .layui-form-danger + .layui-form-select .layui-input,\n.dark .layui-form-danger:focus {\n  border-color: var(--lay-color-danger) !important;\n  box-shadow: 0 0 0 3px rgba(255, 87, 34, 0.08);\n}\n.dark .layui-input-prefix .layui-icon,\n.dark .layui-input-split .layui-icon,\n.dark .layui-input-suffix .layui-icon {\n  color: var(--lay-color-gray-8);\n}\n.dark .layui-input-wrap .layui-input:hover + .layui-input-split {\n  border-color: var(--lay-color-border-2);\n}\n.dark .layui-input-wrap .layui-input[disabled]:hover + .layui-input-split {\n  border-color: var(--lay-color-border-1);\n}\n.dark .layui-input-wrap .layui-input:focus + .layui-input-split {\n  border-color: var(--lay-color-secondary-hover);\n}\n.dark .layui-input-wrap .layui-input.layui-form-danger:focus + .layui-input-split {\n  border-color: var(--lay-color-danger);\n}\n.dark .layui-input-affix .layui-icon {\n  color: var(--lay-color-text-2);\n}\n.dark .layui-input-affix .layui-icon-clear {\n  color: var(--lay-color-text-2);\n}\n.dark .layui-input-affix .layui-icon:hover {\n  color: var(--lay-color-text-3);\n}\n.dark .layui-input-wrap .layui-input-number .layui-icon-up {\n  border-bottom-color: var(--lay-color-border-1);\n}\n.dark .layui-input-wrap .layui-input[type=\"number\"].layui-input-number-out-of-range {\n  color: var(--lay-color-danger);\n}\n.dark .layui-form-select {\n  color: var(--lay-color-text-2);\n}\n.dark .layui-form-select .layui-edge {\n  border-top-color: var(--lay-color-gray-8);\n}\n.dark .layui-form-select dl {\n  border: 1px solid var(--lay-color-border-2);\n  background-color: var(--lay-color-bg-5);\n  box-shadow: var(--lay-shadow-2);\n}\n.dark .layui-form-select dl dt {\n  color: var(--lay-color-gray-8);\n}\n.dark .layui-form-select dl dd:hover {\n  background-color: var(--lay-color-active);\n}\n.dark .layui-form-select dl dd.layui-select-tips {\n  color: var(--lay-color-text-2);\n}\n.dark .layui-form-select dl dd.layui-this {\n  background-color: var(--lay-color-active);\n  color: var(--lay-color-text-1);\n}\n.dark .layui-form-select dl dd.layui-disabled,\n.dark .layui-form-select dl dd:hover.layui-disabled {\n  background-color: var(--lay-color-bg-5);\n}\n.dark .layui-select-none {\n  color: var(--lay-color-black-8);\n}\n.dark .layui-select-disabled .layui-disabled {\n  border-color: var(--lay-color-border-1) !important;\n}\n.dark .layui-select-disabled .layui-edge {\n  border-top-color: var(--lay-color-gray-6);\n}\n.dark .layui-form-checkbox {\n  background-color: var(--lay-color-fill-2);\n}\n.dark .layui-form-checkbox > div {\n  background-color: var(--lay-color-fill-3);\n  color: var(--lay-color-text-2);\n}\n.dark .layui-form-checkbox:hover > div {\n  background-color: var(--lay-color-active);\n}\n.dark .layui-form-checkbox > i {\n  background-color: var(--lay-color-fill-1);\n  border-top-color: var(--lay-color-border-1);\n  border-right-color: var(--lay-color-border-1);\n  border-bottom-color: var(--lay-color-border-1);\n  border-left-color: initial;\n  color: var(--lay-color-text-1);\n}\n.dark .layui-form-checkbox:hover > i {\n  border-color: var(--lay-color-border-2);\n  color: var(--lay-color-text-4);\n}\n.dark .layui-form-checked,\n.dark .layui-form-checked:hover {\n  border-color: var(--lay-color-secondary-active);\n}\n.dark .layui-form-checked > div,\n.dark .layui-form-checked:hover > div {\n  background-color: var(--lay-color-secondary);\n}\n.dark .layui-form-checked > i,\n.dark .layui-form-checked:hover > i {\n  color: var(--lay-color-secondary-hover);\n}\n.dark .layui-form-checkbox.layui-checkbox-disabled > div {\n  background-color: var(--lay-color-fill-3) !important;\n}\n.dark .layui-form-checkbox[lay-skin=primary] {\n  background-image: none;\n  background-color: initial;\n  border-color: initial !important;\n}\n.dark .layui-form-checkbox[lay-skin=primary] > div {\n  background-image: none;\n  background-color: initial;\n  color: var(--lay-color-text-2);\n}\n.dark .layui-form-checkbox[lay-skin=primary] > i {\n  border-color: var(--lay-color-border-1);\n  background-color: var(--lay-color-fill-2);\n}\n.dark .layui-form-checkbox[lay-skin=primary]:hover > i {\n  border-color: var(--lay-color-secondary-hover);\n  color: var(--lay-color-text-1);\n}\n.dark .layui-form-checked[lay-skin=primary] > i {\n  background-color: var(--lay-color-secondary);\n  color: var(--lay-color-text-1);\n  border-color: var(--lay-color-secondary-active) !important;\n}\n.dark .layui-checkbox-disabled[lay-skin=primary] > div {\n  background: none!important;\n  color: var(--lay-color-text-4) !important;\n}\n.dark .layui-form-checked.layui-checkbox-disabled[lay-skin=primary] > i {\n  background-color: var(--lay-color-fill-1) !important;\n  border-color: var(--lay-color-border-2) !important;\n}\n.dark .layui-checkbox-disabled[lay-skin=primary]:hover > i {\n  border-color: var(--lay-color-border-1);\n}\n.dark .layui-form-checkbox[lay-s" +
            "kin=\"primary\"] > .layui-icon-indeterminate:before {\n  background-color: var(--lay-color-secondary-hover);\n  opacity: 1;\n}\n.dark .layui-form-checkbox[lay-skin=\"primary\"]:hover > .layui-icon-indeterminate:before {\n  opacity: 1;\n}\n.dark .layui-form-checkbox[lay-skin=\"primary\"] > .layui-icon-indeterminate {\n  border-color: var(--lay-color-secondary-hover);\n}\n.dark .layui-form-switch {\n  border-color: var(--lay-color-border-2);\n  background-color: var(--lay-color-fill-2);\n}\n.dark .layui-form-switch > i {\n  background-color: var(--lay-color-gray-4);\n}\n.dark .layui-form-switch.layui-checkbox-disabled > i {\n  background-color: var(--lay-color-gray-7);\n}\n.dark .layui-form-switch > div {\n  color: var(--lay-color-gray-8) !important;\n}\n.dark .layui-form-onswitch {\n  border-color: var(--lay-color-secondary-active);\n  background-color: var(--lay-color-secondary);\n}\n.dark .layui-form-onswitch > i {\n  background-color: var(--lay-color-gray-4);\n}\n.dark .layui-form-onswitch > div {\n  color: var(--lay-color-text-1) !important;\n}\n.dark .layui-checkbox-disabled {\n  border-color: var(--lay-color-border-2) !important;\n}\n.dark .layui-checkbox-disabled > div {\n  background-color: var(--lay-color-fill-3) !important;\n  color: var(--lay-color-text-4) !important;\n}\n.dark .layui-checkbox-disabled > i {\n  border-color: var(--lay-color-border-2) !important;\n}\n.dark .layui-checkbox-disabled:hover > i {\n  color: var(--lay-color-text-1) !important;\n}\n.dark .layui-form-switch.layui-checkbox-disabled > div {\n  background-color: initial!important;\n  color: var(--lay-color-text-3) !important;\n}\n.dark .layui-form-checkbox > i:before {\n  opacity: 0;\n  filter: alpha(opacity=0);\n}\n.dark .layui-form-checkbox:hover > i:before {\n  opacity: 1;\n  filter: alpha(opacity=100);\n}\n.dark .layui-form-checked.layui-checkbox-disabled:hover > i:before,\n.dark .layui-form-checked:hover > i:before,\n.dark .layui-form-checked > i:before {\n  opacity: 1;\n  filter: alpha(opacity=100);\n}\n.dark .layui-form-checkbox[lay-skin=primary]:hover > i:before {\n  opacity: 0;\n  filter: alpha(opacity=0);\n}\n.dark .layui-form-checked[lay-skin=primary]:hover > i:before {\n  opacity: 1;\n  filter: alpha(opacity=100);\n}\n.dark .layui-checkbox-disabled:hover > i:before {\n  opacity: 0;\n  filter: alpha(opacity=0);\n}\n.dark .layui-form-radio > i {\n  color: var(--lay-color-gray-8);\n}\n.dark .layui-form-radio:hover > *,\n.dark .layui-form-radioed,\n.dark .layui-form-radioed > i {\n  color: var(--lay-color-secondary);\n}\n.dark .layui-radio-disabled > i {\n  color: var(--lay-color-text-4) !important;\n}\n.dark .layui-radio-disabled > * {\n  color: var(--lay-color-text-4) !important;\n}\n.dark .layui-form-pane .layui-form-label {\n  background-color: var(--lay-color-bg-2);\n}\n.dark .layui-laypage a,\n.dark .layui-laypage button,\n.dark .layui-laypage input,\n.dark .layui-laypage select,\n.dark .layui-laypage span {\n  border: 1px solid var(--lay-color-border-2);\n}\n.dark .layui-laypage a,\n.dark .layui-laypage span {\n  background-color: var(--lay-color-bg-2);\n  color: var(--lay-color-text-2);\n}\n.dark .layui-laypage a[data-page] {\n  color: var(--lay-color-text-2);\n}\n.dark .layui-laypage a:hover {\n  color: var(--lay-color-primary);\n}\n.dark .layui-laypage .layui-laypage-spr {\n  color: var(--lay-color-text-3);\n}\n.dark .layui-laypage .layui-laypage-curr em {\n  color: var(--lay-color-white);\n}\n.dark .layui-laypage .layui-laypage-curr .layui-laypage-em {\n  background-color: var(--lay-color-primary);\n}\n.dark .layui-laypage .layui-laypage-skip {\n  color: var(--lay-color-text-3);\n}\n.dark .layui-laypage button,\n.dark .layui-laypage input {\n  background-color: var(--lay-color-bg-2);\n}\n.dark .layui-laypage input:focus,\n.dark .layui-laypage select:focus {\n  border-color: var(--lay-color-primary) !important;\n}\n.dark .layui-flow-more {\n  color: var(--lay-color-text-1);\n}\n.dark .layui-flow-more a cite {\n  background-color: var(--lay-color-bg-4);\n  color: var(--lay-color-text-1);\n}\n.dark .layui-flow-more a i {\n  color: var(--lay-color-text-2);\n}\n.dark .layui-table {\n  background-color: var(--lay-color-bg-2);\n  color: var(--lay-color-text-2);\n}\n.dark .layui-table-mend {\n  background-color: var(--lay-color-bg-2);\n}\n.dark .layui-table-click,\n.dark .layui-table-hover,\n.dark .layui-table[lay-even] tbody tr:nth-child(even) {\n  background-color: var(--lay-color-fill-3);\n}\n.dark .layui-table-checked {\n  background-color: var(--lay-color-fill-2);\n  color: var(--lay-color-text-1);\n}\n.dark .layui-table-checked.layui-table-hover,\n.dark .layui-table-checked.layui-table-click {\n  background-color: var(--lay-color-fill-3);\n}\n.dark .layui-table td,\n.dark .layui-table th,\n.dark .layui-table-col-set,\n.dark .layui-table-fixed-r,\n.dark .layui-table-grid-down,\n.dark .layui-table-header,\n.dark .layui-table-mend,\n.dark .layui-table-page,\n.dark .layui-table-tips-main,\n.dark .layui-table-tool,\n.dark .layui-table-total,\n.dark .layui-table-view,\n.dark .layui-table[lay-skin=line],\n.dark .layui-table[lay-skin=row] {\n  border-color: var(--lay-color-border-2);\n}\n.dark .layui-table-view:after {\n  background-color: var(--lay-color-border-2);\n}\n.dark .layui-table-view .layui-table td[data-edit]:hover:after {\n  border: 1px solid var(--lay-color-primary-active);\n}\n.dark .layui-table-loading-icon .layui-icon {\n  color: var(--lay-color-gray-8);\n}\n.dark .layui-table-page {\n  background-color: var(--lay-color-bg-2);\n}\n.dark .layui-table-page .layui-laypage a,\n.dark .layui-table-page .layui-laypage span {\n  border: none;\n}\n.dark .layui-table-tool {\n  background-color: var(--lay-color-bg-2);\n}\n.dark .layui-table-tool .layui-inline[lay-event] {\n  color: var(--lay-color-text-3);\n  border: 1px solid var(--lay-color-border-2);\n}\n.dark .layui-table-tool .layui-inline[lay-event]:hover {\n  border: 1px solid var(--lay-color-border-3);\n}\n.dark .layui-table-tool-panel {\n  color: var(--lay-color-text-1);\n  border: 1px solid var(--lay-color-border-2);\n  background-color: var(--lay-color-bg-5);\n  box-shadow: var(--lay-shadow-2);\n}\n.dark .layui-table-tool-panel li:hover {\n  background-color: var(--lay-color-active);\n}\n.dark .layui-table-col-set {\n  background-color: var(--lay-color-white);\n}\n.dark .layui-table-sort .layui-table-sort-asc {\n  border-bottom-color: var(--lay-color-gray-8);\n}\n.dark .layui-table-sort .layui-table-sort-asc:hover {\n  border-bottom-color: var(--lay-color-gray-11);\n}\n.dark .layui-table-sort .layui-table-sort-desc {\n  border-top-color: var(--lay-color-gray-8);\n}\n.dark .layui-table-sort .layui-table-sort-desc:hover {\n  border-top-color: var(--l" +
            "ay-color-gray-11);\n}\n.dark .layui-table-sort[lay-sort=asc] .layui-table-sort-asc {\n  border-bottom-color: var(--lay-color-gray-13);\n}\n.dark .layui-table-sort[lay-sort=desc] .layui-table-sort-desc {\n  border-top-color: var(--lay-color-gray-13);\n}\n.dark .layui-table-cell .layui-table-link {\n  color: var(--lay-color-lightblue-5);\n}\n.dark .layui-table-body .layui-none {\n  color: var(--lay-color-gray-8);\n}\n.dark .layui-table-fixed-l {\n  box-shadow: 1px 0 8px #000000;\n}\n.dark .layui-table-fixed-r {\n  box-shadow: -1px 0 8px #000000;\n}\n.dark .layui-table-edit {\n  box-shadow: var(--lay-shadow-1);\n  background-color: var(--lay-color-bg-2);\n}\n.dark .layui-table-edit:focus {\n  border-color: var(--lay-color-secondary) !important;\n}\n.dark select.layui-table-edit {\n  border-color: var(--lay-color-border-2);\n}\n.dark .layui-table-grid-down {\n  background-color: var(--lay-color-bg-5);\n  color: var(--lay-color-gray-8);\n}\n.dark .layui-table-grid-down:hover {\n  background-color: var(--lay-color-bg-5);\n}\n.dark .layui-table-cell-c {\n  background-color: var(--lay-color-gray-13);\n  color: var(--lay-color-text-1);\n  border-color: var(--lay-color-border-3);\n}\n.dark .layui-table-cell-c:hover {\n  border-color: var(--lay-color-secondary-hover);\n}\n.dark body .layui-table-tips .layui-layer-content {\n  box-shadow: var(--lay-shadow-3);\n}\n.dark .layui-table-tips-main {\n  background-color: var(--lay-color-bg-5);\n  color: var(--lay-color-text-3);\n}\n.dark .layui-table-tips-c {\n  background-color: var(--lay-color-gray-13);\n  color: var(--lay-color-text-1);\n}\n.dark .layui-table-tips-c:hover {\n  background-color: var(--lay-color-gray-10);\n}\n.dark .layui-upload-choose {\n  color: var(--lay-color-gray-8);\n}\n.dark .layui-upload-drag {\n  border: 1px dashed var(--lay-color-border-2);\n  background-color: var(--lay-color-bg-4);\n  color: var(--lay-color-text-2);\n}\n.dark .layui-upload-drag .layui-icon {\n  color: var(--lay-color-primary);\n}\n.dark .layui-upload-drag[lay-over] {\n  border-color: var(--lay-color-primary);\n}\n.dark .layui-menu {\n  background-color: var(--lay-color-bg-2);\n}\n.dark .layui-menu li {\n  color: var(--lay-color-text-1);\n}\n.dark .layui-menu li:hover {\n  background-color: var(--lay-color-bg-5);\n}\n.dark .layui-menu li.layui-disabled,\n.dark .layui-menu li.layui-disabled * {\n  color: var(--lay-color-text-4) !important;\n}\n.dark .layui-menu .layui-menu-item-group > .layui-menu-body-title {\n  color: var(--lay-color-text-3);\n}\n.dark .layui-menu .layui-menu-item-none {\n  color: var(--lay-color-text-3);\n}\n.dark .layui-menu .layui-menu-item-divider {\n  border-bottom: 1px solid var(--lay-color-border-2);\n}\n.dark .layui-menu .layui-menu-item-group:hover,\n.dark .layui-menu .layui-menu-item-none:hover,\n.dark .layui-menu .layui-menu-item-divider:hover {\n  background: none;\n}\n.dark .layui-menu .layui-menu-item-up > .layui-menu-body-title {\n  color: var(--lay-color-text-1);\n}\n.dark .layui-menu .layui-menu-item-down:hover > .layui-menu-body-title > .layui-icon,\n.dark .layui-menu .layui-menu-item-up > .layui-menu-body-title:hover > .layui-icon {\n  color: var(--lay-color-text-1);\n}\n.dark .layui-menu .layui-menu-item-checked,\n.dark .layui-menu .layui-menu-item-checked2 {\n  background-color: var(--lay-color-active) !important;\n  color: var(--lay-color-secondary);\n}\n.dark .layui-menu .layui-menu-item-checked a,\n.dark .layui-menu .layui-menu-item-checked2 a {\n  color: var(--lay-color-secondary);\n}\n.dark .layui-menu .layui-menu-item-checked:after {\n  border-right: 3px solid var(--lay-color-secondary);\n}\n.dark .layui-menu-body-title a {\n  color: var(--lay-color-text-1);\n}\n.dark .layui-menu-lg .layui-menu-body-title a:hover,\n.dark .layui-menu-lg li:hover {\n  color: var(--lay-color-secondary);\n}\n.dark .layui-dropdown {\n  background-color: var(--lay-color-bg-5);\n}\n.dark .layui-dropdown.layui-panel,\n.dark .layui-dropdown .layui-panel {\n  background-color: var(--lay-color-bg-5);\n  box-shadow: var(--lay-shadow-2);\n}\n.dark .layui-dropdown.layui-panel .layui-menu {\n  background-color: var(--lay-color-bg-5);\n}\n.dark .layui-nav {\n  background-color: var(--lay-color-black-6);\n  color: var(--lay-color-white);\n}\n.dark .layui-nav .layui-nav-item a {\n  color: var(--lay-color-text-1);\n}\n.dark .layui-nav .layui-this:after,\n.dark .layui-nav-bar {\n  background-color: var(--lay-color-secondary);\n}\n.dark .layui-nav .layui-nav-item a:hover,\n.dark .layui-nav .layui-this a {\n  color: var(--lay-color-text-1);\n}\n.dark .layui-nav-child {\n  box-shadow: var(--lay-shadow-2);\n  border: 1px solid var(--lay-color-border-2);\n  background-color: var(--lay-color-bg-5);\n}\n.dark .layui-nav .layui-nav-child a {\n  color: var(--lay-color-text-1);\n}\n.dark .layui-nav .layui-nav-child a:hover {\n  background-color: var(--lay-color-bg-5);\n  color: var(--lay-color-text-1);\n}\n.dark .layui-nav-child dd.layui-this {\n  background-color: var(--lay-color-bg-5);\n  color: var(--lay-color-text-1);\n}\n.dark .layui-nav-tree .layui-nav-child dd.layui-this,\n.dark .layui-nav-tree .layui-nav-child dd.layui-this a,\n.dark .layui-nav-tree .layui-this,\n.dark .layui-nav-tree .layui-this > a,\n.dark .layui-nav-tree .layui-this > a:hover {\n  background-color: var(--lay-color-primary);\n  color: var(--lay-color-white);\n}\n.dark .layui-nav-itemed > a,\n.dark .layui-nav-tree .layui-nav-title a,\n.dark .layui-nav-tree .layui-nav-title a:hover {\n  color: var(--lay-color-white) !important;\n}\n.dark .layui-nav-tree .layui-nav-bar {\n  background-color: var(--lay-color-primary);\n}\n.dark .layui-nav-tree .layui-nav-child {\n  background: none;\n  background-color: rgba(0, 0, 0, 0.3);\n  border: none;\n  box-shadow: none;\n}\n.dark .layui-nav-tree .layui-nav-child a {\n  color: var(--lay-color-white);\n  color: var(--lay-color-text-1);\n}\n.dark .layui-nav-tree .layui-nav-child a:hover {\n  background: none;\n  color: var(--lay-color-white);\n}\n.dark .layui-nav.layui-bg-gray,\n.dark .layui-nav-tree.layui-bg-gray {\n  background-color: var(--lay-color-bg-2) !important;\n  color: var(--lay-color-text-1);\n}\n.dark .layui-nav-tree.layui-bg-gray .layui-nav-child {\n  background-color: rgba(0, 0, 0, 0.3) !important;\n}\n.dark .layui-nav-tree.layui-bg-gray a,\n.dark .layui-nav.layui-bg-gray .layui-nav-item a {\n  color: var(--lay-color-text-1);\n}\n.dark .layui-nav.layui-bg-gray .layui-nav-child {\n  background-color: var(--lay-color-bg-5);\n}\n.dark .layui-nav-tree.layui-bg-gray .layui-nav-itemed > a {\n  color: var(--lay-color-text-1) !important;\n}\n.dark .layui-nav.layui-bg-gray .layui-this a {\n  color: var(--lay-color-secondary);\n}\n.dark .layui-nav-tree." +
            "layui-bg-gray .layui-nav-child dd.layui-this,\n.dark .layui-nav-tree.layui-bg-gray .layui-nav-child dd.layui-this a,\n.dark .layui-nav-tree.layui-bg-gray .layui-this,\n.dark .layui-nav-tree.layui-bg-gray .layui-this > a {\n  color: var(--lay-color-secondary) !important;\n}\n.dark .layui-nav-tree.layui-bg-gray .layui-nav-bar {\n  background-color: var(--lay-color-secondary);\n}\n.dark .layui-breadcrumb a {\n  color: var(--lay-color-gray-7) !important;\n}\n.dark .layui-breadcrumb a:hover {\n  color: var(--lay-color-secondary) !important;\n}\n.dark .layui-breadcrumb a cite {\n  color: var(--lay-color-gray-8);\n}\n.dark .layui-breadcrumb span[lay-separator] {\n  color: var(--lay-color-gray-7);\n}\n.dark .layui-tab .layui-tab-title:after {\n  border-bottom-color: var(--lay-color-border-1);\n}\n.dark .layui-tab-title .layui-this {\n  color: var(--lay-color-text-2);\n}\n.dark .layui-tab-title .layui-this:after {\n  border-bottom-color: var(--lay-color-bg-1);\n}\n.dark .layui-tab-bar {\n  background-color: var(--lay-color-bg-3);\n}\n.dark .layui-tab-more li.layui-this:after {\n  border-bottom-color: var(--lay-color-border-1);\n}\n.dark .layui-tab-title li .layui-tab-close {\n  color: var(--lay-color-gray-8);\n}\n.dark .layui-tab-title li .layui-tab-close:hover {\n  background-color: var(--lay-color-danger);\n  color: var(--lay-color-white);\n}\n.dark .layui-tab-brief > .layui-tab-title .layui-this {\n  color: var(--lay-color-primary);\n}\n.dark .layui-tab-brief > .layui-tab-more li.layui-this:after,\n.dark .layui-tab-brief > .layui-tab-title .layui-this:after {\n  border-bottom: 2px solid var(--lay-color-secondary);\n}\n.dark .layui-tab-card {\n  box-shadow: var(--lay-shadow-1);\n}\n.dark .layui-tab-card > .layui-tab-title {\n  background-color: var(--lay-color-bg-2);\n}\n.dark .layui-tab-card > .layui-tab-title .layui-this {\n  background-color: var(--lay-color-bg-1);\n}\n.dark .layui-tab-card > .layui-tab-title .layui-this:after {\n  border-bottom-color: var(--lay-color-bg-1);\n}\n.dark .layui-tab-card > .layui-tab-more .layui-this {\n  color: var(--lay-color-secondary);\n}\n.dark .layui-tabs-header:after,\n.dark .layui-tabs-scroll:after {\n  border-bottom-color: var(--lay-color-border-1);\n}\n.dark .layui-tabs-card > .layui-tabs-header .layui-this {\n  background-color: transparent;\n}\n.dark .layui-tabs-card > .layui-tabs-header .layui-this:after {\n  border-color: var(--lay-color-border-1);\n  border-bottom-color: var(--lay-color-bg-1);\n}\n.dark .layui-tabs-card.layui-panel > .layui-tabs-header .layui-this:after {\n  border-bottom-color: var(--lay-color-bg-2);\n}\n.dark .layui-tabs-bar .layui-icon {\n  background-color: var(--lay-color-bg-1);\n  color: var(--lay-color-text-2);\n  border-color: var(--lay-color-border-1);\n  box-shadow: 2px 0 5px 0 rgba(0, 0, 0, 0.32);\n}\n.dark .layui-tabs-bar .layui-icon-next {\n  box-shadow: -2px 0 5px 0 rgba(0, 0, 0, 0.32);\n}\n.dark .layui-timeline-axis {\n  background-color: var(--lay-color-bg-4);\n  color: var(--lay-color-secondary);\n}\n.dark .layui-timeline-axis:hover {\n  color: var(--lay-color-red-6);\n}\n.dark .layui-timeline-item:before {\n  background-color: var(--lay-color-bg-3);\n}\n.dark .layui-badge,\n.dark .layui-badge-dot,\n.dark .layui-badge-rim {\n  background-color: var(--lay-color-red-6);\n  color: var(--lay-color-white);\n}\n.dark .layui-badge-rim {\n  background-color: var(--lay-color-white);\n  color: var(--lay-color-black-6);\n}\n.dark .layui-carousel {\n  background-color: var(--lay-color-gray-2);\n}\n.dark .layui-carousel > [carousel-item]:before {\n  color: var(--lay-color-gray-8);\n  -moz-osx-font-smoothing: grayscale;\n}\n.dark .layui-carousel > [carousel-item] > * {\n  background-color: var(--lay-color-gray-2);\n}\n.dark .layui-carousel-arrow {\n  background-color: rgba(0, 0, 0, 0.2);\n  color: var(--lay-color-white);\n}\n.dark .layui-carousel-arrow:hover,\n.dark .layui-carousel-ind ul:hover {\n  background-color: var(--lay-color-black);\n}\n.dark .layui-carousel[lay-indicator=outside] .layui-carousel-ind ul {\n  background-color: var(--lay-color-black);\n}\n.dark .layui-carousel-ind ul {\n  background-color: rgba(0, 0, 0, 0.2);\n}\n.dark .layui-carousel-ind ul li {\n  background-color: var(--lay-color-gray-3);\n  background-color: var(--lay-color-text-3);\n}\n.dark .layui-carousel-ind ul li:hover {\n  background-color: var(--lay-color-white);\n}\n.dark .layui-carousel-ind ul li.layui-this {\n  background-color: var(--lay-color-white);\n}\n.dark .layui-fixbar li {\n  background-color: var(--lay-color-black-5);\n  color: var(--lay-color-text-1);\n}\n.dark body .layui-util-face .layui-layer-content {\n  background-color: var(--lay-color-bg-5);\n  color: var(--lay-color-text-2);\n}\n.dark .layui-util-face ul {\n  border: 1px solid var(--lay-color-border-3);\n  background-color: var(--lay-color-bg-5);\n  box-shadow: var(--lay-shadow-2);\n}\n.dark .layui-util-face ul li {\n  border: 1px solid var(--lay-color-border-2);\n}\n.dark .layui-util-face ul li:hover {\n  border: 1px solid var(--lay-color-red-7);\n  background: var(--lay-color-text-1);\n}\n.dark .layui-code {\n  border: 1px solid var(--lay-color-border-2);\n  background-color: var(--lay-color-bg-white);\n  color: var(--lay-color-text-2);\n}\n.dark .layui-transfer-box,\n.dark .layui-transfer-header,\n.dark .layui-transfer-search {\n  border-color: var(--lay-color-border-2);\n}\n.dark .layui-transfer-box {\n  background-color: var(--lay-color-bg-2);\n}\n.dark .layui-transfer-search .layui-icon-search {\n  color: var(--lay-color-gray-8);\n}\n.dark .layui-transfer-active .layui-btn {\n  background-color: var(--lay-color-secondary);\n  border-color: var(--lay-color-secondary);\n  color: var(--lay-color-white);\n}\n.dark .layui-transfer-active .layui-btn-disabled {\n  background-color: var(--lay-color-gray-2);\n  border-color: var(--lay-color-gray-3);\n  color: var(--lay-color-gray-8);\n}\n.dark .layui-transfer-data li:hover {\n  background-color: var(--lay-color-active);\n}\n.dark .layui-transfer-data li:hover:has([lay-filter=\"layTransferCheckbox\"][disabled]) {\n  background-color: var(--lay-color-bg-2);\n}\n.dark .layui-transfer-data .layui-none {\n  color: var(--lay-color-gray-7);\n}\n.dark .layui-rate li i.layui-icon {\n  color: var(--lay-color-orange-6);\n}\n.dark .layui-colorpicker {\n  border: 1px solid var(--lay-color-border-1);\n}\n.dark .layui-colorpicker:hover {\n  border-color: var(--lay-color-border-2);\n}\n.dark .layui-colorpicker-trigger-span {\n  border: 1px solid var(--lay-color-border-1);\n}\n.dark .layui-colorpicker-trigger-i {\n  color: var(--lay-color-white);\n}\n.dark .layui-colorpicker-trigger-i.layui-icon-close {\n  color: var(--lay-color-black-7);\n}\n.da" +
            "rk .layui-colorpicker-main {\n  background: var(--lay-color-bg-2);\n  border: 1px solid var(--lay-color-border-2);\n  box-shadow: var(--lay-shadow-2);\n}\n.dark .layui-colorpicker-basis-white {\n  background: linear-gradient(90deg, #fff, hsla(0, 0%, 100%, 0));\n}\n.dark .layui-colorpicker-basis-black {\n  background: linear-gradient(0deg, #000, transparent);\n}\n.dark .layui-colorpicker-basis-cursor {\n  border: 1px solid var(--lay-color-white);\n}\n.dark .layui-colorpicker-side {\n  background: linear-gradient(linear-gradient(#F00, #FF0, #0F0, #0FF, #00F, #F0F, #F00));\n}\n.dark .layui-colorpicker-side-slider {\n  box-shadow: var(--lay-shadow-1);\n  background: var(--lay-color-white);\n  border: 1px solid var(--lay-color-gray-2);\n}\n.dark .layui-colorpicker-alpha-slider {\n  box-shadow: var(--lay-shadow-1);\n  background: var(--lay-color-white);\n  border: 1px solid var(--lay-color-gray-2);\n}\n.dark .layui-colorpicker-pre.layui-this {\n  box-shadow: var(--lay-shadow-1);\n}\n.dark .layui-colorpicker-pre.selected {\n  box-shadow: var(--lay-shadow-1);\n}\n.dark .layui-colorpicker-main-input input.layui-input {\n  color: var(--lay-color-text-2);\n}\n.dark .layui-slider {\n  background: var(--lay-color-bg-5);\n}\n.dark .layui-slider-step {\n  background: var(--lay-color-fill-4);\n}\n.dark .layui-slider-wrap-btn {\n  background: var(--lay-color-bg-4);\n}\n.dark .layui-slider-tips {\n  color: var(--lay-color-text-1);\n  background: var(--lay-color-black);\n  box-shadow: var(--lay-shadow-3);\n}\n.dark .layui-slider-tips:after {\n  border-color: var(--lay-color-black) transparent transparent transparent;\n}\n.dark .layui-slider-input {\n  border: 1px solid var(--lay-color-border-1);\n}\n.dark .layui-slider-input-btn {\n  border-left: 1px solid var(--lay-color-border-1);\n}\n.dark .layui-slider-input-btn i {\n  color: var(--lay-color-gray-9);\n}\n.dark .layui-slider-input-btn i:first-child {\n  border-bottom: 1px solid var(--lay-color-border-1);\n}\n.dark .layui-slider-input-btn i:hover {\n  color: var(--lay-color-primary);\n}\n.dark .layui-tree-line .layui-tree-set .layui-tree-set:after {\n  border-top: 1px dotted var(--lay-color-gray-7);\n}\n.dark .layui-tree-entry:hover {\n  background-color: var(--lay-color-bg-4);\n}\n.dark .layui-tree-line .layui-tree-entry:hover {\n  background-color: var(--lay-color-black);\n}\n.dark .layui-tree-line .layui-tree-entry:hover .layui-tree-txt {\n  color: var(--lay-color-text-3);\n}\n.dark .layui-tree-entry:hover:has(span.layui-tree-txt.layui-disabled) {\n  background-color: transparent !important;\n}\n.dark .layui-tree-line .layui-tree-set:before {\n  border-left: 1px dotted var(--lay-color-gray-7);\n}\n.dark .layui-tree-iconClick {\n  color: var(--lay-color-gray-7);\n}\n.dark .layui-tree-icon {\n  border: 1px solid var(--lay-color-gray-8);\n}\n.dark .layui-tree-icon .layui-icon {\n  color: var(--lay-color-text-1);\n}\n.dark .layui-tree-iconArrow:after {\n  border-color: transparent transparent transparent var(--lay-color-gray-7);\n}\n.dark .layui-tree-txt {\n  color: var(--lay-color-text-2);\n}\n.dark .layui-tree-search {\n  color: var(--lay-color-black-7);\n}\n.dark .layui-tree-btnGroup .layui-icon:hover {\n  color: var(--lay-color-text-2);\n}\n.dark .layui-tree-editInput {\n  background-color: var(--lay-color-fill-2);\n}\n.dark .layui-tree-emptyText {\n  color: var(--lay-color-text-2);\n}\n.dark .layui-code-view {\n  border: 1px solid var(--lay-color-border-1);\n}\n.dark .layui-code-view:not(.layui-code-hl) {\n  background-color: var(--lay-color-bg-2);\n  color: var(--lay-color-text-2);\n}\n.dark .layui-code-header {\n  border-bottom: 1px solid var(--lay-color-border-1);\n  background-color: var(--lay-color-bg-2);\n}\n.dark .layui-code-header > .layui-code-header-about {\n  color: var(--lay-color-text-2);\n}\n.dark .layui-code-view:not(.layui-code-hl) .layui-code-ln-side {\n  border-color: var(--lay-color-border-1);\n  background-color: var(--lay-color-bg-2);\n}\n.dark .layui-code-nowrap > .layui-code-ln-side {\n  background: none !important;\n}\n.dark .layui-code-fixbar > span {\n  color: var(--lay-color-text-3);\n}\n.dark .layui-code-fixbar > span:hover {\n  color: var(--lay-color-secondary-hover);\n}\n.dark .layui-code-theme-dark,\n.dark .layui-code-theme-dark > .layui-code-header {\n  border-color: rgba(126, 122, 122, 0.15);\n  background-color: #1f1f1f;\n}\n.dark .layui-code-theme-dark {\n  border-width: 1px;\n  color: #ccc;\n}\n.dark .layui-code-theme-dark > .layui-code-ln-side {\n  border-right-color: #2a2a2a;\n  background: none;\n  color: #6e7681;\n}\n.dark .layui-code-view.layui-code-hl > .layui-code-ln-side {\n  background-color: transparent;\n}\n.dark .layui-code-theme-dark.layui-code-hl,\n.dark .layui-code-theme-dark.layui-code-hl > .layui-code-ln-side {\n  border-color: rgba(126, 122, 122, 0.15);\n}\n.dark .layui-code-full {\n  background-color: var(--lay-color-bg-1);\n}\n.dark .layui-laydate-header i {\n  color: var(--lay-color-gray-8);\n}\n.dark .laydate-day-holidays:before {\n  color: var(--lay-color-red-6);\n}\n.dark .layui-laydate .layui-this .laydate-day-holidays:before {\n  color: var(--lay-color-white);\n}\n.dark .layui-laydate-footer span {\n  border: 1px solid var(--lay-color-border-2);\n  background-color: var(--lay-color-bg-5);\n}\n.dark .layui-laydate-footer span:hover {\n  color: var(--lay-color-secondary);\n}\n.dark .layui-laydate-footer span.layui-laydate-preview {\n  border-color: transparent!important;\n}\n.dark .layui-laydate-footer span.layui-laydate-preview:hover {\n  color: var(--lay-color-text-1) !important;\n}\n.dark .layui-laydate-shortcut + .layui-laydate-main {\n  border-left: 1px solid var(--lay-color-border-2);\n}\n.dark .layui-laydate .layui-laydate-list {\n  background-color: var(--lay-color-bg-5);\n}\n.dark .layui-laydate-hint {\n  color: var(--lay-color-danger);\n}\n.dark .layui-laydate-range .laydate-main-list-1 .layui-laydate-content,\n.dark .layui-laydate-range .laydate-main-list-1 .layui-laydate-header {\n  border-left: 1px solid var(--lay-color-border-2);\n}\n.dark .layui-laydate,\n.dark .layui-laydate-hint {\n  border-color: var(--lay-color-border-2);\n  box-shadow: var(--lay-shadow-3);\n  background-color: var(--lay-color-bg-5);\n  color: var(--lay-color-text-1);\n}\n.dark .layui-laydate {\n  box-shadow: var(--lay-shadow-2);\n}\n.dark .layui-laydate-hint {\n  border-color: var(--lay-color-border-1);\n}\n.dark .layui-laydate-header {\n  border-bottom: 1px solid var(--lay-color-border-2);\n}\n.dark .layui-laydate-header i:hover,\n.dark .layui-laydate-header span:hover {\n  color: var(--lay-color-secondary);\n}\n.dark .layui-laydate-content th {\n  color: var(--lay-color-text-1);\n}\n.dark .layui-laydate-content" +
            " td {\n  color: var(--lay-color-text-1);\n}\n.dark .layui-laydate-content td.laydate-day-now {\n  color: var(--lay-color-secondary);\n}\n.dark .layui-laydate-content td.laydate-day-now:after {\n  border: 1px solid var(--lay-color-secondary);\n}\n.dark .layui-laydate-linkage .layui-laydate-content td.laydate-selected > div {\n  background-color: var(--lay-color-green-8);\n}\n.dark .layui-laydate-linkage .laydate-selected:hover > div {\n  background-color: var(--lay-color-green-8) !important;\n}\n.dark .layui-laydate-content td > div:hover,\n.dark .layui-laydate-list li:hover,\n.dark .layui-laydate-shortcut > li:hover {\n  background-color: var(--lay-color-fill-2);\n  color: var(--lay-color-text-2);\n}\n.dark .layui-laydate-content td.laydate-disabled > div:hover {\n  background-color: var(--lay-color-bg-5);\n  color: var(--lay-color-text-4);\n}\n.dark .laydate-time-list li ol {\n  border: 1px solid var(--lay-color-border-2);\n}\n.dark .laydate-time-list > li:hover {\n  background: 0 0;\n}\n.dark .layui-laydate-content .laydate-day-next,\n.dark .layui-laydate-content .laydate-day-prev {\n  color: var(--lay-color-text-3);\n}\n.dark .layui-laydate-linkage .laydate-selected.laydate-day-next > div,\n.dark .layui-laydate-linkage .laydate-selected.laydate-day-prev > div {\n  background: none !important;\n}\n.dark .layui-laydate-footer {\n  border-top: 1px solid var(--lay-color-border-2);\n}\n.dark .layui-laydate-hint {\n  color: var(--lay-color-danger);\n}\n.dark .laydate-day-mark::after {\n  background-color: var(--lay-color-secondary);\n}\n.dark .layui-laydate-footer span[lay-type=date] {\n  color: var(--lay-color-secondary);\n}\n.dark .layui-laydate .layui-this,\n.dark .layui-laydate .layui-this > div {\n  background-color: var(--lay-color-secondary) !important;\n  color: var(--lay-color-white) !important;\n}\n.dark .layui-laydate .laydate-disabled,\n.dark .layui-laydate .laydate-disabled:hover {\n  color: var(--lay-color-text-4) !important;\n}\n.dark .layui-laydate .layui-this.laydate-disabled,\n.dark .layui-laydate .layui-this.laydate-disabled > div {\n  background-color: var(--lay-color-fill-1) !important;\n  color: var(--lay-color-text-4) !important;\n}\n.dark .laydate-theme-molv .layui-laydate-header {\n  background-color: var(--lay-color-primary);\n}\n.dark .laydate-theme-molv .layui-laydate-header i,\n.dark .laydate-theme-molv .layui-laydate-header span {\n  color: var(--lay-color-gray-2);\n}\n.dark .laydate-theme-molv .layui-laydate-header i:hover,\n.dark .laydate-theme-molv .layui-laydate-header span:hover {\n  color: var(--lay-color-white);\n}\n.dark .laydate-theme-molv .layui-laydate-content {\n  border: 1px solid var(--lay-color-border-2);\n}\n.dark .laydate-theme-molv .layui-this,\n.dark .laydate-theme-molv .layui-this > div {\n  background-color: var(--lay-color-primary) !important;\n}\n.dark .laydate-theme-molv .layui-laydate-footer {\n  border: 1px solid var(--lay-color-border-2);\n}\n.dark .laydate-theme-grid .laydate-month-list > li,\n.dark .laydate-theme-grid .laydate-year-list > li,\n.dark .laydate-theme-grid .layui-laydate-content td,\n.dark .laydate-theme-grid .layui-laydate-content thead {\n  border: 1px solid var(--lay-color-border-2);\n}\n.dark .layui-laydate-linkage.laydate-theme-grid .laydate-selected,\n.dark .layui-laydate-linkage.laydate-theme-grid .laydate-selected:hover {\n  background-color: var(--lay-color-gray-3) !important;\n  color: var(--lay-color-primary) !important;\n}\n.dark .layui-laydate-linkage.laydate-theme-grid .laydate-selected.laydate-day-next,\n.dark .layui-laydate-linkage.laydate-theme-grid .laydate-selected.laydate-day-prev {\n  color: var(--lay-color-gray-6) !important;\n}\n.dark .layui-laydate.laydate-theme-circle .layui-laydate-content table td.layui-this {\n  background-color: transparent !important;\n}\n.dark .layui-layer {\n  background-color: var(--lay-color-bg-3);\n  box-shadow: var(--lay-shadow-3);\n}\n.dark .layui-layer-border {\n  border: 1px solid var(--lay-color-border-2);\n  box-shadow: var(--lay-shadow-3);\n}\n.dark .layui-layer-move {\n  background-color: var(--lay-color-bg-5);\n}\n.dark .layui-layer-title {\n  border-bottom: 1px solid var(--lay-color-border-2);\n  color: var(--lay-color-text-1);\n}\n.dark .layui-layer-setwin span {\n  color: var(--lay-color-text-1);\n}\n.dark .layui-layer-setwin .layui-layer-min:before {\n  border-bottom-color: var(--lay-color-text-1);\n}\n.dark .layui-layer-setwin .layui-layer-min:hover:before {\n  border-bottom-color: var(--lay-color-info-hover);\n}\n.dark .layui-layer-setwin .layui-layer-max:after,\n.dark .layui-layer-setwin .layui-layer-max:before {\n  border: 1px solid var(--lay-color-text-3);\n}\n.dark .layui-layer-setwin .layui-layer-max:hover:after,\n.dark .layui-layer-setwin .layui-layer-max:hover:before {\n  border-color: var(--lay-color-info-hover);\n}\n.dark .layui-layer-setwin .layui-layer-maxmin:after,\n.dark .layui-layer-setwin .layui-layer-maxmin:before {\n  background-color: var(--lay-color-bg-5);\n}\n.dark .layui-layer-setwin .layui-layer-close2 {\n  color: var(--lay-color-text-1);\n  background-color: var(--lay-color-gray-10);\n}\n.dark .layui-layer-setwin .layui-layer-close2:hover {\n  background-color: var(--lay-color-normal);\n}\n.dark .layui-layer-btn a {\n  border: 1px solid var(--lay-color-border-2);\n  background-color: var(--lay-color-bg-3);\n  color: var(--lay-color-text-2);\n}\n.dark .layui-layer-btn .layui-layer-btn0 {\n  border-color: transparent;\n  background-color: var(--lay-color-normal);\n  color: var(--lay-color-text-1);\n}\n.dark .layui-layer-dialog .layui-layer-content .layui-layer-face {\n  color: var(--lay-color-gray-9);\n}\n.dark .layui-layer-dialog .layui-layer-content .layui-icon-tips {\n  color: var(--lay-color-warning);\n}\n.dark .layui-layer-dialog .layui-layer-content .layui-icon-success {\n  color: var(--lay-color-success);\n}\n.dark .layui-layer-dialog .layui-layer-content .layui-icon-error {\n  top: 19px;\n  color: var(--lay-color-danger);\n}\n.dark .layui-layer-dialog .layui-layer-content .layui-icon-question {\n  color: var(--lay-color-warning);\n}\n.dark .layui-layer-dialog .layui-layer-content .layui-icon-lock {\n  color: var(--lay-color-gray-10);\n}\n.dark .layui-layer-dialog .layui-layer-content .layui-icon-face-cry {\n  color: var(--lay-color-danger);\n}\n.dark .layui-layer-dialog .layui-layer-content .layui-icon-face-smile {\n  color: var(--lay-color-success);\n}\n.dark .layui-layer-rim {\n  border: 6px solid var(--lay-color-gray-8);\n  border: 6px solid var(--lay-color-border-2);\n}\n.dark .layui-layer-msg {\n  border: 1px solid var(--lay-color-border-1);\n}\n.dark .layui-layer-hui {\n  background-color: var(--" +
            "lay-color-bg-3);\n  color: var(--lay-color-text-1);\n}\n.dark .layui-layer-hui .layui-layer-close {\n  color: var(--lay-color-white);\n}\n.dark .layui-layer-loading-icon {\n  color: var(--lay-color-gray-9);\n}\n.dark .layui-layer-loading-2:after,\n.dark .layui-layer-loading-2:before {\n  border: 3px solid var(--lay-color-gray-6);\n}\n.dark .layui-layer-loading-2:after {\n  border-color: transparent;\n  border-left-color: var(--lay-color-normal);\n}\n.dark .layui-layer-tips .layui-layer-content {\n  box-shadow: var(--lay-shadow-3);\n  background-color: var(--lay-color-bg-5);\n  color: var(--lay-color-text-1);\n}\n.dark .layui-layer-tips i.layui-layer-TipsG {\n  border-color: transparent;\n}\n.dark .layui-layer-tips i.layui-layer-TipsB,\n.dark .layui-layer-tips i.layui-layer-TipsT {\n  border-right-color: var(--lay-color-black);\n}\n.dark .layui-layer-tips i.layui-layer-TipsL,\n.dark .layui-layer-tips i.layui-layer-TipsR {\n  border-bottom-color: var(--lay-color-black);\n}\n.dark .layui-layer-lan .layui-layer-title {\n  background: var(--lay-color-blue-5);\n  color: var(--lay-color-text-1);\n}\n.dark .layui-layer-lan .layui-layer-btn {\n  border-top: 1px solid var(--lay-color-border-3);\n}\n.dark .layui-layer-lan .layui-layer-btn a {\n  background: var(--lay-color-white);\n  border-color: var(--lay-color-border-3);\n  color: var(--lay-color-black-7);\n}\n.dark .layui-layer-lan .layui-layer-btn .layui-layer-btn1 {\n  background: var(--lay-color-gray-7);\n}\n.dark .layui-layer-molv .layui-layer-title {\n  background: var(--lay-color-layuigreen-6);\n  color: var(--lay-color-text-1);\n}\n.dark .layui-layer-molv .layui-layer-btn a {\n  background: var(--lay-color-layuigreen-6);\n  border-color: var(--lay-color-layuigreen-6);\n}\n.dark .layui-layer-molv .layui-layer-btn .layui-layer-btn1 {\n  background: var(--lay-color-gray-7);\n}\n.dark .layui-layer-win10 {\n  border-color: var(--lay-color-border-2);\n}\n.dark .layui-layer-win10 .layui-layer-btn {\n  background-color: var(--lay-color-bg-2);\n  border-color: var(--lay-color-border-2);\n}\n.dark .layui-layer-win10.layui-layer-dialog .layui-layer-content {\n  color: var(--lay-color-blue-7);\n}\n.dark .layui-layer-win10 .layui-layer-btn .layui-layer-btn0 {\n  border-color: var(--lay-color-blue-9);\n  background-color: var(--lay-color-bg-5);\n  color: var(--lay-color-text-1);\n}\n.dark .layui-layer-win10 .layui-layer-btn .layui-layer-btn1 {\n  border-color: var(--lay-color-border-2);\n  background-color: var(--lay-color-bg-5);\n  color: var(--lay-color-text-1);\n}\n.dark .layui-layer-win10 .layui-layer-btn a:hover {\n  background-color: var(--lay-color-blue-10);\n  border-color: var(--lay-color-blue-8);\n}\n.dark .layui-layer-prompt .layui-layer-input {\n  border: 1px solid var(--lay-color-border-2);\n  color: var(--lay-color-text-2);\n}\n.dark .layui-layer-tab {\n  box-shadow: var(--lay-shadow-3);\n}\n.dark .layui-layer-tab .layui-layer-title span.layui-this {\n  border-left: 1px solid var(--lay-color-border-2);\n  border-right: 1px solid var(--lay-color-border-2);\n  background-color: var(--lay-color-bg-3);\n}\n.dark .layui-layer-photos {\n  background: none;\n  box-shadow: none;\n}\n.dark .layui-layer-photos-prev,\n.dark .layui-layer-photos-next {\n  color: var(--lay-color-gray-9);\n}\n.dark .layui-layer-photos-prev:hover,\n.dark .layui-layer-photos-next:hover {\n  color: var(--lay-color-text-1);\n}\n.dark .layui-layer-photos-toolbar {\n  background-color: #333;\n  background-color: var(--lay-color-bg-5);\n  color: var(--lay-color-text-1);\n}\n.dark .layui-layer-photos-toolbar * {\n  color: var(--lay-color-text-1);\n}\n.dark .layui-layer-photos-toolbar a:hover {\n  color: var(--lay-color-text-2);\n}\n.dark .layui-layer-photos-header > span:hover {\n  background-color: var(--lay-color-fill-2);\n}\n.dark .layui-layer-tips i.layui-layer-TipsB,\n.dark .layui-layer-tips i.layui-layer-TipsT {\n  border-right-color: var(--lay-color-bg-5);\n}\n.dark .layui-layer-tips i.layui-layer-TipsL,\n.dark .layui-layer-tips i.layui-layer-TipsR {\n  border-bottom-color: var(--lay-color-bg-5);\n}\n.dark .layui-layer-prompt .layui-layer-input {\n  border: 1px solid var(--lay-color-border-2);\n  color: var(--lay-color-text-1);\n  background-color: var(--lay-color-black);\n}\n.dark .layui-layer-prompt .layui-layer-input:focus {\n  outline: 0;\n}\n.dark .layui-layer-loading {\n  background: 0 0;\n  box-shadow: 0 0;\n}\n.dark .layui-btn-primary {\n  border-color: transparent;\n}\n.dark .layui-btn-group .layui-btn:first-child {\n  border-left: none;\n}\n.dark .layui-btn-group .layui-btn-primary:hover {\n  border-top-color: transparent;\n  border-bottom-color: transparent;\n}\n.dark .layui-menu li:hover {\n  background-color: var(--lay-color-fill-2);\n}\n.dark .layui-nav-child dd.layui-this {\n  background-color: var(--lay-color-fill-2);\n}\n.dark .layui-nav .layui-nav-child a:hover {\n  background-color: var(--lay-color-fill-2);\n}\n.dark .layui-nav .layui-nav-item a:hover,\n.dark .layui-nav .layui-this a {\n  background-color: var(--lay-color-fill-2);\n}\n.dark .layui-nav-child dd.layui-this {\n  background-color: var(--lay-color-fill-2);\n}\n.dark .layui-tab-card > .layui-tab-title .layui-this:after {\n  border-bottom-color: var(--lay-color-bg-1);\n}\n.dark .layui-form-select dl dd:hover {\n  background-color: var(--lay-color-fill-2);\n}\n.dark .layui-form-select dl dd.layui-this {\n  background-color: var(--lay-color-fill-2);\n}\n.dark .layui-laypage button {\n  color: var(--lay-color-text-1);\n}\n.dark .layui-table[lay-even] tbody tr:nth-child(even) {\n  background-color: var(--lay-color-fill-4);\n}\n.dark .layui-menu .layui-menu-item-checked,\n.dark .layui-menu .layui-menu-item-checked2 {\n  background-color: var(--lay-color-fill-2) !important;\n}\n.dark .layui-input-split {\n  background-color: var(--lay-color-bg-2);\n}\n.dark .layui-input-wrap .layui-input-prefix.layui-input-split {\n  border-width: 1px;\n}\n.dark .layui-input-wrap .layui-input-split:has(+.layui-input:hover) {\n  border-color: var(--lay-color-border-2);\n}\n.dark .layui-input-wrap .layui-input-split:has(+.layui-input:focus) {\n  border-color: var(--lay-color-secondary-hover);\n}\n.dark .layui-layer-tab .layui-layer-title span:first-child {\n  border-left: none !important;\n}\n.dark .layui-slider-input.layui-input,\n.dark .layui-slider-input .layui-input {\n  background-color: var(--lay-color-bg-2);\n}\n\n/*# sourceMappingURL=layui-theme-dark-selector.css.map */\n",
        highlightLight: "pre code.hljs{display:block;overflow-x:auto;padding:1em}code.hljs{padding:3px 5px}.hljs{color:#383a42;background:#fafafa}.hljs-comment,.hljs-quote{color:#a0a1a7;font-style:italic}.hljs-doctag,.hljs-formula,.hljs-keyword{color:#a626a4}.hljs-deletion,.hljs-name,.hljs-section,.hljs-selector-tag,.hljs-subst{color:#e45649}.hljs-literal{color:#0184bb}.hljs-addition,.hljs-attribute,.hljs-meta .hljs-string,.hljs-regexp,.hljs-string{color:#50a14f}.hljs-attr,.hljs-number,.hljs-selector-attr,.hljs-selector-class,.hljs-selector-pseudo,.hljs-template-variable,.hljs-type,.hljs-variable{color:#986801}.hljs-bullet,.hljs-link,.hljs-meta,.hljs-selector-id,.hljs-symbol,.hljs-title{color:#4078f2}.hljs-built_in,.hljs-class .hljs-title,.hljs-title.class_{color:#c18401}.hljs-emphasis{font-style:italic}.hljs-strong{font-weight:700}.hljs-link{text-decoration:underline}",
        highlightDark: "pre code.hljs{display:block;overflow-x:auto;padding:1em}code.hljs{padding:3px 5px}.hljs{color:#abb2bf;background:#282c34}.hljs-comment,.hljs-quote{color:#5c6370;font-style:italic}.hljs-doctag,.hljs-formula,.hljs-keyword{color:#c678dd}.hljs-deletion,.hljs-name,.hljs-section,.hljs-selector-tag,.hljs-subst{color:#e06c75}.hljs-literal{color:#56b6c2}.hljs-addition,.hljs-attribute,.hljs-meta .hljs-string,.hljs-regexp,.hljs-string{color:#98c379}.hljs-attr,.hljs-number,.hljs-selector-attr,.hljs-selector-class,.hljs-selector-pseudo,.hljs-template-variable,.hljs-type,.hljs-variable{color:#d19a66}.hljs-bullet,.hljs-link,.hljs-meta,.hljs-selector-id,.hljs-symbol,.hljs-title{color:#61aeee}.hljs-built_in,.hljs-class .hljs-title,.hljs-title.class_{color:#e6c07b}.hljs-emphasis{font-style:italic}.hljs-strong{font-weight:700}.hljs-link{text-decoration:underline}",
    };

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
            // One-time upgrade: persisted old defaults otherwise override the new defaults.
            const visited = cfgCache.visited_color;
            if (visited && !visited.defaultsMigrated127) {
                const normalize = color => typeof color === 'string' ? color.trim().toLowerCase().replace(/\s+/g,'') : '';
                if (['#afb9c1','rgb(175,185,193)','rgba(175,185,193,1)'].includes(normalize(visited.light))) visited.light = '#c3c3c3';
                if (['#393f4e','rgb(57,63,78)','rgba(57,63,78,1)'].includes(normalize(visited.dark))) visited.dark = '#7b7b7b';
            }
            merge(cfgCache, def);
            if (cfgCache.visited_color) cfgCache.visited_color.defaultsMigrated127 = true;
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

    const nativeCommentPages = new WeakMap();
    const readNativeComments = doc => {
        try {
            const encoded = doc.querySelector('#temp-script')?.textContent.trim();
            const config = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded), char => char.charCodeAt(0))));
            return Array.isArray(config?.postData?.comments) ? config.postData.comments : [];
        } catch { return []; }
    };

    function mountNativeCommentMenu(ctx, row, page, position, record) {
        const comments = ctx.uw?.__config__?.postData?.comments;
        const template = document.querySelector('.comment-menu')?.__vue__;
        if (!record || !Array.isArray(comments) || typeof template?.$root?.constructor !== 'function' || !template.$options) return null;
        let state = nativeCommentPages.get(comments);
        if (!state) {
            state = { offset: document.querySelectorAll('.content-item').length - comments.length, indices: new Map() };
            nativeCommentPages.set(comments, state);
        }
        const key = `${page}:${position}`;
        const target = document.createElement('div');
        target.className = 'comment-menu-mount';
        let menu;
        try {
            menu = new template.$root.constructor(template.$options);
            if (typeof menu.setIndex !== 'function' || typeof menu.$mount !== 'function') {
                menu.$destroy?.();
                return null;
            }
            let index = state.indices.get(key);
            if (index === undefined) {
                // Keep indices stable when waterfall loading replaces a preview with the native row.
                index = comments.length + state.offset;
                comments.push(record);
                state.indices.set(key, index);
            }
            menu.setIndex(index);
            row.append(target);
            menu.$mount(target);
            return menu;
        } catch {
            menu?.$destroy?.();
            target.remove();
            menu?.$el?.remove();
            return null;
        }
    }

    function getListPostId(row, baseUrl) {
        const href = row.querySelector('.post-title a[href]')?.getAttribute('href');
        if (!href) return null;
        try {
            const url = new URL(href, baseUrl);
            if (url.origin !== location.origin) return null;
            return url.pathname.match(/^\/post-(\d+)-\d+\/?$/)?.[1] ?? null;
        } catch {
            return null;
        }
    }

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
                    if (ctx.isPost) document.dispatchEvent(new Event('nsx-comment-autoload-change'));
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

                    const src = doc.querySelector(profile.list), dst = document.querySelector(profile.list);
                    if (src && dst) {
                        let appended = Array.from(src.children);
                        if (ctx.isPost) {
                            const records = readNativeComments(doc);
                            const page = new URL(nextUrl, location.href).pathname.replace(/\/$/, '');
                            if (records.length === appended.length) {
                                appended.forEach((row, index) => mountNativeCommentMenu(ctx, row, page, index, records[index]));
                            }
                        }
                        if (profile === PROFILES.list) {
                            const seen = new Set(Array.from(dst.children, row => getListPostId(row, location.href)));
                            appended = appended.filter(row => {
                                const id = getListPostId(row, nextUrl);
                                if (id === null) return true;
                                if (seen.has(id)) return false;
                                seen.add(id);
                                return true;
                            });
                        }
                        dst.append(...appended);
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

                const openPanel = (host = document.body) => {
                    if (!kwPanel) {
                        kwPanel = document.createElement("div"); kwPanel.id = "nsx-filter-panel";
                        kwPanel.innerHTML = `
                                <div class="nsx-rel-header"><div class="nsx-rel-title">关键字过滤</div><div style="display:flex;gap:8px;"><button class="nsx-rel-action" data-a="add">➕ 新增</button><button class="nsx-rel-action" data-a="clear">清空当前组</button></div></div>
                                <div class="nsx-rel-search">🔍<input placeholder="搜索关键字与配置..."/></div>
                                <div class="nsx-rel-tabs"><button class="nsx-rel-tab is-active" data-t="block">🚫 屏蔽</button><button class="nsx-rel-tab" data-t="highlight">🎨 高亮</button></div>
                                <div class="nsx-rel-list"></div>
                            `;

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
                    if (kwPanel.parentElement !== host) host.append(kwPanel);
                    const r = kwTrigger.getBoundingClientRect();
                    kwPanel.style.top = `${r.bottom + 8}px`;
                    kwPanel.style.height = `${innerHeight - r.bottom - 16}px`;
                    kwPanel.style.right = ``;
                    renderList(); kwPanel.classList.add("show"); pState.open = true;
                };
                const closePanel = () => { kwPanel?.classList.remove("show"); pState.open = false; };
                window.__nsxPanelCtrl ||= {};
                window.__nsxPanelCtrl.filter = { close: closePanel, isOpen: () => pState.open };
                registerMobileTool('filter', '筛选', grp, openPanel, closePanel);
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
            const lightHl = bundledStyles.highlightLight;
            const darkHl = bundledStyles.highlightDark;

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

            const open = (host = document.body) => {
                if (!panel) {
                    panel = document.createElement("div");
                    panel.id = "nsx-history-panel";
                    panel.innerHTML = `<div class="nsx-history-header"><div class="nsx-history-title">历史记录</div><button class="nsx-history-action" data-a="clear">清空</button></div><div class="nsx-history-search">🔍<input placeholder="搜索"/></div><div class="nsx-history-tabs"><button class="nsx-history-tab is-active" data-t="all">全部</button><button class="nsx-history-tab" data-t="recent">最近关闭</button></div><div class="nsx-history-list"></div>`;
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
                if (panel.parentElement !== host) host.append(panel);
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
            registerMobileTool('history', '历史记录', grp, open, close);
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

    const CSS$1 = `#nsx-config-menu{height:100%;overflow-y:visible;border-right:1px solid #eee}#nsx-config-content{height:100%;overflow-y:auto;padding:0 15px;background:#f8f8f8}.nsx-config-card{margin-bottom:20px}.nsx-config-card .layui-card-header{display:flex;align-items:center;justify-content:space-between;font-weight:700}.nsx-config-card .header-checkbox{position:absolute;right:15px;top:50%;transform:translateY(-50%)}.nsx-config-card .layui-form-switch{margin-top:0!important}.nsx-config-card .layui-card-body:empty{padding-top:0;padding-bottom:0}.nsx-config-card .layui-form-label{width:110px!important;padding:9px 10px!important}.nsx-config-card .layui-input-block{margin-left:140px!important}.nsx-config-tools{display:flex;gap:10px;flex-wrap:wrap}.nsx-config-tools .layui-btn{min-width:120px}.nsx-config-tools-tip{margin-top:10px;font-size:12px;color:#888;line-height:1.6}.dark-layout #nsx-config-menu{border-right-color:#3a3a3a}.dark-layout #nsx-config-content{background:#1e1e1e}.dark-layout .nsx-config-tools-tip{color:#999}@media(max-width:640px){#nsx-config-menu{width:26%;min-width:68px;overflow-y:auto}#nsx-config-menu .layui-menu li{padding-inline:5px}#nsx-config-content{flex:1;min-width:0;padding:0 7px}.nsx-config-card .layui-card-header{height:auto;min-height:42px;line-height:1.35;padding:6px 64px 6px 7px;white-space:normal;overflow-wrap:anywhere}.nsx-config-card .header-checkbox{right:6px}.nsx-config-card .layui-form-label{float:none;width:auto!important;text-align:left;padding:6px 0!important}.nsx-config-card .layui-input-block{margin-left:0!important}}`;

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

    const DEFAULT_LIGHT = "#c3c3c3";
    const DEFAULT_DARK = "#7b7b7b";
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

    const releasePage = 'https://greasyfork.org/zh-TW/scripts/605053-nodeseek-pro-max';
    const releaseVersionKey = 'nsx_release_notes_version';
    const releasePopupKey = 'nsx_release_notes_popup';
    const releaseHistoryKey = 'nsx_release_notes_history';
    const releaseCooldown = 24 * 60 * 60 * 1000;
    const releaseVersionPattern = /^\d+(?:\.\d+)*$/;

    function releaseCooldownActive() {
        let popup;
        try { popup = JSON.parse(localStorage.getItem(releasePopupKey)); }
        catch { return false; }
        if (popup?.shown !== 1 || !Number.isFinite(popup.at)) return false;
        const elapsed = Date.now() - popup.at;
        return elapsed >= 0 && elapsed < releaseCooldown;
    }

    function compareReleaseVersions(left, right) {
        const a = left.split('.').map(Number);
        const b = right.split('.').map(Number);
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
            const difference = (a[i] ?? 0) - (b[i] ?? 0);
            if (difference) return difference;
        }
        return 0;
    }

    async function loadReleaseHistory() {
        const html = await new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: releasePage + '/versions',
                anonymous: true,
                timeout: 10000,
                overrideMimeType: 'text/html; charset=utf-8',
                onload: response => {
                    if (response.status === 200) resolve(response.responseText);
                    else reject(new Error('Greasy Fork HTTP ' + response.status));
                },
                onerror: reject,
                ontimeout: reject,
                onabort: reject
            });
        });
        const page = new DOMParser().parseFromString(html, 'text/html');
        return [...page.querySelectorAll('ul.history_versions > li')].flatMap(row => {
            const version = row.querySelector('.version-number a')?.textContent.trim().replace(/^v/i, '');
            if (!releaseVersionPattern.test(version || '')) return [];
            const date = row.querySelector('.version-date')?.getAttribute('datetime')?.slice(0, 10) || '';
            const changelog = row.querySelector('.version-changelog');
            changelog?.querySelectorAll('script, style').forEach(node => node.remove());
            changelog?.querySelectorAll('br, p, li, pre, h1, h2, h3, h4, h5, h6').forEach(node => node.after('\n'));
            const changes = (changelog?.textContent || '').split(/\r?\n/)
                .map(line => line.trim())
                .filter(line => line && line !== date && line !== 'NodeSeek Pro Max v' + version);
            return [{ version, date, changes }];
        });
    }

    let releaseCheckPending = false;
    async function showReleaseNotes() {
        const installedVersion = info.version;
        if (window.self !== window.top || !document.body || !releaseVersionPattern.test(installedVersion) ||
            releaseCheckPending || document.getElementById('nsx-release-notes')) return;
        releaseCheckPending = true;
        try {
            if (releaseCooldownActive()) return;
            if (localStorage.getItem(releaseVersionKey) === null) localStorage.setItem(releaseVersionKey, '');
            if (localStorage.getItem(releaseHistoryKey) === null) localStorage.setItem(releaseHistoryKey, '[]');
            localStorage.setItem(releasePopupKey, '{"shown":0}');

            const rows = await loadReleaseHistory();
            if (!rows.length || releaseCooldownActive()) return;
            try { localStorage.setItem(releaseHistoryKey, JSON.stringify(rows)); }
            catch (error) { console.debug('[NSX] 无法缓存版本记录', error); }

            const latest = rows[0];
            const comparison = compareReleaseVersions(latest.version, installedVersion);
            if (comparison < 0) return;
            const updateAvailable = comparison > 0;
            const savedVersion = localStorage.getItem(releaseVersionKey);
            if (!updateAvailable && savedVersion && compareReleaseVersions(latest.version, savedVersion) === 0) return;
            if (renderReleaseNotes(latest, rows, installedVersion, updateAvailable)) {
                if (!updateAvailable) localStorage.setItem(releaseVersionKey, latest.version);
                localStorage.setItem(releasePopupKey, JSON.stringify({ shown: 1, at: Date.now() }));
            }
        } catch (error) {
            console.debug('[NSX] 更新记录检查未完成', error);
        } finally {
            releaseCheckPending = false;
        }
    }

    function renderReleaseNotes(release, rows, installedVersion, updateAvailable) {
        const dialog = document.createElement('dialog');
        if (typeof dialog.showModal !== 'function') return;
        dialog.id = 'nsx-release-notes';
        dialog.setAttribute('aria-labelledby', 'nsx-update-title');
        dialog.innerHTML = `
<header><p>NodeSeek Pro Max — 用蚊香买榄菊</p><h1 id="nsx-update-title"></h1><button id="nsx-update-cross" aria-label="关闭弹窗">×</button></header>
<nav id="nsx-update-release-nav" aria-label="更新说明">
<button id="nsx-update-current" type="button" aria-pressed="true" autofocus>当前版本</button>
<button id="nsx-update-history" type="button" aria-pressed="false">查看完整更新记录</button>
</nav>
<div id="nsx-update-content">
<section id="nsx-update-summary"><p class="source" hidden></p><ul class="group"></ul></section>
<section id="nsx-update-archive" hidden><p class="source"><span id="nsx-update-count"></span></p></section>
</div>
<footer><button id="nsx-update-done">知道了</button><button class="primary" id="nsx-update-install" hidden>前往更新</button></footer>
        `;
        const select = name => dialog.querySelector(`#nsx-update-${name}`);
        const title = select('title');
        const summary = select('summary');
        const archive = select('archive');
        const current = select('current');
        current.closest('nav').hidden = updateAvailable;
        const history = select('history');
        const currentTitle = updateAvailable ? `发现新版本 v${release.version}` : `v${release.version} 更新说明`;
        title.textContent = currentTitle;
        const status = summary.querySelector('.source');
        status.hidden = !updateAvailable;
        status.textContent = `已安装 v${installedVersion}，是否前往 Greasy Fork 更新？`;
        const changes = release.changes.length ? release.changes : ['该版本未填写更新说明。'];
        for (const change of changes) {
            const item = document.createElement('li');
            item.textContent = change;
            summary.querySelector('ul').append(item);
        }
        const done = select('done');
        const install = select('install');
        done.textContent = updateAvailable ? '稍后再说' : '知道了';
        done.classList.toggle('primary', !updateAvailable);
        install.hidden = !updateAvailable;
        if (updateAvailable) done.setAttribute('autofocus', '');
        install.onclick = () => {
            GM_openInTab(releasePage, { active: true, insert: true, setParent: true });
            dialog.close();
        };

        select('count').textContent = `${rows.length} 条版本记录`;
        for (const { version, date, changes } of rows) {
            const entry = document.createElement('article');
            entry.className = 'group';
            const heading = document.createElement('h2');
            heading.textContent = `v${version}`;
            const time = document.createElement('time');
            time.dateTime = date;
            time.textContent = date;
            heading.append(time);
            const body = document.createElement('p');
            body.className = 'notes';
            body.textContent = changes.join('\n') || '该版本未填写更新说明。';
            entry.append(heading, body);
            archive.append(entry);
        }
        const setArchive = open => {
            if (summary.hidden === open) return;
            summary.hidden = open;
            archive.hidden = !open;
            title.textContent = open ? '版本更新记录' : currentTitle;
            current.setAttribute('aria-pressed', String(!open));
            history.setAttribute('aria-pressed', String(open));
        };
        current.onclick = () => setArchive(false);
        history.onclick = () => setArchive(true);
        select('cross').onclick = select('done').onclick = () => dialog.close();
        dialog.addEventListener('close', () => dialog.remove(), { once: true });
        addStyle('nsx-release-style', `
#nsx-release-notes{--card:#f5f6fa;--group:#fff;--ink:#182033;--muted:#5d6472;--accent:#005ecb;--line:#dfe3eb;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
:is(.dark,.dark-layout) #nsx-release-notes{--card:#242833;--group:#303642;--ink:#f1f4fb;--muted:#b6becc;--accent:#83baff;--line:#454d5b}
#nsx-release-notes *{box-sizing:border-box}
#nsx-release-notes button{font:inherit;cursor:pointer;min-height:44px;border:0;border-radius:12px;padding:8px 14px;color:var(--accent);background:var(--group)}
#nsx-release-notes [hidden]{display:none!important}
#nsx-release-notes{color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:23px;padding:0;width:min(480px,calc(100% - 24px));max-height:min(680px,calc(100dvh - 24px));box-shadow:0 24px 80px #0004;overflow:hidden}
#nsx-release-notes[open]{display:flex;flex-direction:column}
#nsx-release-notes::backdrop{background:#14223965}
#nsx-release-notes header{position:relative;flex:none;padding:21px 64px 14px 20px}
#nsx-release-notes header p{margin:0 0 4px;color:var(--muted);font-size:13px}
#nsx-release-notes h1{font-size:23px;margin:0;line-height:1.3}
#nsx-release-notes #nsx-update-cross{appearance:none;box-shadow:none;border:0;position:absolute;inline-size:44px;padding:0;right:9px;top:10px;background:transparent;border-radius:0;color:var(--muted);font-size:32px;font-weight:400;line-height:1}
#nsx-update-content{min-height:0;flex:1;display:grid}
#nsx-update-content>section{min-height:0;overflow:auto;overscroll-behavior:contain;padding:0 16px}
#nsx-release-notes .group{background:var(--group);border-radius:15px;margin:0;padding:12px 14px}
#nsx-update-summary .group{padding-inline-start:32px}
#nsx-release-notes #nsx-update-summary li{list-style:disc outside;margin:.35em 0;overflow-wrap:anywhere}
#nsx-update-archive article{content-visibility:auto;contain-intrinsic-block-size:auto 120px}
#nsx-update-archive article.group + article.group{margin-block-start:10px}
#nsx-release-notes article h2{font-size:15px;margin:0 0 4px}
#nsx-release-notes article time{font-size:12px;color:var(--muted);margin-inline-start:8px}
#nsx-release-notes article .notes{padding:0;margin:5px 0 0;white-space:pre-wrap;font-size:14px;overflow-wrap:anywhere}
#nsx-release-notes .source{color:var(--muted);font-size:12px;margin:0 2px 10px}
#nsx-release-notes footer{flex:none;display:flex;gap:8px;padding:14px 16px;flex-wrap:wrap}
#nsx-release-notes footer{justify-content:flex-end}
#nsx-release-notes footer button{flex:none;min-inline-size:88px}
#nsx-release-notes .primary{background:#0068df;color:#fff}
@media(max-width:380px){#nsx-release-notes header{padding-inline-start:16px}#nsx-release-notes h1{font-size:21px}#nsx-release-notes footer button{padding-inline:8px}}
#nsx-update-cross:focus{outline:none}
#nsx-update-cross:focus-visible{color:var(--accent);text-decoration:underline}
#nsx-update-release-nav{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:3px;margin:0 16px 10px;padding:3px;border-radius:13px;background:var(--line);flex:none}
#nsx-update-release-nav button{min-width:0;padding:5px 4px;border-radius:10px;background:transparent;color:var(--ink);font-size:13px;line-height:1.3}
#nsx-release-notes #nsx-update-release-nav button:focus{outline:none}
#nsx-release-notes #nsx-update-release-nav button:focus-visible[aria-pressed="false"]{text-decoration:underline}
#nsx-update-release-nav button[aria-pressed="true"]{background:var(--group);box-shadow:0 1px 4px #0002;font-weight:650}
#nsx-release-notes :is(header,nav,footer){width:auto;height:auto;background:transparent;box-shadow:none}
#nsx-release-notes #nsx-update-release-nav{background:var(--line)}
        `);
        document.body.append(dialog);
        try { dialog.showModal(); } catch { dialog.remove(); return; }
        return true;
    }

    // ===== 启动 =====
    function start() {
        const isMobileClient = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.matchMedia?.("(hover: none) and (pointer: coarse)")?.matches;
        if (isMobileClient) document.documentElement.classList.add("nsx-mobile");

        // 注入资源
        document.body?.insertAdjacentHTML("beforeend", SVG_SPRITE);
        addStyle("nsx-base", BASE_CSS);
        if (env.site?.code === 'ns' && !isMobileClient) {
            addStyle('nsx-desktop-sidebar-ads', `
                @media (min-width: 761px) {
                    #nsk-right-panel-container a:is(.promotation-item, .promotion-item):not([href*="seek.li" i], [href*="nodequality" i], [href*="nodescriptkit" i], [href*="nodehatch" i], [href*="nfd" i]):not(:has(img:is([alt*="seek.li" i], [title*="seek.li" i], [alt*="nodequality" i], [title*="nodequality" i], [alt*="nodescriptkit" i], [title*="nodescriptkit" i], [alt*="nodehatch" i], [title*="nodehatch" i], [alt*="nfd" i], [title*="nfd" i]))) {
                        display: none !important;
                    }
                }
            `);
        }
        // layui CSS
        addStyle("nsx-layui-css", bundledStyles.layui);
        addStyle("nsx-layui-dark", bundledStyles.layuiDark);

        // highlight.js 脚本
        addScript("nsx-hljs-script", "https://s4.zstatic.net/ajax/libs/highlight.js/11.9.0/highlight.min.js");
        // highlight.js 样式
        addStyle("hightlight-style", bundledStyles.highlightLight);
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
                    .nsx-preview-toggle{position:absolute;top:6px;right:16px;z-index:2;box-sizing:border-box;min-width:68px;height:23px;padding:0 9px;color:#fff;background:#111;border:1px solid #111;border-radius:4px;font:inherit;font-size:11px;font-weight:500;line-height:21px;cursor:pointer;white-space:nowrap;transition:background .15s ease,border-color .15s ease}
                    .nsx-preview-toggle:hover{color:#111;background:#fff;border-color:#111}
                    .nsx-preview-toggle:focus-visible{outline:2px solid #86868b;outline-offset:2px}
                    .nsx-preview-toggle[aria-expanded="true"]{color:#fff;background:#111}
                    .nsx-preview-toggle[aria-expanded="true"]:hover{color:#111;background:#fff}
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
                            for (const [index,comment] of comments.entries()) {
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
                            state.url=url.href;state.loaded=true;status.textContent=`第 ${currentPage} 页 · 本页 ${comments.length} 条评论`;
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
        const postActionIconPaths = {
            addFriend: '<circle cx="9" cy="7" r="3.5"/><path d="M3 20v-1.5a5 5 0 0 1 5-5h2a5 5 0 0 1 3 .9M15 17h6m-3-3v6"/>',
            removeFriend: '<circle cx="9" cy="7" r="3.5"/><path d="M3 20v-1.5a5 5 0 0 1 5-5h2a5 5 0 0 1 3 .9M15 17h6"/>',
            block: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
            unblock: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
            message: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
            quickReply: '<path d="M7 4h10a4 4 0 0 1 4 4v5a4 4 0 0 1-4 4H9l-5 3v-4a4 4 0 0 1-1-3V8a4 4 0 0 1 4-4Z"/><path d="m13 7-4 4h3l-1 3 4-4h-3z"/>'
        };
        function postActionIcon(name) {
            return `<svg class="nsx-post-action-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${postActionIconPaths[name]}</svg>`;
        }

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
                    label: "用户资料与安全评分",
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
// NodeSeek 用户安全参考分双维度模型 V3.2 — pure calculation, no DOM/network.
const SAFETY_RULES = {
 version:'V3.2', base:50, cap:100, adjustment:.6,
 // Baselines from 699 collected profiles, excluding daily comments < 1.
 // Each Lv 0 profile registered for 0 days is retained in the reference sample.
 reference:[
  {median:{posts:.4000,comments:6.0000,legs:17.0000},mean:{posts:.8395301469,comments:9.3863696828,legs:20.1424369873}},
  {median:{posts:.4118,comments:3.9000,legs:10.2581},mean:{posts:1.2660426774,comments:10.3074822990,legs:18.9486053904}},
  {median:{posts:.5333,comments:6.3333,legs:12.1579},mean:{posts:.6196418343,comments:7.7457283631,legs:12.8965269082}},
  {median:{posts:.4600,comments:6.4122,legs:11.4302},mean:{posts:.7591138156,comments:9.2515265812,legs:13.9470399279}},
  {median:{posts:.2650,comments:3.5138,legs:7.8281},mean:{posts:.4005091274,comments:6.3513767634,legs:10.5683953628}},
  {median:{posts:.2643,comments:4.4558,legs:8.3242},mean:{posts:.5270192798,comments:7.2470536676,legs:10.9725708188}},
  {median:{posts:.3592,comments:4.8608,legs:9.2034},mean:{posts:.5971724612,comments:7.9001243546,legs:11.9667721604}}
 ],
 age:[[10,0],[45,3],[135,5],[270,7],[405,9],[495,11],[547,13],[Infinity,15]],
 level:[0,1,2,4,6,8,10], stars:[[0,0],[4,1],[14,2],[29,3],[99,4],[Infinity,5]],
 history:[['posts',1],['posts',5],['posts',20],['posts',100],['comments',5],['comments',20],['comments',50],['comments',100],['comments',300],['comments',1000],['comments',3000],['comments',6000]],
 tenure:[[30,20,2],[90,100,4],[180,300,6],[365,1000,8]],
 lowerFactor:.5, upperFactor:1.5, stepRatio:.1,
 k:[[7,.5],[30,.7],[90,.85],[Infinity,1]],
 combo:[[2,10,5],[3,20,10],[4,30,20]],newCombo:{days:7,posts:2,comments:10,points:10},legsCheck:50,
 grades:[
  {min:90, label:'近零', summary:'参考分极优，风险接近零', colors:['#116747','#043d2b']},
  {min:75, label:'极低', summary:'参考分优秀，风险极低', colors:['#278966','#176848']},
  {min:60, label:'低', summary:'参考分较好，风险较低', colors:['#0EBAA6','#11675E']},
  {min:45, label:'轻度', summary:'参考分一般，轻度风险', colors:['#cf59a4','#8654c7']},
  {min:30, label:'中度', summary:'参考分偏低，不推荐', colors:['#df754e','#b53b42']},
  {min:15, label:'高', summary:'参考分极低，不建议', colors:['#a33549','#79223a']},
  {min:0, label:'极高', summary:'参考分处于最低档，不予推荐', colors:['#762032','#350d20']},
 ],
 rGrades:[[0,'未触发异常规则'],[20,'轻微异常'],[50,'中等异常'],[100,'明显异常']]
};
function scoreBand(score) {
 return Number.isFinite(score) ? SAFETY_RULES.grades.find(band => score >= band.min) : undefined;
}
function safetyBehaviorPoints(daily, key, level) {
 const cfg=SAFETY_RULES,reference=cfg.reference[level];
 const lower=reference.median[key]*cfg.lowerFactor;
 const upper=reference.mean[key]*cfg.upperFactor;
 if(daily>=lower&&daily<=upper)return 0;
 const deviation=daily<lower?(lower-daily)/lower:(daily-upper)/upper;
 return Math.ceil(deviation/cfg.stepRatio-1e-10);
}
function safetyNumber(raw, integer=true, max=Number.MAX_SAFE_INTEGER, min=0) {
 if(raw===undefined||raw===null||(typeof raw==='string'&&!raw.trim()))return {status:'unknown',value:null};
 if(!['number','string'].includes(typeof raw)||(typeof raw==='string'&&!/^-?\d+(?:\.\d+)?$/.test(raw.trim())))return {status:'invalid',value:null};
 const n=Number(raw);
 return Number.isFinite(n)&&n>=min&&n<=max&&(!integer||Number.isSafeInteger(n))?{status:'known',value:n}:{status:'invalid',value:null};
}
function safetyJoinedDays(raw,now){
 if(raw===undefined||raw===null||raw==='')return {status:'unknown',value:null};
 const t=typeof raw==='number'?(Math.abs(raw)<1e11?raw*1000:raw):typeof raw==='string'?Date.parse(raw):NaN;
 if(!Number.isFinite(t)||t>now)return {status:'invalid',value:null};
 return {status:'known',value:Math.floor((now-t)/86400000)};
}
function calculateSafety(input,now=Date.now()){
 const cfg=SAFETY_RULES, pick=(n,rows)=>rows.find(([max])=>n<=max)[1];
 const fields={};
 for(const k of ['days','level','legs','stars','posts','comments'])fields[k]=safetyNumber(input[k],k!=='days',k==='level'?6:Number.MAX_SAFE_INTEGER,k==='legs'?Number.MIN_SAFE_INTEGER:0);
 const joined=safetyJoinedDays(input.joinedDate,now),warnings=[];
 if(joined.status==='known')fields.days=joined;
 else if(joined.status==='invalid')warnings.push('注册日期解析失败或晚于当前时间；仅在注册天数有效时使用天数');
 const names={days:'注册天数',level:'等级',legs:'累计鸡腿',stars:'星辰',posts:'主题帖',comments:'评论',fans:'粉丝'};
 const missing=Object.keys(fields).filter(k=>fields[k].status!=='known');
 for(const k of missing)warnings.push(names[k]+(fields[k].status==='invalid'?'数据异常/解析失败':'未知'));
 const v=Object.fromEntries(Object.entries(fields).map(([k,f])=>[k,f.value]));
 const blocking=missing;
 const base={version:cfg.version,fields,warnings,missing:blocking,provisional:false,C:null,R:null,S:null,rawS:null,daily:null,reasons:[],parts:null,grade:'数据不足',rGrade:'数据不足'};
 if(blocking.length)return base;
 let A=pick(v.days,cfg.age),L=cfg.level[v.level],ST=pick(v.stars,cfg.stars);
 let H=cfg.history.filter(([k,min])=>v[k]>=min).length;
 let T=Math.max(0,...cfg.tenure.filter(([d,c])=>v.days>=d&&v.comments>=c).map(x=>x[2]));
 const C=Math.min(cfg.cap,cfg.base+A+L+ST+H+T),div=Math.max(v.days,1);
 const daily={posts:v.posts/div,comments:v.comments/div,legs:v.legs/div};
 const Rp=safetyBehaviorPoints(daily.posts,'posts',v.level),Rc=safetyBehaviorPoints(daily.comments,'comments',v.level),Rj=safetyBehaviorPoints(daily.legs,'legs',v.level),K=pick(v.days,cfg.k);
 const comboBase=Math.max(0,...cfg.combo.filter(([p,c])=>daily.posts>p&&daily.comments>c).map(x=>x[2]));
 const nc=cfg.newCombo,newExtra=v.days<=nc.days&&daily.posts>nc.posts&&daily.comments>nc.comments?nc.points:0;
 const Rcombo=comboBase+newExtra,R=Math.min(cfg.cap,(Rp+Rc+Rj)*(2-K)+Rcombo);
 const rawS=Math.max(0,Math.min(cfg.cap,C-cfg.adjustment*R)),S=Math.round(rawS),reasons=[];
 for(const [k,points,label] of [['posts',Rp,'发帖'],['comments',Rc,'评论'],['legs',Rj,'鸡腿获取']]){
  if(!points)continue;
  const low=daily[k]<cfg.reference[v.level].median[k]*cfg.lowerFactor;
  reasons.push({type:low?'低活跃异常':k==='legs'?'鸡腿获取异常':`高频${label}异常`,text:`${low?'低活跃：':k==='legs'?'鸡腿获取异常：':'高频：'}日均${label} ${daily[k].toFixed(2)}`,points,adjusted:points*(2-K)});
 }
 if(Rcombo)reasons.push({type:'高频组合异常',text:`高频组合异常 +${comboBase}${newExtra?`；新账号额外 +${newExtra}`:''}`,points:Rcombo,adjusted:Rcombo});
 if(daily.legs>cfg.legsCheck)warnings.push('日均鸡腿超过50：请核查奖励来源、注册时间和统计口径，不据此认定违规');
 if(reasons.some(x=>x.type==='低活跃异常'))warnings.push('低活跃可能源于潜水或参与记录不足，不代表恶意');
 if(Rcombo)warnings.push('高频组合需进一步了解内容，关注广告或灌水等可能性，不据此定性');
 return {...base,C,R,S,rawS,daily,reasons,warnings,parts:{A,L,ST,H,T,Rp,Rc,Rj,K,Rcombo,comboBase,newExtra},grade:scoreBand(S).label,rGrade:pick(R,cfg.rGrades)};
}

                // Public profile cache: isolated by site/account, bounded, and valid for 1 hour.
                const PROFILE_TTL = 60 * 60 * 1000;
                const PROFILE_LIMIT = 500;
                const REQUEST_TIMEOUT = 10000;
                const REQUEST_GAP = 300;
                const MAX_ATTEMPTS = 3;
                const profileKey = `nsx:profile-cache:v5:${location.host}:${ctx.uid || ctx.user?.member_id || 'user'}`;
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
                    clearTimeout(tip.countdownTimer);
                    tip.resizeObserver?.disconnect();
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
                    card.style.setProperty('max-height', `${Math.max(1, bottom-top)}px`, 'important');
                    card.style.setProperty('overflow-y','auto','important');
                    const content = popup.querySelector('.layui-layer-content');
                    if(content){content.style.setProperty('height','auto','important');content.style.setProperty('max-height',`${Math.max(1,bottom-top)}px`,'important');}
                    popup.style.setProperty('height','auto','important');
                    popup.style.setProperty('max-height',`${Math.max(1,bottom-top)}px`,'important');
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
                    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
                    const profile = { created_at:value.created_at ?? null, days:value.days ?? null, bio:typeof value.bio==='string'?value.bio:null };
                    // Preserve unknown/invalid fields for explicit model diagnostics, never coerce to zero.
                    for(const key of ['coin','nPost','nComment','stardust','fans','rank'])profile[key]=value[key] ?? null;
                    // User-confirmed model data mapping: API coin supplies cumulative legs.
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

                    const contextAuthor = el.classList.contains('nsx-tree-context-author');
                    const metaInfo = listItem || el.closest('.nsk-content-meta-info, .nsx-tree-context-header');
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
                            const safety = calculateSafety({joinedDate:userData.created_at,days:userData.days,level:userData.rank,
                                posts:userData.nPost,comments:userData.nComment,stars:userData.stardust,fans:userData.fans,legs:userData.coin});
                            const dayCount = safety.fields.days.value;
                            const joinDays = dayCount ?? '未知';
                            const dateValid = safetyJoinedDays(userData.created_at,Date.now()).status==='known';
                            const joinedTimestamp = dateValid ? (typeof userData.created_at==='number' ? (Math.abs(userData.created_at)<1e11?userData.created_at*1000:userData.created_at) : Date.parse(userData.created_at)) : null;
                            const joinedISO = dateValid ? new Date(joinedTimestamp).toISOString() : '';
                            const joinedTime = dateValid ? new Date(joinedTimestamp+8*3600000).toISOString().slice(0,10).replace(/-/g,'/') : '日期未知';
                            const rank = safety.fields.level.value;
                            const rankText = rank ?? '未知';
                            const referenceText = safety.S===null ? '数据不足' : String(safety.S);
                            // Presentation palette only; scoring categories are defined in SAFETY_RULES.
                            const referenceGradient = score => {
                                if (!Number.isFinite(score)) return 'linear-gradient(135deg,#78909c,#607d8b)';
                                const pair = scoreBand(score).colors;
                                return `linear-gradient(135deg, ${pair[0]}, ${pair[1]})`;
                            };
                            const referenceColor = referenceGradient(safety.S ?? undefined);
                            const accountRiskColor = referenceGradient(safety.C ?? undefined);
                            const anomalyColor = referenceGradient(safety.R===null ? undefined : 100-safety.R);
                            const selectedStyle = ctx.store.get(isListAuthor ? 'badge_appearance.list_style' : 'badge_appearance.post_style','liquid');
                            const badgeStyle = contextAuthor ? 'text' : (['text','ios','liquid','tech'].includes(selectedStyle) ? selectedStyle : 'liquid');
                            const displayField = f => {return f.status==='known'?escapeInfo(f.value):f.status==='invalid'?'数据异常':'未知';};
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
                            lvSpan.style.cssText = `font-size:11px;padding:2px 7px;border-radius:4px;border:0!important;outline:0!important;vertical-align:middle;--nsx-score-gradient:${referenceColor};`;
                            const scoreLabel = `${referenceText}${safety.S!==null ? '分' : ''}${safety.provisional&&safety.S!==null?'（暂定）':''}`;
                            if (contextAuthor) {
                                const days = document.createElement('span');
                                days.className = 'nsx-tree-badge-days';
                                days.textContent = ` · ${joinDays}天`;
                                lvSpan.append(`Lv ${rankText}`, days, ` · ${scoreLabel}`);
                            } else {
                                lvSpan.textContent = `Lv ${rankText} · ${joinDays}天 · ${scoreLabel}`;
                            }
                            lvSpan.style.cursor = 'help';
                            lvSpan.setAttribute('aria-label', `${username}：双维度参考分 ${referenceText}${safety.S!==null ? '/100' : ''}。评分基于公开资料，不代表交易信用。`);
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


                                const cardStyle = 'liquid';
                                const bioText = userData.bio === null ? '资料未提供' : (userData.bio.trim() || '未填写');
                                const fmt = value => value===null || value===undefined ? '—' : Number(value).toFixed(1);
                                const rate = key => safety.daily ? safety.daily[key].toFixed(2) : '未知';
                                const visibleWarnings = safety.warnings.filter(w=>w !== '低活跃可能源于潜水或参与记录不足，不代表恶意' && !w.startsWith('日均鸡腿超过50：') && !w.startsWith('高频组合需进一步了解内容'));
                                const band = scoreBand(safety.S);
                                const displayGrade = band ? `风险度 ${band.label}` : '数据不足';
                                const scoreSummary = band?.summary ?? '资料不足，暂无法形成完整评分';
                                const bands = [...SAFETY_RULES.grades].reverse();
                                const ticks = [...bands.map(item => item.min), 100];
                                const widths = bands.map((item, i) => ticks[i + 1] - item.min);
                                const stops = bands.map((item, i) => `${item.colors[0]} ${item.min}%, ${item.colors[1]} ${ticks[i + 1]}%`);
                                const dataLabel = safety.S===null ? '数据不足' : safety.provisional ? '暂定评分' : '资料完整';
                                const scoreScale = `<div class="nsx-score-scale" role="img" aria-label="双维度参考分刻度：${ticks.join('、')}；当前${safety.S===null?'数据不足':safety.S+'分'}">
                                    <div class="nsx-score-track" style="background:linear-gradient(90deg,${stops.join(',')})">${safety.S===null?'':`<i class="nsx-score-marker" style="left:clamp(5px,${Math.max(0,Math.min(100,safety.S))}%,calc(100% - 5px))"></i>`}</div>
                                    <div class="nsx-score-ticks">${ticks.map(tick => `<span style="left:${tick}%">${tick}</span>`).join('')}</div>
                                    <div class="nsx-score-bands" style="grid-template-columns:${widths.map(width => width + 'fr').join(' ')}">${bands.map(item => `<span>${item.label}</span>`).join('')}</div>
                                </div>`;
                                const p = safety.parts;
                                const accountScoreRows = p ? [['基础分',SAFETY_RULES.base],['注册时间 A',p.A],['等级 L',p.L],['星辰 ST',p.ST],['历史参与 H',p.H],['长期参与 T',p.T]].map(([label,n])=>`<div class="nsx-safety-row"><span>${label}</span><b>+${Number.isInteger(n)?n:n.toFixed(2)}</b></div>`).join('') : '<p>必需字段不全，暂不计算。</p>';
                                const extraDetails = `
                                    <section class="nsx-card-section nsx-safety-section">
                                        <div class="nsx-safety-row nsx-score-heading"><b>◉ 双维度参考分 S</b><span class="nsx-score-status" style="background:${referenceColor};color:#fff" title="${dataLabel}">${displayGrade}</span></div>
                                        <div class="nsx-score-hero">
                                            <strong class="nsx-score-number nsx-safety-gradient" style="--nsx-score-fill:${referenceColor}">${safety.S===null?'—':safety.S}</strong>
                                            <div class="nsx-score-verdict">${band ? `<b class="nsx-score-grade" style="background:${referenceColor}">${band.label}</b>` : ''}<p>${scoreSummary}</p></div>
                                        </div>
                                        ${scoreScale}
                                        <ul class="nsx-score-guide">
                                            <li><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4 6v6c0 4 8 9 8 9s8-5 8-9V6Z"/><path d="m8 12 3 3 5-6"/></svg><span><b>双维度参考分 S</b>：分数越高，综合风险度越低</span></li>
                                            <li><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 10-4m2 4 2 2 4-5"/></svg><span><b>账号风险度（100 − C）</b>：由账号基础分 C 换算，数值越低，账号基础风险越低</span></li>
                                            <li><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 10 18H2Z"/><path d="M12 9v5m0 3v1"/></svg><span><b>行为异常度 R</b>：分数越低，行为异常越少</span></li>
                                        </ul>
                                        <div class="nsx-safety-metrics"><div><span>账号风险度 ↓</span><b class="nsx-safety-gradient" style="--nsx-score-fill:${accountRiskColor}">${fmt(safety.C === null ? null : 100 - safety.C)}</b></div><div><span>行为异常度 R ↓</span><b class="nsx-safety-gradient" style="--nsx-score-fill:${anomalyColor}">${fmt(safety.R)}</b></div></div>


                                        ${visibleWarnings.length?`<ul class="nsx-safety-warnings">${visibleWarnings.map(w=>`<li>${escapeInfo(w)}</li>`).join('')}</ul>`:''}
                                        
                                    </section>
                                    <details class="nsx-card-section nsx-safety-details"><summary>查看评分明细 <small>· 双维度评分模型 ${safety.version}</small></summary>
                                        <div class="nsx-safety-row"><span>账号基础分 C</span><b>${fmt(safety.C)}</b></div>
                                        ${accountScoreRows}
                                        <div class="nsx-safety-row"><span>日均主题帖 / 评论 / 累计鸡腿</span></div><div>${rate('posts')} / ${rate('comments')} / ${rate('legs')}</div>
                                        ${p?`<p>Rp ${p.Rp} + Rc ${p.Rc} + Rj ${p.Rj}，年龄系数 K ${p.K}，组合异常 ${p.Rcombo}。</p><p>R = min(100, (${p.Rp} + ${p.Rc} + ${p.Rj}) × (2 − ${p.K}) + ${p.Rcombo}) = ${fmt(safety.R)}</p><p>S = round(clamp(${fmt(safety.C)} − 0.6 × ${fmt(safety.R)}, 0, 100)) = ${safety.S}</p>`:''}
                                    </details>
                                    `;

                                const hoverContent = `
                                    <div class="nsx-profile-card nsx-card-${cardStyle}" style="${cardVariables}">
                                    <section class="nsx-card-section nsx-card-identity"><div class="nsx-card-identity-row"><span>用户ID：${escapeInfo(userId)}</span><span class="nsx-card-countdown"></span></div><div class="nsx-card-detail-note">个性签名：<span class="nsx-card-bio">${escapeInfo(bioText)}</span></div></section>
                                        <div class="nsx-card-header" style="font-weight:bold;margin-bottom:8px;border-bottom:1px solid ${tipDiv};padding-bottom:5px;display:flex;justify-content:space-between;align-items:center;">
                                            <span style="font-size:14px;">${escapeInfo(username)}</span>
                                            <span style="background:${lvGradient};-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-size:15px;font-weight:900;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.1));">Lv ${rankText}</span>
                                        </div>
                                        <div class="nsx-card-summary" style="display:grid;grid-template-columns:1fr auto 1fr;gap:4px 12px;align-items:center;font-size:12px;">
                                            <div style="text-align:left;white-space:nowrap;">注册 <span class="layui-badge layui-bg-blue" style="height:18px;line-height:18px;">${joinDays}</span> 天</div>
                                            <div style="color:${tipDiv};font-size:11px;user-select:none;">|</div>
                                            <div style="text-align:left;white-space:nowrap;"><time class="nsx-profile-joined layui-badge layui-bg-blue" style="height:18px;line-height:18px;" datetime="${escapeInfo(joinedISO)}" aria-label="加入日期：${escapeInfo(joinedTime)}，北京时间（UTC+8）">${escapeInfo(joinedTime)}</time> 加入</div>

                                            <div style="text-align:left;">主题 <a href="/space/${userId}#/discussions" target="_blank" style="font-weight:bold;color:#4fc3f7;text-decoration:underline;">${displayField(safety.fields.posts)}</a></div>
                                            <div style="color:${tipDiv};font-size:11px;user-select:none;">|</div>
                                            <div style="text-align:left;">评论 <a href="/space/${userId}#/comments" target="_blank" style="font-weight:bold;color:#4fc3f7;text-decoration:underline;">${displayField(safety.fields.comments)}</a></div>

                                            <div style="text-align:left;">累计鸡腿 <b style="color:#ffb300;">${displayField(safety.fields.legs)}</b></div>
                                            <div style="color:${tipDiv};font-size:11px;user-select:none;">|</div>
                                            <div style="text-align:left;">星尘 <b style="color:#e040fb;">${displayField(safety.fields.stars)}</b></div>

                                        </div>
                                        ${extraDetails}
                                        <div class="nsx-achievement-notice" style="text-align:left;margin-top:8px;padding-top:8px;border-top:1px solid ${tipBorder};font-size:12px;line-height:1.5;font-weight:600;font-style:normal;color:${tipNoticeColor};">启发式参考，非真实安全概率；不代表交易担保或欺诈认定。</div>
                                    </div>
                                `;

                                const tipIndex = ctx.ui.tips?.(hoverContent, lvSpan, {
                                    tips: [3, 'transparent'],
                                    time: 0,
                                    end: () => {
                                        clearTimeout(tip.countdownTimer);
                                        tip.resizeObserver?.disconnect();
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
                                            const scrollCard = tip.popup.querySelector('.nsx-profile-card');
                                            if(scrollCard){
                                                const countdown = scrollCard.querySelector('.nsx-card-countdown');
                                                const expiresAt = displayedAt.get(el) + PROFILE_TTL;
                                                const updateCountdown = () => {
                                                    const remaining = expiresAt - Date.now();
                                                    const minutes = Math.max(0, Math.ceil(remaining / 60000));
                                                    const text = `${minutes}分钟后将重评`;
                                                    if (countdown.textContent !== text) countdown.textContent = text;
                                                    // The text changes only at minute boundaries; keep one timer for the open card.
                                                    if (remaining > 0 && activeProfileTip === tip) {
                                                        const untilNextMinute = remaining % 60000 || 60000;
                                                        tip.countdownTimer = setTimeout(updateCountdown, untilNextMinute + 10);
                                                    }
                                                };
                                                updateCountdown();
                                                scrollCard.tabIndex=0;
                                                scrollCard.setAttribute('aria-label','用户资料卡，可滚动查看完整内容');
                                                scrollCard.addEventListener('toggle',()=>{
                                                    if(activeProfileTip===tip)requestAnimationFrame(positionProfileTip);
                                                },true);
                                                // Keep page smooth-scroll handlers from swallowing card wheel input.
                                                scrollCard.addEventListener('wheel',event=>event.stopPropagation(),{passive:true});
                                                if(typeof ResizeObserver==='function'){
                                                    tip.resizeObserver=new ResizeObserver(()=>{
                                                        if(activeProfileTip===tip)positionProfileTip();
                                                    });
                                                    tip.resizeObserver.observe(scrollCard);
                                                }
                                            }
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
                                // A page left open past the cache expiry must refresh when the card is opened.
                                if (tip.index != null && Date.now() - displayedAt.get(el) >= PROFILE_TTL) {
                                    refreshUserProfile(userId, el);
                                }
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

                    if (contextAuthor) return;

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
                            frBtn.innerHTML = postActionIcon(isFriend ? 'removeFriend' : 'addFriend') + '<span class="nsx-relation-label">好友</span>';
                            frBtn.setAttribute('aria-label', isFriend ? '取消关注' : '添加好友');
                            bindInlineAction(frBtn, isFriend, 'nsx_advanced_friends', friends, `添加 ${username} 为好友`, `已取消关注 ${username}`, userId);
                            btnWrap.appendChild(frBtn);
                        }
                        if (showBlock) {
                            const blBtn = document.createElement('span');
                            blBtn.className = 'nsx-relation-btn nsx-btn-block';
                            blBtn.innerHTML = postActionIcon(isBlocked ? 'unblock' : 'block') + (isBlocked
                                ? '<span class="nsx-relation-label">解除</span>'
                                : '<span class="nsx-relation-label">屏蔽</span>');
                            blBtn.setAttribute('aria-label', isBlocked ? '解除屏蔽' : '屏蔽');
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

                const detailAuthors = '.nsk-content-meta-info .author-info > a[href*="/space/"], .nsx-tree-context-author';
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
                    .nsx-profile-card{padding:10px;width:280px;max-width:calc(100vw - 16px);max-height:calc(100dvh - 16px);overflow:auto;overscroll-behavior:contain;box-sizing:border-box;color:var(--nsx-ink);background:linear-gradient(135deg,rgba(255,255,255,.30),rgba(255,255,255,.03) 48%,rgba(255,255,255,.13)),var(--nsx-glass);border:0!important;border-radius:10px;box-shadow:none;backdrop-filter:blur(var(--nsx-blur)) saturate(165%);-webkit-backdrop-filter:blur(var(--nsx-blur)) saturate(165%);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;scrollbar-width:thin;font-variant-numeric:tabular-nums}
                    .nsx-profile-card>.nsx-card-header{border:0!important;padding:0 2px 2px!important;margin-bottom:10px!important}
                    .nsx-card-summary,.nsx-card-id,.nsx-card-section{padding:10px;background:var(--nsx-surface)!important;border:0!important;border-radius:10px;color:var(--nsx-ink)!important;font-size:12px;box-shadow:inset 0 1px 0 rgba(255,255,255,.45),0 3px 12px rgba(20,40,65,.045)}
                    .nsx-profile-card>.nsx-card-identity{margin:0 0 9px;padding:7px 9px!important;font-size:11px;line-height:1.5;overflow-wrap:anywhere;background:linear-gradient(120deg,rgba(255,144,112,.64),rgba(255,85,46,.50) 55%,rgba(255,114,80,.30))!important;color:#58200f!important;backdrop-filter:blur(var(--nsx-blur)) saturate(145%);-webkit-backdrop-filter:blur(var(--nsx-blur)) saturate(145%)}
                    .nsx-card-identity-row{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;column-gap:8px}
                    .nsx-card-countdown{margin-inline-start:auto;white-space:nowrap;font-size:10px;font-variant-numeric:tabular-nums}
                    .nsx-profile-card>.nsx-card-identity .nsx-card-detail-note{margin-top:3px;font-size:10px;color:inherit}
                    .dark-layout .nsx-profile-card>.nsx-card-identity,html.dark .nsx-profile-card>.nsx-card-identity{background:linear-gradient(120deg,rgba(255,144,112,.78),rgba(255,85,46,.68) 55%,rgba(255,114,80,.50))!important;color:#321208!important}
                    .nsx-profile-card{overflow-x:hidden!important;overflow-y:auto!important;touch-action:pan-y;-webkit-overflow-scrolling:touch}
                    .nsx-card-section{margin-top:8px;line-height:1.6}
                    .nsx-profile-card>.nsx-card-id{margin:0 0 12px;line-height:1.6}
                    .nsx-profile-card>.nsx-card-id{background:linear-gradient(120deg,rgba(255,255,255,.28),rgba(255,255,255,.03) 52%,rgba(255,255,255,.12)),rgba(255,85,46,.78)!important;color:#58200f!important;backdrop-filter:blur(var(--nsx-blur)) saturate(145%);-webkit-backdrop-filter:blur(var(--nsx-blur)) saturate(145%)}
                    .dark-layout .nsx-profile-card>.nsx-card-id,html.dark .nsx-profile-card>.nsx-card-id{background:linear-gradient(120deg,rgba(255,255,255,.20),rgba(255,255,255,.02) 52%,rgba(255,255,255,.10)),rgba(255,85,46,.88)!important;color:#351207!important}
                    .nsx-card-summary{padding:12px!important}
                    .nsx-card-section{padding:10px!important}
                    .nsx-card-detail-row{display:flex;justify-content:space-between;gap:8px;align-items:baseline}
                    .nsx-card-detail-note{margin-top:5px;color:var(--nsx-muted);overflow-wrap:anywhere}
                    .nsx-profile-card a{color:var(--nsx-accent)!important}
                    .nsx-profile-card .layui-badge{background:transparent!important;color:var(--nsx-accent)!important;border:0!important;padding:0 2px;font-weight:600}
                    .nsx-profile-card .nsx-achievement-notice{border:0!important;color:var(--nsx-muted)!important;font-size:10px!important;font-weight:400!important;margin-top:10px!important;padding-top:0!important}
                    @supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){.nsx-profile-card{background:var(--nsx-fallback)}}

                    .nsx-profile-card,.nsx-profile-card .nsx-card-summary,.nsx-profile-card .nsx-card-id,.nsx-profile-card .nsx-card-section{border:0!important;outline:0!important}
                    .nsx-profile-card .nsx-card-summary,.nsx-profile-card .nsx-card-section,.nsx-profile-card .nsx-card-id{box-shadow:0 3px 12px rgba(20,40,65,.045)}
                    .nsx-profile-card .nsx-reference-score{font-size:20px;line-height:1.2;flex-shrink:0}
                    .nsx-safety-gradient{background:var(--nsx-score-fill);background-clip:text;-webkit-background-clip:text;-webkit-text-fill-color:transparent}
                    .nsx-safety-guide{font-size:10px;line-height:1.6;color:var(--nsx-muted);margin-top:9px}
                    .nsx-safety-row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:4px 0}
                    .nsx-safety-row small,.nsx-safety-caption{color:var(--nsx-muted)}
                    .nsx-safety-total{display:flex;align-items:baseline;gap:6px;margin:8px 0 2px}.nsx-safety-total strong{font-size:30px;line-height:1.15}.nsx-safety-total span{font-size:11px;color:var(--nsx-muted)}
                    .nsx-safety-section .nsx-safety-metrics{margin-top:6px}
                    .nsx-safety-metrics{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.nsx-safety-metrics>div{display:flex;flex-direction:column;gap:2px;padding:5px 7px;border-radius:8px;background:var(--nsx-surface)}.nsx-safety-metrics span{font-size:11px;color:var(--nsx-muted)}.nsx-safety-metrics b{font-size:17px;line-height:1.4}
                    .nsx-safety-warnings,.nsx-safety-details ul{padding-left:16px;margin:8px 0;font-size:11px;line-height:1.5}.nsx-profile-card>.nsx-safety-details{margin-top:8px;padding:5px 10px!important;font-size:11px;line-height:1.6}.nsx-safety-details summary{cursor:pointer;color:var(--nsx-accent)}

                    .nsx-score-heading{font-size:12px;margin:0 0 4px}.nsx-score-status{font-size:10px;line-height:1.3;padding:2px 6px;border-radius:5px;background:var(--nsx-surface);color:var(--nsx-accent);white-space:nowrap}
                    .nsx-score-hero{display:grid;grid-template-columns:max-content minmax(0,1fr);margin:0 0 8px;column-gap:8px;align-items:last baseline}
                    .nsx-score-number{font-family:inherit;font-size:42px;line-height:1;font-weight:700;letter-spacing:normal;filter:drop-shadow(0 1px 1px rgba(0,0,0,.16))}
                    /* An inline block exposes its last text baseline to the outer line. */
                    .nsx-score-verdict{display:inline-block;vertical-align:baseline;max-width:100%;font-size:11px;line-height:1.35}
                    .nsx-score-grade{display:inline-block;padding:1px 4px;border-radius:4px;color:#fff;font-size:10px;line-height:1.4}
                    .nsx-score-verdict p{margin:2px 0 0;font:inherit;color:var(--nsx-muted)}
                    .nsx-score-scale{margin-top:4px}.nsx-score-track{height:9px;border-radius:6px;position:relative}
                    .nsx-score-marker{position:absolute;top:50%;transform:translate(-50%,-50%);width:12px;height:12px;border:2px solid #fff;border-radius:50%;box-sizing:border-box;box-shadow:0 0 0 1px #25314466,0 1px 4px #0004;background:transparent}
                    .nsx-score-ticks{position:relative;height:18px;margin-top:4px;color:var(--nsx-muted);font-size:9px;line-height:14px}.nsx-score-ticks span{position:absolute;transform:translateX(-50%)}.nsx-score-ticks span:first-child{transform:none}.nsx-score-ticks span:last-child{transform:translateX(-100%)}
                    .nsx-score-bands{display:grid;color:var(--nsx-muted);font-size:9px;text-align:center;line-height:1.4}
                    .nsx-score-guide{list-style:none!important;padding:0!important;margin:8px 0 0!important;font-size:9px;line-height:1.65;color:var(--nsx-muted)}.nsx-score-guide li{display:flex;align-items:flex-start;gap:6px;margin:5px 0}.nsx-score-guide svg{width:10px;height:10px;flex:0 0 10px;margin-top:2px;color:var(--nsx-accent)}.nsx-score-guide b{font-weight:500;color:var(--nsx-ink)}
                    .nsx-safety-details summary small{font-size:10px;color:var(--nsx-muted)}
                    .nsx-card-bio{white-space:pre-wrap;overflow-wrap:anywhere}
                    .nsx-user-info-display .nsx-lv-badge{border:0!important;outline:0!important;box-shadow:none!important;background-image:none;text-shadow:none!important;opacity:1}
                    .nsx-user-info-display .nsx-lv-badge::before,.nsx-user-info-display .nsx-lv-badge::after{display:none!important}
                    .nsx-user-info-display .nsx-badge-text{background:transparent!important;color:inherit!important;padding:0!important;border-radius:0}
                    .nsx-user-info-display .nsx-badge-ios{background:#f5f5f7!important;color:#253144!important}
                    .nsx-user-info-display .nsx-badge-liquid{background:linear-gradient(115deg,rgba(255,255,255,.18),rgba(255,255,255,0)),var(--nsx-score-gradient)!important;color:#fff!important;backdrop-filter:blur(8px) saturate(140%);-webkit-backdrop-filter:blur(8px) saturate(140%)}
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
                    .nsx-private-message:hover{text-decoration:none}
                    .nsx-private-message:focus-visible{outline:2px solid #a5b4fc;outline-offset:2px}
                    .dark-layout .nsx-private-message,.dark .nsx-private-message{border-color:#818cf8;color:#c7d2fe;background:rgba(129,140,248,.12)}
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
                        link.innerHTML = postActionIcon('message');
                        const label = document.createElement('span');
                        label.className = 'nsx-pm-label';
                        label.textContent = '私信';
                        link.append(label);
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
        const replyStayFloor = {
            id: 'replyStayFloor', order: 130,
            cfg: { reply_stay_floor: { enabled: true } },
            meta: { reply_stay_floor: { label: '回复后停留原楼层', group: '🧭 辅助工具' } },
            match: ctx => ctx.isPost,
            init(ctx) {
                const key = 'nsx-reply-stay-floor-v1';
                const postId = url => new URL(url, location.href).pathname.match(/^\/post-(\d+)-\d+/)?.[1];
                const currentPost = postId(location.href);
                const enabled = () => ctx.store.get('reply_stay_floor.enabled', true);
                const rows = () => [...document.querySelectorAll('.nsk-post, .comments > li, .comment-item')];
                const floorOf = row => row?.querySelector('.floor-link')?.textContent.trim() || '';
                const editorText = () => {
                    const editor = document.querySelector('.md-editor');
                    return editor?.querySelector('.CodeMirror')?.CodeMirror?.getValue() ?? editor?.querySelector('textarea')?.value ?? '';
                };
                const read = () => { try { return JSON.parse(sessionStorage.getItem(key) || 'null'); } catch { return null; } };
                const write = value => { try { value ? sessionStorage.setItem(key, JSON.stringify(value)) : sessionStorage.removeItem(key); } catch {} };
                let origin = null, pending = null, timer = null, restoring = false, stopRestore = null;
                const clear = () => { pending = null; clearInterval(timer); timer = null; write(null); };
                const snapshot = row => {
                    const floor = floorOf(row);
                    const link = row?.querySelector('.floor-link')?.getAttribute('href');
                    const url = new URL(location.href);
                    // A full floor permalink also identifies its page after infinite loading.
                    if (link && /^\/post-\d+-\d+/.test(link) && postId(link) === currentPost) url.href = new URL(link, location.href).href;
                    url.hash = '';
                    return { post: currentPost, url: url.href, floor, offset: row?.getBoundingClientRect().top ?? 0, y: window.scrollY, at: Date.now() };
                };
                const restore = data => {
                    clear(); origin = null; restoring = true;
                    let cancelled = false, last = '', stable = 0;
                    const end = () => {
                        cancelled = true; restoring = false;
                        document.removeEventListener('wheel', end, true);
                        document.removeEventListener('touchstart', end, true);
                        document.removeEventListener('keydown', end, true);
                        stopRestore = null;
                    };
                    stopRestore = end;
                    document.addEventListener('wheel', end, {capture:true, passive:true});
                    document.addEventListener('touchstart', end, {capture:true, passive:true});
                    document.addEventListener('keydown', end, true);
                    const started = Date.now();
                    const apply = () => {
                        if (cancelled) return;
                        if (!enabled()) { end(); return; }
                        const row = rows().find(row => floorOf(row) === data.floor);
                        const y = row ? window.scrollY + row.getBoundingClientRect().top - data.offset : data.y;
                        window.scrollTo({top:Math.max(0,y), behavior:'instant'});
                        const signature = `${row ? floorOf(row) : ''}:${Math.round(y)}:${document.documentElement.scrollHeight}`;
                        stable = signature === last ? stable + 1 : 0; last = signature;
                        if (Date.now() - started > 4000 || (row && stable >= 8)) end();
                        else setTimeout(apply, 100);
                    };
                    requestAnimationFrame(apply);
                };
                const resume = data => {
                    if (!enabled() || !data || data.post !== currentPost || Date.now()-data.at > 120000) { clear(); return; }
                    const target = new URL(data.url, location.href);
                    if (target.origin !== location.origin || postId(target.href) !== currentPost) { clear(); return; }
                    if (target.pathname !== location.pathname || target.search !== location.search) {
                        // Only one return navigation, even if the server redirects again.
                        if (data.phase === 'returning') { clear(); return; }
                        data.phase = 'returning'; write(data);
                        location.replace(target.href); return;
                    }
                    // Remove the newly posted floor hash, which otherwise scrolls again on reload.
                    if (location.hash) history.replaceState(history.state, '', target.href);
                    restore(data);
                };
                const saved = read();
                if (saved?.phase === 'navigating' || saved?.phase === 'returning') resume(saved);
                else write(null);
                const arm = () => {
                    if (!enabled() || restoring || pending || !editorText().trim()) return;
                    const visible = rows().find(row => row.getBoundingClientRect().bottom > 80);
                    pending = { ...(origin || snapshot(visible)), at:Date.now(), phase:'submitted' };
                    write(pending);
                    // Same-document success: the native editor clears after publishing.
                    // Failed submissions retain their draft, so they never trigger a return.
                    timer = setInterval(() => {
                        if (!pending) return;
                        if (!enabled() || Date.now()-pending.at > 60000) { clear(); return; }
                        if (!editorText().trim() && document.querySelector('.md-editor')) {
                            const data = pending;
                            clearInterval(timer); timer = null;
                            setTimeout(() => { if (pending === data) resume(data); }, 450);
                        }
                    }, 150);
                };
                document.addEventListener('click', event => {
                    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
                    if (!target) return;
                    if (event.isTrusted && restoring) stopRestore?.();
                    const submit = target.closest('.md-editor button.submit, .md-editor button[type="submit"]');
                    if (submit) { if (!submit.disabled && submit.getAttribute('aria-disabled') !== 'true') arm(); return; }
                    const row = target.closest('.nsk-post, .comments > li, .comment-item, .content-item');
                    const action = target.closest('.nsx-floor-quick, .comment-menu a, .comment-menu button, .comment-menu span');
                    if (row && action && (action.matches('.nsx-floor-quick') || /^(回复|引用)$/.test(action.textContent.trim()))) {
                        clear(); origin = enabled() ? snapshot(row) : null; return;
                    }
                    // A user's intentional navigation must not be mistaken for a publish redirect.
                    if (event.isTrusted && target.closest('a[href], .nsk-pager')) { clear(); origin = null; }
                }, true);
                document.addEventListener('keydown', event => {
                    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && event.target.closest?.('.md-editor')) arm();
                }, true);
                document.addEventListener('submit', event => {
                    if (event.target.querySelector?.('.md-editor') || event.target.closest?.('.md-editor')) arm();
                }, true);
                window.addEventListener('pagehide', () => {
                    if (pending && enabled()) write({...pending, phase:'navigating'});
                });
                window.addEventListener('popstate', () => { clear(); origin = null; });
            }
        };
        define(replyStayFloor);
        const editorState = () => {
            const editor=document.querySelector('.md-editor');
            const cm=editor?.querySelector('.CodeMirror')?.CodeMirror,ta=editor?.querySelector('textarea');
            return {editor,cm,ta,text:cm?cm.getValue():(ta?.value||'')};
        };

        const commentTree = {
            id: 'commentTree', order: 145,
            cfg: { comment_tree: { enabled: false } },
            meta: { comment_tree: { label: '评论树', group: '🧭 辅助工具' } },
            match: ctx => ctx.isPost,
            init(ctx) {
                const postKey = url => url.pathname.match(/^\/post-(\d+)-\d+\/?$/)?.[1];
                const post = postKey(new URL(location.href));
                if (!post) return;

                const parseLink = (href, base = location.href) => {
                    try { return new URL(href, base); } catch { return null; }
                };
                const listSelector = 'ul.comments';
                const pagerSelector = '.nsk-pager.post-top-pager';
                const settingKey = 'comment_tree.enabled';
                const narrowScreen = window.matchMedia('(max-width:640px)');
                const controls = document.createElement('div');
                controls.className = 'nsx-comment-tree-controls';
                const toggle = document.createElement('button');
                toggle.type = 'button';
                toggle.className = 'nsx-comment-tree-button';
                const label = document.createElement('span');
                label.textContent = '评论树';
                const track = document.createElement('span');
                track.className = 'nsx-comment-tree-track';
                track.setAttribute('aria-hidden', 'true');
                toggle.append(label, track);
                controls.append(toggle);

                ctx.addStyle('nsx-comment-tree-style', `
                    .nsx-comment-tree-controls,
                    ul.comments.nsx-comment-tree-active {
                        --nsx-tree-accent:#235c9d;
                        --nsx-tree-outline:#d8d8d8;
                        --nsx-tree-indent:clamp(8px,1.5vw,16px);
                        --nsx-tree-frame-gap:15px;
                    }
                    :is(.dark-layout,.dark) :is(.nsx-comment-tree-controls,ul.comments.nsx-comment-tree-active) {
                        --nsx-tree-accent:#9cc8ff;
                        --nsx-tree-outline:#757575;
                    }
                    .nsx-comment-tree-controls{display:flex;justify-content:flex-end;margin:6px 0 10px}
                    .nsk-pager.post-top-pager:has(>.nsx-comment-tree-controls){display:flex;justify-content:flex-end;align-items:center;flex-wrap:wrap}
                    .nsk-pager.post-top-pager>.nsx-comment-tree-controls{display:inline-flex;flex:none;margin:0 0 0 6px;vertical-align:middle}
                    .nsx-comment-tree-button,.nsx-comment-tree-branch{
                        box-sizing:border-box;font:inherit;font-size:12px;line-height:1.25;cursor:pointer;
                        border:1px solid rgba(130,130,130,.18);border-radius:999px;
                        -webkit-tap-highlight-color:transparent;touch-action:manipulation;
                    }
                    .nsx-comment-tree-button,.nsx-comment-tree-branch{
                        display:inline-flex;align-items:center;gap:5px;min-height:0;max-width:100%;padding:2px 5px;
                        color:#757575;
                        background:linear-gradient(155deg,#ffffffc9,#eeeeee80 64%,#ffffff9e);
                        box-shadow:inset 0 1px 1px #fff9,inset 0 -1px 0 #fff7,0 1px 5px #00000012;
                        -webkit-backdrop-filter:blur(12px) saturate(165%);backdrop-filter:blur(12px) saturate(165%);
                    }
                    .nsx-comment-tree-track{
                        display:inline-flex;align-items:center;flex:none;width:25px;height:14px;padding:2px;box-sizing:border-box;
                        border-radius:999px;background:linear-gradient(155deg,#d9d9dbb3,#a6a6aa80);box-shadow:inset 0 1px 2px #0002;
                    }
                    .nsx-comment-tree-track::before{
                        content:'';width:10px;height:10px;border-radius:50%;background:linear-gradient(145deg,#fff,#f3f3f3);
                        box-shadow:0 1px 3px rgba(0,0,0,.24);transition:transform .18s ease;
                    }
                    .nsx-comment-tree-button[aria-pressed="true"] .nsx-comment-tree-track{background:#34c759}
                    .nsx-comment-tree-button[aria-pressed="true"] .nsx-comment-tree-track::before{transform:translateX(11px)}
                    .nsx-comment-tree-button:focus-visible,.nsx-comment-tree-branch:focus-visible{outline:2px solid var(--nsx-tree-accent);outline-offset:2px}
                    ul.comments.nsx-comment-tree-active{display:flex;flex-direction:column;min-width:0}
                    .nsx-comment-tree-active>.nsx-comment-tree-row{order:var(--nsx-tree-order)}
                    .nsx-comment-tree-active>.nsx-comment-tree-child{
                        position:relative;box-sizing:border-box;min-width:0;width:auto;max-width:100%;
                        margin-block:3px 6px;margin-inline:calc(var(--nsx-tree-depth) * var(--nsx-tree-indent) + var(--nsx-tree-frame-gap)) var(--nsx-tree-frame-gap);
                        padding:6px 8px;border:0;border-radius:13px;
                        border-start-start-radius:6px;
                        background: linear-gradient(145deg, #ebebeb66, #f9f9f96e);
                    }
                    :is(.dark-layout,.dark) .nsx-comment-tree-active>.nsx-comment-tree-child{
                        background:linear-gradient(145deg,#383b42b3 0%,#2e3037a8 52%,#292b30cc 100%);
                        box-shadow:inset 0 1px 0 #ffffff0d;
                    }
                    /* Child rows share the same left and right outline even when their indentation differs. */
                    .nsx-comment-tree-active>.nsx-comment-tree-child::after{
                        content:'';position:absolute;pointer-events:none;
                        inset-inline-start:calc((1 - var(--nsx-tree-depth)) * var(--nsx-tree-indent) - var(--nsx-tree-frame-gap));
                        inset-inline-end:calc(-1 * var(--nsx-tree-frame-gap));inset-block:-5px -4px;
                        border-inline-start:1px dashed var(--nsx-tree-outline);
                    }
                    .nsx-comment-tree-active>.nsx-comment-tree-child.nsx-comment-tree-first{margin-block-start:calc(3px + var(--nsx-tree-frame-gap))}
                    .nsx-comment-tree-active>.nsx-comment-tree-first::after{
                        inset-block-start:calc(-1 * var(--nsx-tree-frame-gap));
                    }
                    .nsx-comment-tree-active>.nsx-comment-tree-child.nsx-comment-tree-last{margin-block-end:calc(6px + var(--nsx-tree-frame-gap))}
                    .nsx-comment-tree-active>.nsx-comment-tree-last::after{
                        inset-block-end:calc(-1 * var(--nsx-tree-frame-gap));border-block-end:1px dashed var(--nsx-tree-outline);
                        border-end-start-radius:10px;
                    }
                    ul.comments>.nsx-tree-context{padding:8px;overflow-wrap:anywhere}
                    .nsx-tree-context-header{padding-inline-end:var(--nsx-tree-action-inset,15px);display:flex;align-items:center;justify-content:space-between;gap:4px 10px}
                    .nsx-tree-context-byline{display:flex;align-items:center;gap:4px;min-width:0;white-space:nowrap}
                    .nsx-tree-context-byline>a.nsx-tree-context-author{display:block!important;min-width:0;overflow:hidden;text-overflow:ellipsis}
                    .nsx-tree-context-byline>.nsx-detail-user-info{flex:none;margin:0!important}
                    .nsx-tree-context-byline .nsx-lv-badge{display:inline-flex!important;align-items:center;white-space:pre!important;line-height:1!important;padding-block:0!important}
                    .nsx-tree-badge-days{white-space:pre}
                    html.nsx-mobile .nsx-tree-badge-days{display:none}
                    @media(max-width:760px){.nsx-tree-badge-days{display:none}}
                    .nsx-tree-context-original{flex:none;margin-inline-start:auto;white-space:nowrap}
                    .nsx-tree-context-body{margin-block-start:4px;min-width:0;overflow-wrap:anywhere}
                    .nsx-tree-context-body img{max-width:100%;height:auto}
                    .nsx-tree-context-body :is(pre,table){display:block;max-width:100%;overflow-x:auto}
                    .nsx-comment-tree-child :is(.post-content,.comment-content){min-width:0;overflow-wrap:anywhere}
                    .nsx-comment-tree-child :is(.post-content,.comment-content) img{max-width:100%;height:auto}
                    .nsx-comment-tree-child :is(.post-content,.comment-content) pre{max-width:100%;overflow-x:auto}
                    .nsx-comment-tree-active>.nsx-comment-tree-hidden{display:none!important}
                    .nsx-comment-tree-branch{margin:6px 0;border-radius:5px}
                    .nsx-comment-tree-branch.nsx-comment-tree-branch-mobile{
                        display:flex;width:max-content;max-width:100%;min-height:26px;
                        margin:4px 0;padding:2px 6px;font-size:11px;
                    }
                    .comment-menu>.nsx-comment-tree-branch{float:inline-start;margin:0 auto 0 0;flex-shrink:0}
                    .comment-menu:has(>.nsx-comment-tree-branch){min-height:24px}
                    :is(.nsx-relation-btn.nsx-btn-friend,.nsx-relation-btn.nsx-btn-block,.nsx-private-message,.nsx-floor-quick){
                        --nsx-action-surface-tint:#757575;
                        color:#41454b!important;
                        filter:grayscale(1);
                        border-color:color-mix(in srgb,var(--nsx-action-surface-tint) 23%,transparent)!important;
                        border-block-start-color:color-mix(in srgb,var(--nsx-action-surface-tint) 12%,#ffffff80)!important;
                        background-color:transparent!important;
                        background-image:linear-gradient(145deg,#ffffffa0 0%,transparent 49%,#ffffff35),
                            linear-gradient(120deg,color-mix(in srgb,var(--nsx-action-surface-tint) 3%,transparent),color-mix(in srgb,var(--nsx-action-surface-tint) 8%,transparent))!important;
                        box-shadow:inset 0 1px 1px #fff9,inset 0 -1px 1px #fff7,0 1px 3px #0000000a;
                        -webkit-backdrop-filter:blur(8px) saturate(145%);backdrop-filter:blur(8px) saturate(145%);
                    }
                    .nsx-comment-tree-branch::after{
                        content:'';flex:none;width:0;height:0;
                        border-block:3px solid transparent;border-inline-start:5px solid currentColor;
                    }
                    .nsx-comment-tree-branch[aria-expanded="true"]::after{transform:rotate(90deg)}
                    @media (max-width:640px),(pointer:coarse){
                        ul.comments.nsx-comment-tree-active{--nsx-tree-indent:5px}
                        .nsx-comment-tree-controls{align-items:center;min-height:44px}
                        .nsx-comment-tree-button{position:relative}
                        .nsx-comment-tree-button::after{content:'';position:absolute;inset-inline:0;inset-block:50% auto;height:44px;transform:translateY(-50%)}
                        .nsx-comment-tree-active>.nsx-comment-tree-child{padding:5px 6px;border-radius:11px;border-start-start-radius:5px}
                    }
                    .nsx-private-message{--nsx-action-tint:#4f46e5;--nsx-action-hover-ink:#4f46e5}
                    .nsx-floor-quick{--nsx-action-tint:#4679aa;--nsx-action-hover-ink:#4679aa}
                    :is(.dark-layout,.dark) .nsx-private-message{--nsx-action-hover-ink:#c7d2fe}
                    :is(.dark-layout,.dark) .nsx-floor-quick{--nsx-action-hover-ink:#9ac4ed}
                    :is(.dark-layout,.dark) :is(.nsx-relation-btn.nsx-btn-friend,.nsx-relation-btn.nsx-btn-block,.nsx-private-message,.nsx-floor-quick){color:#e3e5e8!important;box-shadow:inset 0 1px 1px #ffffff32,0 1px 3px #0002}
                    :is(.nsx-relation-btn.nsx-btn-friend,.nsx-relation-btn.nsx-btn-block,.nsx-private-message,.nsx-floor-quick){
                        transition:box-shadow .16s ease,border-color .16s ease,color .16s ease;
                    }
                    @media (hover:hover){
                        :is(.nsx-relation-btn.nsx-btn-friend,.nsx-relation-btn.nsx-btn-block,.nsx-private-message,.nsx-floor-quick):hover{
                            --nsx-action-surface-tint:var(--nsx-action-tint,#757575);
                            color:var(--nsx-action-hover-ink,var(--nsx-action-surface-tint))!important;
                            filter:none;transform:none;opacity:1;
                            box-shadow:inset 0 1px 1px #fff9,0 2px 6px color-mix(in srgb,var(--nsx-action-tint,currentColor) 24%,transparent);
                        }
                    }
                    :is(.dark-layout,.dark) :is(.nsx-comment-tree-button,.nsx-comment-tree-branch){
                        color:#d5d7dc;border-color:#ffffff22;
                        background:linear-gradient(150deg,#ffffff10,transparent 58%),#222429b8;
                        box-shadow:inset 0 1px 0 #ffffff17,inset 0 -1px 0 #0003,0 2px 6px #0004;
                    }
                    :is(.dark-layout,.dark) :is(.nsx-relation-btn.nsx-btn-friend,.nsx-relation-btn.nsx-btn-block,.nsx-private-message,.nsx-floor-quick){
                        border-color:color-mix(in srgb,var(--nsx-action-surface-tint) 24%,#ffffff0d)!important;
                        border-block-start-color:color-mix(in srgb,var(--nsx-action-surface-tint) 20%,#ffffff22)!important;
                        background-color:#202227ad!important;
                        background-image:linear-gradient(150deg,#ffffff12,transparent 53%),
                            linear-gradient(125deg,transparent 30%,color-mix(in srgb,var(--nsx-action-surface-tint) 12%,transparent))!important;
                        box-shadow:inset 0 1px 0 #ffffff16,inset 0 -1px 0 #0003,0 2px 6px #0004;
                    }
                    @media (hover:hover){
                        :is(.dark-layout,.dark) :is(.nsx-relation-btn.nsx-btn-friend,.nsx-relation-btn.nsx-btn-block,.nsx-private-message,.nsx-floor-quick):hover{
                            box-shadow:inset 0 1px 0 #ffffff19,0 2px 7px color-mix(in srgb,var(--nsx-action-surface-tint) 27%,transparent);
                        }
                    }
                    @media (prefers-reduced-motion:reduce){.nsx-comment-tree-track::before{transition:none}}
                `);

                let enabled = ctx.store.get(settingKey, false);
                let list = null, timer;
                const contextRows = new Map();
                const contextMenus = new WeakMap();
                const alignContextLink = (row, menu) => {
                    const header = row.querySelector('.nsx-tree-context-header');
                    const bar = row.querySelector('.comment-menu') || menu.$el;
                    if (!header || !bar) return null;

                    const sync = () => {
                        if (!row.isConnected) return;
                        const labels = document.createTreeWalker(bar, NodeFilter.SHOW_TEXT);
                        let label;
                        while (labels.nextNode()) {
                            if (/^(回复|编辑)$/.test(labels.currentNode.textContent.trim())) label = labels.currentNode;
                        }
                        if (!label) return;
                        const range = document.createRange();
                        range.selectNodeContents(label);
                        const action = range.getBoundingClientRect();
                        const heading = header.getBoundingClientRect();
                        if (!action.width || !heading.width) return;
                        const rtl = getComputedStyle(header).direction === 'rtl';
                        const inset = Math.max(0, rtl ? action.left - heading.left : heading.right - action.right);
                        header.style.setProperty('--nsx-tree-action-inset', `${inset}px`);
                    };
                    sync();
                    if (typeof ResizeObserver !== 'function') return null;
                    const observer = new ResizeObserver(sync);
                    observer.observe(bar);
                    observer.observe(header);
                    return observer;
                };
                const removeContextRow = row => {
                    const mounted = contextMenus.get(row);
                    mounted?.alignment?.disconnect();
                    mounted?.menu.$destroy?.();
                    contextMenus.delete(row);
                    row.remove();
                };
                const pageCache = new Map();
                const pendingPages = new Map();
                const waterfallEnabled = () => ctx.store.get('loading_comment.enabled', false);
                const stopPreloading = () => {
                    for (const [key, controller] of pendingPages) {
                        controller.abort();
                        pageCache.delete(key);
                    }
                    pendingPages.clear();
                };
                const pageOf = url => Number(url.pathname.match(/-(\d+)\/?$/)?.[1]);
                const scheduleRender = () => {
                    clearTimeout(timer);
                    timer = setTimeout(render, 80);
                };
                const collapsed = new Set();
                let applied = new Map();
                let applyVisibility = () => {};
                let revealFloor = () => null;

                const readFloor = (row, base = location.href) => {
                    const link = row.querySelector('.floor-link');
                    const content = row.querySelector('.post-content, .comment-content');
                    const visibleFloor = link?.textContent.trim().match(/^#\s*(\d+)$/)?.[1];
                    const anchor = row.id || row.querySelector('.content-item[id]')?.id;
                    const floor = Number(visibleFloor ?? (/^\d+$/.test(anchor || '') ? anchor : NaN));
                    if (!content || !Number.isSafeInteger(floor) || floor < 1) return null;
                    const href = link?.getAttribute('href');
                    const url = href && parseLink(href, base);
                    const hash = url?.hash.slice(1);
                    return { row, content, floor, anchor, hash, base, children: [] };
                };

                const readReference = item => {
                    const first = item.content.firstElementChild;
                    if (first?.matches('blockquote,pre,ul,ol')) return null;
                    const match = item.content.textContent.trim().match(/^@[^#\r\n]+?\s*#(\d+)(?![\d\w])/);
                    if (!match) return null;
                    const floor = Number(match[1]);
                    const firstLine = first?.matches('p') ? first : item.content;
                    const link = [...firstLine.querySelectorAll('a[href]')].find(a =>
                        !a.closest('blockquote,pre,code') && a.textContent.trim().match(/#(\d+)$/)?.[1] === match[1]);
                    if (!Number.isSafeInteger(floor) || floor < 1 || floor >= item.floor) return null;
                    const target = link && parseLink(link.getAttribute('href'), item.base);
                    if (link && (!target || target.origin !== location.origin || postKey(target) !== post || !target.hash)) return null;
                    return { floor, hash: target?.hash.slice(1) };
                };

                const hasNextPage = (doc, url) => {
                    const next = pageOf(url) + 1;
                    return [...doc.querySelectorAll('.nsk-pager a[href]')].some(link => {
                        if (link.closest('.disabled,[disabled],[aria-disabled="true"]')) return false;
                        const target = parseLink(link.getAttribute('href'), url.href);
                        return target?.origin === location.origin && postKey(target) === post && pageOf(target) === next;
                    });
                };

                const readPage = url => {
                    const key = url.pathname.replace(/\/$/, '');
                    if (pageCache.has(key)) return pageCache.get(key);
                    pageCache.set(key, null);
                    const controller = new AbortController();
                    pendingPages.set(key, controller);
                    const timeout = setTimeout(() => controller.abort(), 10000);
                    fetch(url.href, { credentials: 'same-origin', signal: controller.signal })
                        .then(async response => {
                            if (!response.ok || parseLink(response.url)?.pathname.replace(/\/$/, '') !== key ||
                                parseLink(response.url)?.origin !== location.origin) throw new Error('无法读取原楼层');
                            const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
                            if (controller.signal.aborted) return;
                            const source = doc.querySelector(listSelector);
                            if (!source) throw new Error('未找到评论列表');
                            const rows = [...source.children];
                            const records = readNativeComments(doc);
                            const items = rows.map((row, position) => {
                                const item = readFloor(row, url.href);
                                if (!item) return null;
                                return { ...item, page: key, position, record: records.length === rows.length ? records[position] : null };
                            }).filter(Boolean);
                            pageCache.set(key, { items, hasNext: hasNextPage(doc, url) });
                            if (enabled) scheduleRender();
                        })
                        .catch(error => {
                            if (!controller.signal.aborted) ctx.env.warn('评论树读取跨页楼层失败', error);
                        })
                        .finally(() => {
                            clearTimeout(timeout);
                            if (pendingPages.get(key) === controller) pendingPages.delete(key);
                        });
                    return null;
                };

                const clearContext = () => {
                    for (const row of contextRows.values()) removeContextRow(row);
                    contextRows.clear();
                };

                const makeContextRow = item => {
                    const row = document.createElement('li');
                    row.className = 'nsx-tree-context';
                    const link = document.createElement('a');
                    const original = parseLink(item.row.querySelector('.floor-link')?.getAttribute('href') || '', item.base);
                    const url = new URL(item.base);
                    url.hash = item.hash || item.anchor || String(item.floor);
                    link.href = original?.origin === location.origin && postKey(original) === post && original.hash ? original.href : url.href;
                    link.className = 'nsx-tree-context-original';
                    link.textContent = '查看原楼';
                    link.setAttribute('aria-label', `查看 #${item.floor} 原楼`);
                    const header = document.createElement('div');
                    header.className = 'nsx-tree-context-header';
                    const byline = document.createElement('span');
                    byline.className = 'nsx-tree-context-byline';
                    const floorLabel = document.createElement('span');
                    byline.append(floorLabel);
                    const author = item.row.querySelector('.author-info a[href*="/space/"]');
                    const name = author?.textContent.trim();
                    floorLabel.textContent = `#${item.floor}${name ? ' ·' : ''}`;
                    if (name) {
                        const profile = parseLink(author.getAttribute('href'), item.base);
                        if (profile?.origin === location.origin && /^\/space\/\d+\/?$/.test(profile.pathname)) {
                            const authorLink = document.createElement('a');
                            authorLink.className = 'nsx-tree-context-author';
                            authorLink.href = profile.href;
                            authorLink.textContent = name;
                            byline.append(authorLink);
                        } else byline.append(name);
                    }
                    header.append(byline, link);
                    const body = document.createElement('div');
                    body.className = 'nsx-tree-context-body';
                    body.append(safeContent(item.content, item.base));
                    row.append(header, body);
                    return row;
                };

                const reset = () => {
                    list?.classList.remove('nsx-comment-tree-active');
                    for (const [row, button] of applied) {
                        button?.remove();
                        row.classList.remove('nsx-comment-tree-row', 'nsx-comment-tree-child', 'nsx-comment-tree-hidden', 'nsx-comment-tree-first', 'nsx-comment-tree-last');
                        row.style.removeProperty('--nsx-tree-order');
                        row.style.removeProperty('--nsx-tree-depth');
                    }
                    applied.clear();
                    applyVisibility = () => {};
                    revealFloor = () => null;
                };

                const render = () => {
                    const nextList = document.querySelector(listSelector);
                    if (nextList !== list) clearContext();
                    if (!nextList) { reset(); controls.remove(); list = null; return; }
                    reset();
                    list = nextList;
                    const pager = document.querySelector(pagerSelector);
                    if (pager) {
                        if (controls.parentElement !== pager || controls !== pager.lastElementChild) pager.append(controls);
                    } else if (controls.nextElementSibling !== list) {
                        list.before(controls);
                    }
                    enabled = ctx.store.get(settingKey, false);
                    toggle.setAttribute('aria-pressed', String(enabled));
                    toggle.title = enabled ? '关闭楼中楼，恢复原始顺序' : '开启楼中楼，关联跨页回复';
                    if (!enabled) { clearContext(); return; }

                    const nativeRows = [...list.children].filter(row => !row.classList.contains('nsx-tree-context'));
                    const nativeItems = nativeRows.map(row => readFloor(row));
                    const byFloor = new Map(), byAnchor = new Map();
                    const linkItem = item => {
                        byFloor.set(item.floor, item);
                        for (const anchor of [item.anchor, item.hash]) if (anchor && !byAnchor.has(anchor)) byAnchor.set(anchor, item);
                    };
                    for (const item of nativeItems) if (item && !byFloor.has(item.floor)) linkItem(item);

                    const context = new Map();
                    const importItem = item => {
                        const row = contextRows.get(item.floor) || makeContextRow(item);
                        if (row.parentElement !== list) list.append(row);
                        contextRows.set(item.floor, row);
                        if (!contextMenus.has(row)) {
                            const menu = mountNativeCommentMenu(ctx, row, item.page, item.position, item.record);
                            if (menu) contextMenus.set(row, { menu, alignment: alignContextLink(row, menu) });
                        }
                        const imported = { ...item, row, children: [] };
                        linkItem(imported);
                        context.set(imported.floor, imported);
                        return imported;
                    };
                    const loadedParent = ref => {
                        const parent = ref.hash ? byAnchor.get(ref.hash) : byFloor.get(ref.floor);
                        return parent?.floor === ref.floor ? parent : null;
                    };
                    for (const item of byFloor.values()) {
                        const ref = readReference(item);
                        item.parent = ref && loadedParent(ref);
                        item.parent?.children.push(item);
                    }
                    const currentUrl = new URL(location.href);
                    const currentPage = pageOf(currentUrl);
                    let hasNext = !waterfallEnabled() && hasNextPage(document, currentUrl);
                    for (let page = currentPage + 1; hasNext && page <= currentPage + 3; page++) {
                        const url = new URL(`/post-${post}-${page}`, location.origin);
                        const result = readPage(url);
                        if (!result) break;
                        hasNext = result.hasNext;
                        for (const candidate of [...result.items].sort((a, b) => a.floor - b.floor)) {
                            if (byFloor.has(candidate.floor)) continue;
                            const ref = readReference(candidate);
                            const parent = ref && loadedParent(ref);
                            if (!parent) continue;
                            const child = importItem(candidate);
                            child.parent = parent;
                            parent.children.push(child);
                        }
                    }
                    for (const [floor, row] of contextRows) {
                        if (context.has(floor)) continue;
                        removeContextRow(row);
                        contextRows.delete(floor);
                    }
                    const preloaded = [...context.values()].sort((a, b) => a.floor - b.floor);
                    const rows = [...preloaded.map(item => item.row), ...nativeRows];
                    const items = [...preloaded, ...nativeItems];
                    if (!items.some(item => item?.parent)) return;
                    list.classList.add('nsx-comment-tree-active');

                    // CSS order keeps native comment nodes and Vue's original indices in place.
                    const ordered = [], depths = new Map();
                    for (const [index, row] of rows.entries()) {
                        const item = items[index];
                        if (item?.parent) continue;
                        const stack = [[row, item, 0]];
                        while (stack.length) {
                            const [nextRow, nextItem, depth] = stack.pop();
                            ordered.push([nextRow, nextItem]);
                            depths.set(nextRow, depth);
                            const children = nextItem?.children || [];
                            for (let i = children.length - 1; i >= 0; i--) stack.push([children[i].row, children[i], depth + 1]);
                        }
                    }
                    applyVisibility = () => {
                        const hidden = new Set();
                        let previousChild = null;
                        for (const [row, item] of ordered) {
                            row.classList.remove('nsx-comment-tree-first', 'nsx-comment-tree-last');
                            const parent = item?.parent;
                            const hide = Boolean(parent && (hidden.has(parent) || collapsed.has(parent.floor)));
                            if (hide) hidden.add(item);
                            row.classList.toggle('nsx-comment-tree-hidden', hide);
                            if (!parent) {
                                previousChild?.classList.add('nsx-comment-tree-last');
                                previousChild = null;
                            } else if (!hide) {
                                if (!previousChild) row.classList.add('nsx-comment-tree-first');
                                previousChild = row;
                            }
                            const button = applied.get(row);
                            if (button) {
                                const open = !collapsed.has(item.floor);
                                button.setAttribute('aria-expanded', String(open));
                                button.firstChild.textContent = `${open ? '收起' : '展开'} ${item.children.length} 条回复`;
                            }
                        }
                        previousChild?.classList.add('nsx-comment-tree-last');
                    };
                    for (const [index, [row, item]] of ordered.entries()) {
                        const depth = depths.get(row);
                        row.classList.add('nsx-comment-tree-row');
                        row.classList.toggle('nsx-comment-tree-child', depth > 0);
                        row.style.setProperty('--nsx-tree-order', index);
                        row.style.setProperty('--nsx-tree-depth', Math.min(depth, 3));
                        let button = null;
                        if (item?.children.length) {
                            button = document.createElement('button');
                            button.type = 'button';
                            button.className = 'nsx-comment-tree-branch';
                            button.append(document.createElement('span'));
                            button.addEventListener('click', () => {
                                if (collapsed.has(item.floor)) collapsed.delete(item.floor);
                                else collapsed.add(item.floor);
                                applyVisibility();
                            });
                            const menu = row.querySelector('.comment-menu');
                            const mobile = narrowScreen.matches || document.documentElement.classList.contains('nsx-mobile');
                            if (mobile) {
                                button.classList.add('nsx-comment-tree-branch-mobile');
                                if (menu) menu.before(button);
                                else row.append(button);
                            } else if (menu) {
                                menu.prepend(button);
                            } else {
                                row.append(button);
                            }
                        }
                        applied.set(row, button);
                    }
                    revealFloor = hash => {
                        const item = byAnchor.get(hash.slice(1)) || byFloor.get(Number(hash.slice(1)));
                        for (let parent = item?.parent; parent; parent = parent.parent) collapsed.delete(parent.floor);
                        applyVisibility();
                        return item?.row;
                    };
                    revealFloor(location.hash);
                };

                toggle.addEventListener('click', () => {
                    ctx.store.set(settingKey, !ctx.store.get(settingKey, false));
                    render();
                    const setting = document.querySelector('#nsx-config-content input[name="comment_tree.enabled"]');
                    if (setting) {
                        setting.checked = enabled;
                        window.layui?.form?.render('checkbox');
                    }
                });
                document.addEventListener('click', event => {
                    if (!enabled || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                    const link = event.target.closest?.('a[href]');
                    if (!link || (link.target && link.target !== '_self')) return;
                    const target = parseLink(link.href);
                    if (target?.origin === location.origin && target.pathname === location.pathname && target.hash) revealFloor(target.hash);
                }, true);
                window.addEventListener('hashchange', () => {
                    if (enabled) revealFloor(location.hash)?.scrollIntoView({block:'start'});
                });

                const observer = new MutationObserver(records => {
                    if (!records.some(record => record.target === list || record.target.matches?.(pagerSelector) ||
                        [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 &&
                            (node.matches(listSelector + "," + pagerSelector) || node.querySelector(listSelector + "," + pagerSelector))) ||
                        (enabled && record.target.closest?.('ul.comments .post-content, ul.comments .comment-content')))) return;
                    scheduleRender();
                });
                observer.observe(document.body, {childList:true, subtree:true});
                document.addEventListener('nsx-comment-autoload-change', () => {
                    if (waterfallEnabled()) stopPreloading();
                    render();
                });
                narrowScreen.addEventListener?.('change', render);
                render();
            }
        };
        define(commentTree);
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
                    .nsx-reply-popover{position:fixed;z-index:2147483600;width:280px;padding:10px;box-sizing:border-box;border:0;border-radius:14px;overflow:auto;overscroll-behavior:contain;background:linear-gradient(145deg,#ffffffe8 0%,#f3f7fbbd 58%,#ffffffd9);color:#273141;box-shadow:inset 0 0 0 1px #ffffff8c,inset 0 1px 2px #fff,0 10px 28px #15223826;backdrop-filter:blur(22px) saturate(145%);-webkit-backdrop-filter:blur(22px) saturate(145%);font:13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
                    .nsx-reply-popover-title{font-size:11px;color:#7a8797;padding:2px 6px 7px}
                    .nsx-reply-preset{display:block;box-sizing:border-box;width:100%;margin:4px 0;padding:10px;border:0;border-radius:8px;text-align:left;white-space:pre-wrap;overflow-wrap:anywhere;background:linear-gradient(150deg,#ffffffa6,#ffffff54);color:inherit;font:inherit;cursor:pointer}
                    .nsx-reply-preset:hover,.nsx-reply-preset:focus-visible{background:#4679aa20;outline:none}
                    .dark-layout .nsx-reply-popover,.dark .nsx-reply-popover{background:linear-gradient(145deg,#3d4654ed,#202631e8 65%,#343d4ae8);color:#e7edf5;box-shadow:inset 0 0 0 1px #ffffff26,inset 0 1px 1px #ffffff40,0 10px 28px #0006}
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
                        if(!button){button=make('button','','nsx-floor-quick');button.innerHTML=postActionIcon('quickReply')+'<span>快捷回复</span>';button.setAttribute('aria-label','快捷回复');button.type='button';button.onclick=e=>{e.preventDefault();e.stopPropagation();choose(meta);};}
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
                    transition: all 0.2s; user-select: none; line-height: 1.6;
                    display: inline-flex; flex-flow: row nowrap; align-items: center; justify-content: center; gap: 4px; white-space: nowrap;
                    font-weight: 600; text-shadow: none; box-shadow: none;
                }
                .nsx-relation-btn:hover { opacity: 1; transform: translateY(-1px); }
                .nsx-relation-btn:active { transform: translateY(0); }
                .nsx-btn-block { color: ${state.cfg.blockBtnColor}; border-color: ${state.cfg.blockBtnColor}; background: ${state.cfg.blockBtnColor}12; --nsx-action-tint: ${state.cfg.blockBtnColor}; }
                .nsx-btn-friend { color: ${state.cfg.friendBtnColor}; border-color: ${state.cfg.friendBtnColor}; background: ${state.cfg.friendBtnColor}12; --nsx-action-tint: ${state.cfg.friendBtnColor}; }
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

                    const openRel = (host = document.body) => {
                        if (!relPanel) {
                            relPanel = document.createElement("div");
                            relPanel.id = "nsx-rel-panel";
                            relPanel.innerHTML = `<div class="nsx-rel-header"><div class="nsx-rel-title">社交关系名单</div><button class="nsx-rel-action" data-a="clear">清空列表</button></div><div class="nsx-rel-search">🔍<input placeholder="搜索用户名或备注..."/></div><div class="nsx-rel-tabs"><button class="nsx-rel-tab is-active" data-t="bl">🚫 屏蔽黑名单</button><button class="nsx-rel-tab" data-t="fr">🌟 本地好友</button></div><div class="nsx-rel-list"></div>`;

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
                        if (relPanel.parentElement !== host) host.append(relPanel);
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
                    registerMobileTool('relation', '社交关系', grp, openRel, closeRel);
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
                .nsx-post-action-icon{display:block;flex:none;width:14px;height:14px}
                .nsx-mobile .nsx-relation-label,.nsx-compact-meta .nsx-relation-label{display:none!important}
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
        if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(showReleaseNotes, { timeout: 2000 });
        } else {
            window.setTimeout(showReleaseNotes, 0);
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }

    /* Safety model V3.0: see SAFETY_RULES and calculateSafety. */
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
        return {
            info: nativeGM.info,
            page: { __config__: config, indexedDB: window.indexedDB },
            getValue: (key, fallback) => values.has(key) ? clone(values.get(key)) : clone(fallback),
            setValue: (key, value) => { const copy = clone(value); values.set(key, copy); return write(key, () => nativeGM.setValue(key, copy)); },
            deleteValue: key => { values.delete(key); return write(key, () => nativeGM.deleteValue(key)); },
            listValues: () => [...values.keys()],

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
            GM_openInTab: adapter.openInTab,
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
