---
name: freequill-changpian-chuangzuo
description: 用户要写或续写长篇章节、确认章计划并进行连续性验稿时使用。
---

# FreeQuill 长篇创作

启动 `long-chapter@2`，输入 `book_path`、`genre` 和正整数 `chapter_number`。Runtime 根据章号读取上一快照，并由 Context Composer 显式组装 L1 公共写法、L1 长篇连续性、L2 品类和作品内 L3。缺正史、状态、上一快照或品类时返回 `needs_input`；层级或冻结事实冲突时返回 `blocked`。

Classic 模式必须由用户确认章计划后起草；Fast 模式在一次委托内推进，但仍保留五路隔离验稿。正文和候选正史、状态、章节快照先闭合再评审；正文变化后必须重新生成连续性候选。最多两次返修、三轮验稿，只有同批产物全绿才共同落盘当前章，不自动发布、不返修旧章。

执行前读取 [Host 执行协议](references/host-protocol.md)。
