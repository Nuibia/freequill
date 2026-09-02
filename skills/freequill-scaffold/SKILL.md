---
name: freequill-scaffold
description: 用户要新建短篇或长篇写作空间、根据已确认选题创建作品目录时使用。
---

# FreeQuill 脚手架

启动 `scaffold@2`。输入已批准的 `selection_artifact_ref`，或提供等价的 `topic_package`；另给 `form=short|long` 和受支持的 `genre`。缺少选题或品类时让 Runtime 返回 `needs_input`，不得凭空造书。

短篇脚手架先创建作品空间，再由 `configure-book-context@2` 生成 `book-policy`、故事圣经、人物与对白卡、创作决策、正史账、当前状态和初始章节快照。语义 Action 只返回对象，确定性节点校验 L1/L2/L3 继承后写入用户作品；安装或升级不触碰这些文件。

作品只创建在 `~/FreeQuill/我的作品/<标题>/`，已有同名用户文件不覆盖。安装和升级不能触发脚手架。

执行前读取 [Host 执行协议](references/host-protocol.md)。
