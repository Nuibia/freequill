# Host 执行协议

FreeQuill Skill 自带 Runtime，但模型调用由 Codex、Claude Code 等 Agent Host 完成。

1. 从 Skill 根目录导入 `runtime/lib/host-loop.mjs` 的 `runHostLoop`。
2. 根据 Skill 路由选择 Workflow，并把本次用户请求作为 input。
3. `execute(action)` 只依据 `action.input`、`action.capability_contract`、`action.context_bundle` 和 `action.policy_refs` 返回结构化结果。`context_bundle` 是 Runtime 按 Capability contract 编译的 L1 + L2 + L3 唯一上下文；不得绕过它临场补猜规则。
4. 标记 `isolation.required=true` 的 action 必须交给不同执行者，并提交不同的 `executor.agent_id`；无法隔离时返回 blocked。
5. 标记 `isolation.cold_read=true` 的 reader action 必须分两段投递：短篇先只给 `action.input.body`，长篇先只给 `action.input.chapter` 的正文内容；冻结复述和理解断点后，再给 Context Bundle 完成规则评审。结果须提交 `executor.cold_read_frozen_before_context=true`。
6. `human_input` action 原样交给用户；Fast 模式不会中途要求用户拍板。
7. Capability 不直接修改 Runtime 状态；过程用 observe，正式结果由 Host submit。
8. 本地内容写入只允许 `workspace_write`，且必须来自用户本次委托；投稿 Workflow 永远只生成本地物料。

CLI 为 `node <skill-root>/scripts/runtime.mjs`，支持 `start / next / resume / observe / submit / status / check / list`。默认内容目录为 `~/FreeQuill/我的作品/`，隐藏运行态为 `~/FreeQuill/.freequill/runtime-v2/`；可用 `FREEQUILL_HOME` 改成本次工作区。安装与升级不得改写已有作品。
