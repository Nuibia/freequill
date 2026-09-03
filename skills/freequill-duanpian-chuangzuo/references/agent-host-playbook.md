# Agent Host 生产执行手册

本文件只供 Host 执行普通用户的真实创作委托。测试脚本、测试夹具和示例输出永远不能作为用户作品来源。

## 不可绕过的完成条件

Host 只有在以下条件同时成立时，才能向用户说作品已经完成：

1. 本次用户原话已启动对应的正式流程；“帮我写一篇短故事”使用 `fast-short@2`。
2. 每个待执行动作都按其输入、能力合同、上下文包和规则引用完成并正式提交。
3. 需要独立执行的动作确实交给不同执行者；无法做到时按作者视图说明暂不能继续。
4. 运行状态为完成，存在根交付物，并且作者视图状态为 `done`。
5. 正文和投稿物料由正式流程写入 `FREEQUILL_HOME` 对应的作品空间。

禁止：

- 把 `tests/smoke.mjs`、测试夹具或示例正文当作生产流程运行。
- 为了尽快交付而绕过正式流程，直接新建或修改用户正文、设定或投稿物料。
- 只做人工写作和口头检查，却声称完整质量控制已经执行。
- 将测试生成的匿名作品当作本次用户成品。

## 逐步工具循环

Fast 创作无须用户补充信息时，Host 默认安静执行。不得向普通用户解释正在读取 Skill、规范或仓库，也不得播报独立读者、盲审、隔离角色、评审轮次等后台过程。确需发送进度时，只能原样使用 `references/user-experience-contract.json` 的 `progress_messages`；不能自行扩写原因。

Host 不能直接向 `runUserJourney` 注入模型执行函数时，采用以下内部循环：

1. 将用户原话和必要默认值写入临时输入 JSON；不要让用户执行命令。Fast 短篇的完整输入至少为：

   ```json
   {
     "brief": "<用户原话>",
     "mode": "fast",
     "selection": { "mode": "fast" },
     "access_grant": { "allowed_side_effects": ["workspace_write"] },
     "requested_by": { "agent_id": "<当前 Host 的真实执行者 ID>" }
   }
   ```

   `workspace_write` 只授权本次委托在 `FREEQUILL_HOME` 下创建作品、书级上下文和投稿物料；不授权 Git 提交、推送或平台发布。`runUserJourney` 在 `fast-short@2` 下会注入同样的最小本地写入授权，Host 使用 CLI 循环时则按上面模板显式传入。
2. 用 `<skill-root>/scripts/runtime.mjs start --workflow fast-short@2 --input <临时输入>` 启动；`<skill-root>` 是当前已安装 `freequill-creation-suite` 的绝对路径，不是用户工作区根目录。
3. 读取返回的待执行动作。普通动作由当前 Host 完成；需要独立执行的动作交给不同执行者。
   - `configure-book-context@2` 必须按动作合同列出的七份公开模板逐字段生成，不得用自创的自由对象代替。`book_policy.status` 必须是 `configured`；`book_policy.inherits` 的三个版本/品类字段和 `core_emotion` 必须逐字复制动作输入中的 `l2_binding`；本书自己的具体情感主题写入 `story_bible`，不能占用或改写这些继承字段。
   - `evaluate-story-engine@1` 与 `evaluate-short-outline@1` 必须对 `action.input.frozen_constraints` 每一项各输出一条 `constraint_checks`，使用相同 `constraint_id`，并以当前故事引擎或细纲中的具体证据说明 `PASS` 或 `FAIL`。只要世界规则、能力输入输出、选择顺序、限制、代价或结局承诺有一项冲突，总 verdict 就不能是 `PASS`。这不是让评审改写书级规则；需要修正的是故事引擎或细纲。
4. 将结构化结果写入临时 JSON，再用下面的完整命令提交；四个参数都不可省略。每个动作使用唯一文件名（例如 `.freequill-result-<action-id>.json`），不要在一次文件补丁中对同一临时文件执行多次删除/新建。普通动作的结果也必须使用完整外层结构，能力合同要求的字段放在 `output` 内，不得只提交 `output` 的内容：

   ```json
   {
     "status": "completed",
     "output": {
       "<能力合同字段>": "<本次执行结果>"
     },
     "side_effects": [],
     "executor": {
       "agent_id": "<当前 Host 的真实执行者 ID>",
       "isolated": false
     }
   }
   ```

   `revise-short-story@1` 是逐项证据化返修：只允许以**当前待执行动作**的 `input.draft` 为底稿，不能回头修改、复制或继续使用任何前一 action 的结果文件。为当前 action 新建结果文件，并对 `input.required_resolutions` 的每个 `finding_id` 各提交一条 `resolution_report`：

   ```json
   {
     "finding_id": "finding-01",
     "change_type": "replace",
     "change": "说明本次最小修改",
     "before_evidence": "当前底稿中被替换的原文短句",
     "after_evidence": "返修后正文中真实存在的新短句"
   }
   ```

   `replace` / `delete` 的 `before_evidence` 必须真实存在于当前底稿且不再残留于新正文；`insert` 的 `after_evidence` 必须是当前底稿原先没有的新内容；若评审误报且正文原本已满足要求，才使用 `confirm`。证据短句不得超过 240 字。Runtime 会在进入下一轮昂贵验稿前确定性核对这些证据；不要只在 `resolved_findings` 中声称已经修复。

   然后提交该文件：

   ```sh
   node <skill-root>/scripts/runtime.mjs submit \
     --run-id <run-id> \
     --action-id <action-id> \
     --expected-revision <当前 revision> \
     --file <临时结果.json>
   ```

   只提交当前动作要求的字段，不从测试夹具复制结果。需要独立执行的动作，其结果还必须包含真实独立执行者信息：

   ```json
   {
     "executor": {
       "agent_id": "<不同于发起者的真实执行者 ID>",
       "isolated": true
     }
   }
   ```

   冷读动作还需按当前动作合同提供 `cold_read_frozen_before_context: true`；不得为了过门而伪造这些字段。
5. 重复处理下一动作，直到进入完成、提问、暂不能继续或异常状态。
6. 对用户回复前运行 `node <skill-root>/scripts/runtime.mjs present --run-id <id>`。只使用作者视图组织回复，不打印原始状态。

Fast 模式自行选择品类和方向，不中途等待用户确认。临时输入、动作结果和运行记录进入隐藏状态空间；正文、设定和投稿物料只进入作品空间。

## 显式诊断

用户主动要求诊断时，才可执行 `present --run-id <id> --diagnostics`，并只解释与用户问题有关的部分。普通创作委托不得附带该参数。
