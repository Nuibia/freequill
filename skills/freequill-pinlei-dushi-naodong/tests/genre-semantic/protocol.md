# FreeQuill 四品类匿名语义回归协议

本目录只保存匿名契约卡与短文本，不保存答案、私有来源、配对关系或既有结论。评审者每次只能获得本协议、一个输入、指定品类上下文及角色说明，不得读取 manifest、私有 oracle、另一侧上下文或其他评审结果。

评审输出 JSON，字段为 `blind_input_id`、`input_sha256`、`role`、`agent_id`、`model`、`major_conclusion`、`rule_ids`、`findings` 和 `cold_read`。`major_conclusion` 仅允许 `pass|revise|blocked|uncertain`；发现项必须引用实际加载的 Rule ID、正文连续短锚点、失效机制和最小修法。读者角色先冻结正文冷读，再看契约；无问题时不得虚构发现。

品类判据来自 Context Bundle 中对应 L2 Rule、Operator 和 Rubric；L1 因果、人物能动性、连续性与常识仍优先。评审只判断样本文本，不推断作者意图，不补写缺失事实。
