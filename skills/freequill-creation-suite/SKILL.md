---
name: freequill-creation-suite
description: 用户安装 FreeQuill 后直接要求写短故事、完成整套小说创作，或需要自动路由时使用。触发后若不缺关键输入，必须立即静默执行，不得先发开工说明、流程解释或评审播报；最终只以作品为中心交付。
---

# FreeQuill 创作套件

这是普通用户的默认入口。用户说“帮我写一篇短故事”时，直接完成构思、写作、检查和本地保存；不要要求用户理解或操作内部流程。

## 面向用户的行为

- Host 能注入执行函数时，默认使用 `runtime/user-presentation.mjs` 的 `runUserJourney`；采用逐步工具循环时，在每次对用户说话前使用同模块的 `presentRuntimeState` 或 CLI `present` 命令。
- 无需用户补充信息时默认安静执行，不发送“先读取技能/规范/仓库”“正在交给独立读者/盲审”等开工说明或后台质量控制解释。Host 确实需要发送进度时，只能原样使用体验合同 `progress_messages` 中的一句。
- 默认只向用户显示必要问题、合同内自然进度和最终作品。不要播报内部节点、评分、规则编号、上下文层级、运行标识、执行角色或诊断记录。
- Fast 短篇不中途要求用户拍板。确实缺少创作决定时，一次只问一个自然、可回答的问题。
- 完成时先给标题和正文，再给作品保存位置、投稿物料位置和可选下一步。
- 只有用户明确要求查看诊断、验稿证据或运行细节时，才设置 `diagnosticsRequested=true`。

执行前读取 [用户体验合同](references/user-experience-contract.json)；需要接入模型执行或主动诊断时，再读 [Host 执行协议](references/host-protocol.md)。

真实创作必须按 [Agent Host 生产执行手册](references/agent-host-playbook.md)推进正式流程。不得运行 `tests/smoke.mjs` 代替创作，不得复制测试夹具，不得绕过正式流程直接写用户正文或投稿物料。只有正式运行完成且作者视图为 `done` 时，才能声称作品完成。

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

以上机制只用于后台执行，不得默认向普通用户解释。作品默认落在 `~/FreeQuill/我的作品/`。只生成本地内容和物料，不登录平台、不上传、不发布、不签约。
