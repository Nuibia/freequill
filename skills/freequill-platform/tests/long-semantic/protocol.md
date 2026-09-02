# FreeQuill 长篇匿名连续性回归协议

每个样本包含上一章冻结事实与状态、本章目标、本章正文和候选连续性摘要。评审者只获得本协议、单个样本、指定的一侧长篇 Context 与角色说明；不得读取 oracle、另一侧 Context 或既有结果。

五个角色分别检查：`logic` 因果、限知、正史和状态；`editorial` 章推进、品类回报与钩子；`reader` 先只读本章正文冻结理解，再读取其余材料；`technique` 场景、信息释放和跨章过渡；`commonsense` 物件、空间、时间与可执行性。

输出 JSON：顶层含 suite/side/role/agent/model/context 信息和 cases；每例含 `blind_input_id`、`input_sha256`、`major_conclusion`、`findings`、`cold_read`。公开 finding 必须引用已加载 Rule ID，并给正文连续短锚点、机制和最小修法。
