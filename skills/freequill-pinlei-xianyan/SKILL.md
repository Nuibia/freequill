---
name: freequill-pinlei-xianyan
description: 创作或诊断女频现言的主情绪、关系拉扯、信息差释放和人物主体性时使用。
---

# 现言品类

启动 `genre-diagnose@2`，固定 `genre=xianyan`。检查本段主情绪是否清晰、信息差是否推动关系变化、核心信息是否过早耗尽，以及人物是否通过行动而非重复误会推进故事。

本 Skill 可以独立诊断，也可被短篇或长篇 Workflow 嵌套；它不替代作品事实或用户硬约束。

Context Composer 必须显式加载 L1、现言 L2 规则与算子、`RUBRIC-XIANYAN-001`，以及作品存在时的 L3。L3 只能具体化主情绪、关系和职业边界，不能混改核心情绪、取消人物主体性，或用重复误会替代信息释放后的行动变化。

执行前读取 [Host 执行协议](references/host-protocol.md)。
