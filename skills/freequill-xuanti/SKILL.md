---
name: freequill-xuanti
description: 在创作前生成、评估或选择题材方向、立意、Premise 与标题时使用；支持完整选题链，也支持只运行其中一个环节。
---

# FreeQuill 选题

本 Skill 是 Host 入口，自带可移植 Runtime。固定顺序、分支、隔离评审、状态与 Artifact 由 `workflows/` 和 `runtime/` 执行；不要在对话里重新编排同一套流程，也不要读取外部 SOP 决定下一步。

## 路由

按用户意图选择入口：

| 用户要做什么 | Workflow | 必要输入 |
|---|---|---|
| 完成立意、Premise、标题与综合签出 | `selection@2` | 创作目标、体量、约束、可用证据、`mode` |
| 只定方向或立意 | `topic-direction@2` | 创作目标、约束、可用证据、`mode` |
| 只生成或评 Premise | `premise-selection@2` | `topic_direction_artifact_ref`；只评时另给 `premise_candidates` |
| 只生成或评标题 | `title-selection@2` | `premise_artifact_ref`；只评时另给 `title_candidates` |

`mode=classic` 时在 Workflow 的 human input 节点等待用户拍板；`mode=fast` 时由 Host 连续执行，但所有标记 `isolation.required=true` 的 Eval 必须交给不同的隔离执行者。没有隔离执行者时提交 `blocked`，不得伪造通过。

## Host 执行

优先从本 Skill 根目录导入 `runtime/user-space.mjs` 的 `ensureUserSpace`，再导入 `runtime/lib/host-loop.mjs` 的 `runHostLoop`，由 Host 注入 `execute(action)`：

1. Capability action 只依据 `action.input`、`action.capability_contract` 和 `action.policy_refs` 生成结构化结果。
2. Human input action把 `action.prompt` 与 `action.input` 交给用户，拿到所需字段后再提交。
3. 确定性节点由 Runtime 自行推进；Host 不复算分数、不改状态文件。
4. 过程记录用 `observe`，正式结果用 `submit`；恢复既有 run 时沿用原 `run_id`。

CLI 入口为 `node <skill-root>/scripts/runtime.mjs`，支持 `start / next / resume / observe / submit / status / check / list`。默认用户空间是 `~/FreeQuill/`：用户只需要查看 `我的作品/`，运行状态隐藏在 `.freequill/`。Skill 安装或升级不得改写已有作品。

## Capability 输出要点

- 方向、Premise、标题生成：输出 `{ candidates: [...] }`；每个候选必须有唯一非空 `id`，内容具体且能被后续评分。
- 三类候选 Eval：输出 `{ evaluations: [...] }`；每项含 `candidate_id`、评分 Policy 声明的全部 `scores`、全部 `hard_gates` 与简短 `rationale`。
- 综合适配 Eval：输出 `{ score, hard_gates: { platform_fit, execution_ready }, rationale }`，分数范围为 0–100。
- Capability 完成结果统一使用 `{ status: "completed", output, executor }`；无法满足证据、输入或隔离要求时返回 `{ status: "blocked", reason, details }`。

生成候选或解释评分前，按需读取：

- `references/premise卡示例与信号取证卡.md`：需要市场信号取证或输出完整 Premise 卡时读取。
- `references/品类写法速查.md`：需要判断品类写法可执行性时读取。

## 边界

- 本 Skill 只完成选题决策与 Artifact 签出，可以初始化默认用户空间，但不创建具体作品正文、不投稿。
- 用户硬约束是一票否决边界；不凭偏好虚构“市场热门”或“作者擅长”。
- 市场证据缺失时明确降级为无市场信号，不拿陈旧案例冒充当前证据。
- 用户可以独立调用任一 Workflow；缺少上游 Artifact 时让 Runtime 返回 `needs_input`，不要绕过契约。
