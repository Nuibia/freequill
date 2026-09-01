---
name: freequill-scaffold
description: 用户要新建短篇或长篇写作空间、根据已确认选题创建作品目录时使用。
---

# FreeQuill 脚手架

启动 `scaffold@2`。输入已批准的 `selection_artifact_ref`，或提供等价的 `topic_package`；另给 `form=short|long`。缺少选题时让 Runtime 返回 `needs_input`，不得凭空造书。

作品只创建在 `~/FreeQuill/我的作品/<标题>/`，已有同名用户文件不覆盖。安装和升级不能触发脚手架。

执行前读取 [Host 执行协议](references/host-protocol.md)。
