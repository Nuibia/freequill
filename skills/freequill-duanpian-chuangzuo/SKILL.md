---
name: freequill-duanpian-chuangzuo
description: 用户要写、续写或返修短篇故事正文时使用；包含故事引擎、细纲、起草和五路验稿。
---

# FreeQuill 短篇创作

启动 `short-create@2`。独立运行时需要 `book_path` 与选题信息；通常先由 `freequill-scaffold` 创建作品空间。

Classic 模式在细纲后等待用户批准；Fast 模式在一次委托内连续推进。故事引擎和细纲各自经过隔离 Eval，正文最多两次返修、三轮五路验稿。通过后才写入 `正文/`。

每个语义 Action 必须带 Runtime 编译的 Context Bundle。L3 缺失返回 `needs_input`；L3 改写品类核心情绪、放宽品类红线或与冻结正史/状态冲突时返回 `blocked`。

执行前读取 [Host 执行协议](references/host-protocol.md)。平台物料由 `freequill-platform` 单独处理。
