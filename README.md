# Codex 重置动态

Xiasr 博客的独立工具页：https://codex.xiasr.eu.cc/ ，博客入口：https://xiasr.eu.cc/codex/ 。

参考 Codex Resets 的深色卡片布局，独立实现，不使用其数据、广告或身份标识。非 OpenAI 官方服务。

## 数据与更新

- GitHub Actions 计划每 15 分钟通过免费的 FxTwitter v2 接口读取 Tibo（@thsottiaux）的公开帖子；调度可能延迟，接口无稳定性保证。
- 验证账号 ID，识别重置公告，将关联的完成回复合并到原公告。自动识别可能遗漏或误判，请核对原帖。
- 不将公告时间当成实际到账时间。已完成的状态仅来自原帖或关联的完成说明。
- 启动历史采集最多 12 页；日常读取 2 页。种子数据与线上成功快照合并，失败保留缓存，页面显示更新时间和异常状态。
- 静态站点只读取同源 JSON，访客无需 Token、登录或访问第三方抓取接口。
- GitHub 公共仓库长时间无活动可能暂停计划任务，需在 Actions 页面重新启用。

## 本地使用

需要 Node.js 22+，无第三方依赖：

```sh
npm test
npm run sync
npm run build
```

首次补充历史：`npm run sync -- --bootstrap`。构建输出为 `dist/`。GitHub Pages 使用 Actions 发布，CNAME 为 `codex.xiasr.eu.cc`，DNS CNAME 指向 `xiasrli.github.io`，仅 DNS。

源码：`site/`；采集与合并：`scripts/`；发布种子：`data/feed.json`。失败缓存不会证明期间没有重置，日历空白不代表确定无重置。
