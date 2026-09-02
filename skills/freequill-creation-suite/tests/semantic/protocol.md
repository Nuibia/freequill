# FreeQuill 匿名语义回归协议

本目录只保存人工编写的匿名契约卡与短文本，不保存答案、来源、配对关系或既有评审结论。它用于验证公开写作规则能否在隔离条件下识别主要结构问题，不代表平台评分、商业结果或完整作品质量。

评审者每次只能获得：本协议、一个 `blind-inputs/FQxxx.json`、指定的一套写作上下文，以及自己的角色说明。不得读取 manifest、私有 oracle、另一套上下文或其他评审结果。

每个输入分别由以下角色审读：

- `logic`：因果、限知、证据、时空与规则连续性。
- `editorial`：承诺、结构、品类核心情绪、完成度与硬红线。
- `reader`：先只读 `body` 冷读复述，再读取 `contract`；检查理解链、期待与情绪回报。
- `technique`：场景、人物、对白、节奏、信息释放与说明书感。
- `commonsense`：现实权限、专业边界、物理可行性与长尾漏洞。

只输出 JSON：

```json
{
  "blind_input_id": "FQ000",
  "input_sha256": "<调度器提供>",
  "role": "logic|editorial|reader|technique|commonsense",
  "agent_id": "<宿主返回的真实身份>",
  "model": "<实际模型>",
  "major_conclusion": "pass|revise|blocked|uncertain",
  "rule_ids": ["CRAFT-..."],
  "findings": [
    {
      "severity": "P0|P1|P2",
      "rule_id": "CRAFT-...",
      "evidence": "正文中连续存在的短锚点",
      "mechanism": "为什么该锚点破坏对应写作机制",
      "minimal_fix": "最小有效修法"
    }
  ],
  "cold_read": null
}
```

`reader` 第一阶段必须填写 `cold_read`，至少复述主角、当场压力、机制、目标和情绪回报；第一阶段冻结后才能看契约卡。没有问题时 `findings` 为空、`rule_ids` 为空，不得为了提高命中率虚构问题。

