---
name: freequill-xuanti
description: 在写作前生成、评估或选择立意、Premise 与标题时使用；既支持完整选题，也支持只运行其中一个环节。
---

# FreeQuill 选题

这是选题意图入口。固定顺序、量化评分、隔离评审、状态和 Artifact 由内嵌 Runtime 执行，不在对话里重建状态机。

## 路由

- 完整选题：`selection@2`
- 只定方向：`topic-direction@2`
- 只做 Premise：`premise-selection@2`
- 只做标题：`title-selection@2`

Fast 模式连续推进；Classic 模式在候选选择与最终签出处等待用户。市场证据缺失时明确降级，不虚构“热门”或“擅长”。关键 Eval 必须由隔离执行者完成。

需要整理证据与候选时读取 [信号与 Premise 卡](references/信号与Premise卡.md)；需要判断四个已支持品类的可写性时读取 [品类速查](references/品类速查.md)。

执行前读取 [Host 执行协议](references/host-protocol.md)。本 Skill 只签出选题 Artifact，不创建正文或执行投稿。
