---
name: freequill-review
description: 用户要验稿、检查短篇或长篇章节、判断是否需要返修时使用；不负责直接发布。
---

# FreeQuill 验稿

按体量路由：短篇用 `review-short@2`，长篇章节用 `review-long@2`。两条链都要求五个隔离角色；P0/P1 未清零或任一角色未 PASS 时返回 `FIX_BODY`。

独立验稿可直接提供正文结构化内容；被创作 Workflow 嵌套时沿用同一 run 的 Artifact。评审只提交证据与 verdict，不直接改正文。

reader 必须先只读正文并冻结 cold read，再读取 Context Bundle；其执行回执须声明 `cold_read_frozen_before_context=true`。其他角色直接按 bundle 中的 Rule、Operator 和 Rubric ID 举证。

执行前读取 [Host 执行协议](references/host-protocol.md)。
