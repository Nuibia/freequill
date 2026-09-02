---
name: freequill-creation-suite
description: 用户安装 FreeQuill 后直接要求写短故事、完成整套小说创作，或需要在选题、开书、创作、验稿和投稿物料之间自动路由时使用。
---

# FreeQuill 创作套件

这是面向普通用户的默认入口。用户说“帮我写一篇短故事”时，启动 `fast-short@2`，在一次委托内完成选题、脚手架、品类诊断、故事引擎、细纲、正文、隔离验稿和本地投稿物料。

## 意图路由

| 请求 | Workflow |
|---|---|
| 一次性写完短故事 | `fast-short@2` |
| 完整或局部选题 | `selection@2` / 对应选题子 Workflow |
| 只创建作品空间 | `scaffold@2` |
| 只诊断品类 | `genre-diagnose@2` |
| Classic 短篇 | `short-create@2` |
| 长篇下一章 | `long-chapter@2` |
| 只验稿 | `review-short@2` / `review-long@2` |
| 只生成投稿物料 | `submission@2` |

Fast 不是取消质量门：所有关键 Eval 和五路验稿仍必须隔离。没有隔离执行者时阻塞，不用发起 Agent 冒充自评。

Runtime 会按 Capability contract 自动编译 `action.context_bundle`。Host 只使用 bundle 中的 L1 公共规则、L2 品类规则和用户作品内 L3；缺层或层级冲突时停止，不自行补写规则。Scaffold 会先生成并冻结本地 L3，后续写作持续读取它。

作品默认落在 `~/FreeQuill/我的作品/`。只生成本地内容和物料，不登录平台、不上传、不发布、不签约。执行前读取 [Host 执行协议](references/host-protocol.md)。
