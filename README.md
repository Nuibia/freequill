# freequill · 自由写作 —— AI 协作网文创作 skill 集

一套给「有智能体（Claude Code / Codex 这类带文件系统的 agent）+ 想写小说」的人用的写作 skill。不写提示词玄学，每个 skill 都是一套可执行的工作流，一步一步来。

## 快速开始：一句话安装

不需要 clone 本仓。把这句话发给你的智能体（替换成你要的 skill 名）：

> 帮我安装 freequill-xuanti 这个 skill，索引在本仓的 index.json

你的 agent 会读本仓 `index.json`，找到文件清单，下载到它的 skills 目录，装完即用。

- **Claude Code 用户**也可以用 marketplace 方式：添加本仓为 marketplace 后 `/plugin install`（见 `.claude-plugin/marketplace.json`）。
- 每个 skill 都能单独装、单独用。

## 当前已放出

见 `index.json`（机器可读）或 `skills/` 目录。

## 反馈与共建

- 使用中遇到问题、被 AI 带偏的案例：开 issue 或 Discussion，优秀案例会进错题本；
- 平台规则类更新请附官方来源链接；
- 早期暂不接收代码 PR，先收反馈。

## 许可证

- `skills/`、工具脚本：MIT（见 `LICENSE`）
- `docs/` 等文档：CC BY-NC 4.0（见 `docs/LICENSE`）——可学习、可二改自用，商用请找作者。
