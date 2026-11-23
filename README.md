# NodeSeek 用户脚本合集

三个 NodeSeek 用户脚本的改版，更新地址统一走 `https://scripts.fengbujue.com/nodeseek/`（Cloudflare Worker 代理本仓库 `main` 分支，`.meta.js` 只返回脚本头，供 Tampermonkey / Violentmonkey 检查更新）。

| 脚本 | 版本 | 安装 |
| --- | --- | --- |
| NodeSeek 热榜插件 | 1.3 | [nodeseek-hotlist.user.js](https://scripts.fengbujue.com/nodeseek/nodeseek-hotlist.user.js) |
| NodeSeek Pro Max（cid 改版） | 1.1.5-cid5 | [nodeseek-pro-max.user.js](https://scripts.fengbujue.com/nodeseek/nodeseek-pro-max.user.js) |
| NodeSeek 一级及以下标记与屏蔽 | 1.0.4-cid2 | [nodeseek-level1.user.js](https://scripts.fengbujue.com/nodeseek/nodeseek-level1.user.js) |

安装前请先停用或删除同名的旧版（Greasy Fork / GitHub 上游版本），以免功能重复执行。

## NodeSeek 热榜插件（1.3）

侧边栏显示实时 / 日榜 / 周榜（数据来自 `api.bimg.eu.org`）。过滤后自动重新排名、向后补位，默认仍显示 10 条。会隐藏：

- 站内黑名单（`/api/block-list/list`）里的作者发的帖子（1.2 起）；
- **已私有、已删除或当前账号看不到的帖子**（1.3）：同源读取帖子页（带当前登录态），HTTP 404 或站点错误页即视为不可见；
- **阅读等级高于当前用户等级的帖子**（1.3）：帖子页 `postData.rank` 就是阅读等级（编辑器里 0=公开、1–6=Lv、255=私有），未登录按 Lv.0 处理。

当前页面帖子列表里带锁形等级标记的帖子直接复用列表信息，不额外请求。检查只针对需要显示的前 15 条左右（展开全部后再查其余），最多 3 路并发，结果按账号缓存（可见 20 分钟、隐藏 60 分钟）。遇到网络错误、Cloudflare 质询、429/5xx 等无法判断的情况一律不隐藏。鼠标悬停在底部「x分前更新」上可以看到当前等级和各类隐藏数量。

## NodeSeek Pro Max（1.1.5-cid5）

基于上游 [NodeSeek Pro Max](https://greasyfork.org/scripts/605053) **1.1.5 的本人修改版（1.1.5-cid1）**，**未合并上游后续版本**。相对 1.1.5-cid1 只有以下改动：

- **1.1.5-cid2：新增「回复后停留在当前楼层（不跳到最后一楼）」**，在设置面板「🧭 辅助工具」里，默认开启。NodeSeek 发表评论成功后会跳到最后一页的新楼层；开启后会刷新回你所在的那一页（开了评论下拉加载时按你正在看的楼层计算页码），并恢复到回复前视口顶部的那一楼。新楼层不在当前页时，底部会提示「查看 #N 楼」。编辑评论的行为不变。
- **1.1.5-cid3：列表「打开预览」里隐藏黑名单用户的评论。** 名单来自 NodeSeek 官方黑名单（`/api/block-list/list`，缓存 60 秒）和本插件的「高级黑名单」（开启时生效，「标记模式」的条目只标记不隐藏），另外帖子数据里标记为 `blocked` 的评论也会隐藏。优先按用户 ID 匹配，其次按用户名。名单读取失败时不隐藏。状态栏显示「本页 N 条评论（已隐藏黑名单 k 条）」，楼层号保持原样。
- **1.1.5-cid4：列表「打开预览」里评论自动翻页。** 在预览框里滚到底部附近会自动读取下一页并接在后面（按楼号去重，不重复显示正文，黑名单过滤对每一页都生效）。底部提示「继续下滑自动加载第 N 页 / 正在加载… / 已到最后一页」，加载失败时显示「重试」按钮，不会因继续滚动反复请求。状态栏显示已加载的页码范围、总页数、累计评论数和累计隐藏数。原有的页码 / 上一页 / 下一页按钮照常可用（点了会整页切换，然后从那一页继续自动翻页）。开关在设置「🧭 辅助工具 → 列表帖子预览 → 预览内评论自动翻页」，默认开启；它独立于「自动加载下一页(评论)」（那个是帖子页用的，默认关）。
- **1.1.5-cid5：隐藏黑名单用户的通知。** 通知页（@我 / 回复 / 私信）里黑名单用户的条目直接隐藏；右侧用户卡片、「侧边卡片通知增强」的分项数字、通知页标签上的未读数都会减去黑名单用户的未读条数（例如 1 个黑名单 @ + 1 个正常 @ 显示 1），减到 0 时按站点原样不再显示红色徽标。名单同样来自官方黑名单（缓存 60 秒）和本插件「高级黑名单」（开启且非标记模式）。做法是在页面里过滤 `/api/notification/{at-me,reply-to-me,message}/list` 与 `/api/notification/unread-count` 的返回，并对已渲染的条目做兜底隐藏；计算未读时只拉有未读的那几类列表，结果缓存 30 秒。任何一步读取失败都保持原样，不会误减。私信按会话统计：若计数按条计算，只在“未读会话全部来自黑名单”时归零，否则按会话数扣减（可能少减，不会多减）。开关在「🧭 辅助工具 → 隐藏黑名单用户的通知」，默认开启。
- 加了本仓库的 `@downloadURL` / `@updateURL` / 主页地址，当前版本号 1.1.5-cid5。

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
