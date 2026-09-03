# Host 执行协议

FreeQuill Skill 自带 Runtime，但模型调用由 Codex、Claude Code 等 Agent Host 完成。

## 普通用户默认入口

Host 能注入 `execute(action)` 时，普通创作请求调用 `runtime/user-presentation.mjs` 的 `runUserJourney`。Host 采用逐步工具循环时，照常在后台推进执行，但每次准备对用户说话前必须使用 `presentRuntimeState`，或运行 `scripts/runtime.mjs present --run-id <id>` 取得作者视图。两种方式都只向用户呈现符合 `schemas/user-view.v1.json` 的内容。

- Host 只把作者视图中的 `message`、`question`、`delivery` 和 `next_options` 转成自然语言，不原样打印整个对象。
- `delivery.story.chapters` 是应优先交付的正文；文件位置随后说明。
- 默认不得展示原始状态、内部动作、评分、规则编号、上下文层级、运行标识或追踪信息。
- 用户明确要求查看诊断时，才传 `diagnosticsRequested=true`；完整原始结果会放在 `developer_diagnostics`。
- 执行异常也必须先经作者视图转换，不把异常栈或内部错误原样抛给普通用户。

作者视图约束见 [用户体验合同](user-experience-contract.json)。

真实用户委托还必须遵守 [Agent Host 生产执行手册](agent-host-playbook.md)。安装包中的测试只用于安装和回归验收，绝不能代替生产流程或提供用户正文。Host 不得绕过正式流程直接写作品文件。

## 内部执行循环

1. 从 Skill 根目录导入 `runtime/lib/host-loop.mjs` 的 `runHostLoop`。
2. 根据 Skill 路由选择 Workflow，并把本次用户请求作为 input。
3. `execute(action)` 只依据 `action.input`、`action.capability_contract`、`action.context_bundle` 和 `action.policy_refs` 返回结构化结果。`context_bundle` 是 Runtime 按 Capability contract 编译的 L1 + L2 + L3 唯一上下文；不得绕过它临场补猜规则。
4. 标记 `isolation.required=true` 的 action 必须交给不同执行者，并提交不同的 `executor.agent_id`；无法隔离时返回 blocked。
5. 标记 `isolation.cold_read=true` 的 reader action 必须分两段投递：短篇先只给 `action.input.body`，长篇先只给 `action.input.chapter` 的正文内容；冻结复述和理解断点后，再给 Context Bundle 完成规则评审。结果须提交 `executor.cold_read_frozen_before_context=true`。
6. `human_input` action 原样交给用户；Fast 模式不会中途要求用户拍板。
7. Capability 不直接修改 Runtime 状态；过程用 observe，正式结果由 Host submit。
8. 本地内容写入只允许 `workspace_write`，且必须来自用户本次委托；投稿 Workflow 永远只生成本地物料。

CLI 是 Host 内部执行和开发者诊断入口：`node <skill-root>/scripts/runtime.mjs`，支持 `start / next / resume / observe / submit / status / present / check / list`。`present` 默认只返回作者视图；只有用户明确要求诊断时才可附加 `--diagnostics`。不得要求普通用户执行这些命令。默认内容目录为 `~/FreeQuill/我的作品/`，隐藏运行态为 `~/FreeQuill/.freequill/runtime-v2/`；可用 `FREEQUILL_HOME` 改成本次工作区。安装与升级不得改写已有作品。
