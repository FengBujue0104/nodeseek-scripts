# NodeSeek 用户脚本合集

三个 NodeSeek 用户脚本的改版，更新地址统一走 `https://scripts.fengbujue.com/nodeseek/`（Cloudflare Worker 代理本仓库 `main` 分支，`.meta.js` 只返回脚本头，供 Tampermonkey / Violentmonkey 检查更新）。

| 脚本 | 版本 | 安装 |
| --- | --- | --- |
| NodeSeek 热榜插件 | 1.3 | [nodeseek-hotlist.user.js](https://scripts.fengbujue.com/nodeseek/nodeseek-hotlist.user.js) |
| NodeSeek Pro Max（cid 改版） | 1.1.5-cid3 | [nodeseek-pro-max.user.js](https://scripts.fengbujue.com/nodeseek/nodeseek-pro-max.user.js) |
| NodeSeek 一级及以下标记与屏蔽 | 1.0.4-cid2 | [nodeseek-level1.user.js](https://scripts.fengbujue.com/nodeseek/nodeseek-level1.user.js) |

安装前请先停用或删除同名的旧版（Greasy Fork / GitHub 上游版本），以免功能重复执行。

## NodeSeek 热榜插件（1.3）

侧边栏显示实时 / 日榜 / 周榜（数据来自 `api.bimg.eu.org`）。过滤后自动重新排名、向后补位，默认仍显示 10 条。会隐藏：

- 站内黑名单（`/api/block-list/list`）里的作者发的帖子（1.2 起）；
- **已私有、已删除或当前账号看不到的帖子**（1.3）：同源读取帖子页（带当前登录态），HTTP 404 或站点错误页即视为不可见；
- **阅读等级高于当前用户等级的帖子**（1.3）：帖子页 `postData.rank` 就是阅读等级（编辑器里 0=公开、1–6=Lv、255=私有），未登录按 Lv.0 处理。

当前页面帖子列表里带锁形等级标记的帖子直接复用列表信息，不额外请求。检查只针对需要显示的前 15 条左右（展开全部后再查其余），最多 3 路并发，结果按账号缓存（可见 20 分钟、隐藏 60 分钟）。遇到网络错误、Cloudflare 质询、429/5xx 等无法判断的情况一律不隐藏。鼠标悬停在底部「x分前更新」上可以看到当前等级和各类隐藏数量。

## NodeSeek Pro Max（1.1.5-cid3）

基于上游 [NodeSeek Pro Max](https://greasyfork.org/scripts/605053) **1.1.5 的本人修改版（1.1.5-cid1）**，**未合并上游后续版本**。相对 1.1.5-cid1 只有以下改动：

- **1.1.5-cid2：新增「回复后停留在当前楼层（不跳到最后一楼）」**，在设置面板「🧭 辅助工具」里，默认开启。NodeSeek 发表评论成功后会跳到最后一页的新楼层；开启后会刷新回你所在的那一页（开了评论下拉加载时按你正在看的楼层计算页码），并恢复到回复前视口顶部的那一楼。新楼层不在当前页时，底部会提示「查看 #N 楼」。编辑评论的行为不变。
- **1.1.5-cid3：列表「打开预览」里隐藏黑名单用户的评论。** 名单来自 NodeSeek 官方黑名单（`/api/block-list/list`，缓存 60 秒）和本插件的「高级黑名单」（开启时生效，「标记模式」的条目只标记不隐藏），另外帖子数据里标记为 `blocked` 的评论也会隐藏。优先按用户 ID 匹配，其次按用户名。名单读取失败时不隐藏。状态栏显示「本页 N 条评论（已隐藏黑名单 k 条）」，楼层号保持原样。
- 加了本仓库的 `@downloadURL` / `@updateURL` / 主页地址，当前版本号 1.1.5-cid3。

1.1.5-cid1 原有的改动（「打开预览」按钮固定白底黑字，浅色 / 深色模式一致）保持不变。

> 如果之前装过本仓库短暂发布的 1.4.42-cid1（误合并了上游 1.4.42），Tampermonkey 不会从高版本“更新”回 1.1.x-cid 版本，请打开上面的安装链接手动重新安装覆盖（或先删除旧脚本再安装）。

## NodeSeek 一级及以下标记与屏蔽（1.0.4-cid2）

基于上游 [V3ynix/nodeseek-level1](https://github.com/V3ynix/nodeseek-level1) 1.0.4：开关面板默认折叠并移到左下角；1.0.4-cid2 只改了更新地址。

## 开发

```bash
npm install
npm test   # 语法检查 + jsdom 单测（热榜过滤、回复停留楼层）
```

## 致谢与授权

- 热榜插件原作者：[NodeSeek @10539](https://www.nodeseek.com/space/10539)，[Greasy Fork 560065](https://greasyfork.org/scripts/560065)，MIT。
- NodeSeek Pro Max：用蚊香买榄菊，[Greasy Fork 605053](https://greasyfork.org/scripts/605053)，基于 [NodeSeek Pro+](https://greasyfork.org/scripts/602733)，GPL-3.0。本仓库中的修改版同样以 GPL-3.0 发布，本仓库即其完整源代码。
- 一级及以下标记与屏蔽：[V3ynix](https://github.com/V3ynix/nodeseek-level1)，MIT。

各文件的许可证见 [LICENSE](LICENSE) 与 `LICENSES/` 目录。
