# FreeQuill · 一句话开始写故事

FreeQuill 是可以安装到 Codex、Claude Code 等 Agent Host 中的开源写作能力。安装一次后，直接告诉 Agent 你想写什么；选题、故事设计、正文写作、检查和本地整理会自动完成。

## 开始使用

安装 `freequill-creation-suite`，然后对 Agent 说：

> 帮我写一篇短故事。

你也可以补充题材、人物、篇幅或结局偏好。不补充时，FreeQuill 会在一次委托内自行完成。

完成后，你会直接得到故事正文。作品和投稿物料默认保存在：

```text
~/FreeQuill/我的作品/
```

FreeQuill 只在本地生成内容，不会登录平台、上传作品、发布或签约。更新 Skill 不会覆盖已有作品。

## 还可以这样说

- “写一个玄幻短故事，主角每次突破都会失去一段记忆。”
- “帮我把这个想法整理成适合开篇的故事方案。”
- “继续写这部长篇的下一章。”
- “检查这篇故事并把需要修改的地方处理好。”
- “为这篇成稿准备本地投稿物料。”

默认交互只展示创作所需的问题、自然进度和最终作品。只有你主动要求查看诊断或验稿证据时，才会展示内部信息。

## 高级与开发者用法

普通用户只需安装 `freequill-creation-suite`。以下独立 Skill 用于定制组合或单独接入某一能力：

- `freequill-xuanti`：立意、Premise、标题与完整选题。
- `freequill-scaffold`：创建短篇或长篇作品空间。
- `freequill-pinlei-dushi-naodong`：都市脑洞诊断。
- `freequill-pinlei-xuanhuan`：玄幻诊断。
- `freequill-pinlei-guyan`：古言诊断。
- `freequill-pinlei-xianyan`：现言诊断。
- `freequill-review`：短篇与长篇多角度检查。
- `freequill-duanpian-chuangzuo`：Classic 短篇创作。
- `freequill-changpian-chuangzuo`：长篇章节创作。
- `freequill-platform`：只生成本地投稿物料。

机器安装索引见 `index.json`；Claude marketplace 索引见 `.claude-plugin/marketplace.json`。每个 Skill 都内嵌运行所需的能力和测试，不依赖本仓以外的目录。开发者诊断记录默认保存在 `~/FreeQuill/.freequill/`。

## 许可证

FreeQuill 的公开 Skill、脚本和配套运行文件采用 MIT 许可证，见 `LICENSE`。
