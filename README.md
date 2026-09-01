# FreeQuill · 给 Agent Host 使用的写作 Skill 集

FreeQuill 面向使用 Codex、Claude Code 等带文件系统 Agent 的写作者。用户不用理解 Runtime 或 Workflow；安装后直接描述想做的事即可。

## 最简单的用法

把下面这句话发给你的 Agent：

> 请根据这个仓库的 `index.json` 安装 `freequill-creation-suite`，然后帮我写一篇短故事。

`freequill-creation-suite` 会自动路由选题、作品空间、品类诊断、细纲、正文、隔离验稿和本地投稿物料。它不会替你登录、上传、发布或签约。

作品默认保存在：

```text
~/FreeQuill/我的作品/
```

运行记录隐藏在 `~/FreeQuill/.freequill/`。更新 Skill 不会覆盖已有作品。

## 可以单独安装的 Skill

- `freequill-xuanti`：立意、Premise、标题与完整选题。
- `freequill-scaffold`：创建短篇或长篇作品空间。
- `freequill-pinlei-dushi-naodong`：都市脑洞诊断。
- `freequill-pinlei-xuanhuan`：玄幻诊断。
- `freequill-pinlei-guyan`：古言诊断。
- `freequill-pinlei-xianyan`：现言诊断。
- `freequill-review`：短篇与长篇五路隔离验稿。
- `freequill-duanpian-chuangzuo`：Classic 短篇创作。
- `freequill-changpian-chuangzuo`：长篇章节创作。
- `freequill-platform`：只生成本地投稿物料。
- `freequill-creation-suite`：推荐给普通用户的完整入口。

机器安装索引见 `index.json`；Claude marketplace 索引见 `.claude-plugin/marketplace.json`。每个 Skill 都内嵌自己的 Runtime 和测试，可独立安装，不依赖本仓以外的目录。

## 许可证

- `skills/` 与其中脚本：MIT，见 `LICENSE`。
- `docs/`：CC BY-NC 4.0，见 `docs/LICENSE`。
