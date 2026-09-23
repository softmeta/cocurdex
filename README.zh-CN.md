# Cocurdex

[English](README.md) · 简体中文

Cocurdex 是一个桌面优先的多智能体开发工作台。聊天、终端、编辑器和浏览器预览
都集中在一个窗口里，你可以同时运行多个 AI 编码智能体，而不会分不清哪个会话
在等你处理。

目前处于预发布阶段。macOS 是主要平台，Windows 和 Linux 随后跟进。

[文档](https://cocurdex.com/docs/) ·
[快速上手](https://cocurdex.com/docs/getting-started/)

## 反馈

通过 GitHub Issues 提交 bug 和功能建议（见 [SUPPORT.md](SUPPORT.md)）。
日常问题和交流可以加入 [Discord 服务器](https://discord.gg/JuRyyv5bv)或飞书群：

<img src="docs/assets/feishu-feedback-group-qr.png" alt="飞书群二维码" width="240" />

### 遇到问题了？

官网和文档还在完善中，有些答案暂时还没有写出来。如果使用中遇到问题，
你不必等我们处理：

1. 克隆本仓库，[从源码运行 Cocurdex](#从源码运行)。
2. 用你手头任何一个可用的 AI 编码智能体打开这个仓库，让它来调试问题。
   仓库结构本身就是为智能体浏览设计的，在项目根目录启动即可。
3. 把修复提交为 pull request；如果不确定怎么修，也可以把智能体的诊断结论
   开成 issue。维护者会检查改动、按需修正，并在下一个版本中发布。

## 许可证

Cocurdex 采用[功能性源码许可证 1.1](LICENSE.md)（`FSL-1.1-ALv2`），
属于**源码可用**（source-available）软件；每个版本发布两年后转为
Apache-2.0。

在 FSL 期间，Cocurdex 是源码可用软件，而非 OSI 认可的开源软件。

你可以使用、修改和自行托管 Cocurdex，包括在公司内部使用。但不得将
Cocurdex 作为竞争性产品或托管服务对外提供。Cocurdex 的名称和商标归
softmeta LLC 所有。

完整条款见 [LICENSE.md](LICENSE.md)；如需提交改动请阅读
[CONTRIBUTING.md](CONTRIBUTING.md)。

安全问题必须按照 [SECURITY.md](SECURITY.md) 的流程报告。常规支持方式见
[SUPPORT.md](SUPPORT.md)，Cocurdex 名称和商标的使用受
[TRADEMARKS.md](TRADEMARKS.md) 约束。第三方组件和服务遵循其各自的条款，
详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 从源码运行

需要 Node.js 24 和 pnpm。

```bash
pnpm install
pnpm --filter @cocurdex/desktop dev
```

安装并登录至少一个你已经在使用的智能体 CLI（`claude`、`codex`、
`opencode`、`grok` 等）。Cocurdex 负责驱动这些运行时，本身不提供模型服务。

桌面应用会启动一个本地守护进程，不需要 Cocurdex 账号。

## 产品数据

`cocurdex.sqlite` 是应用自有的笔记、事项、视图、标签、链接和全文索引的
唯一权威数据源。只有 Cocurdex 守护进程会打开这个数据库。

桌面端、CLI 和未来的集成都通过守护进程 API 访问数据。外部工具必须使用
`cocurdex` CLI，而不是直接读写私有的 SQLite schema。Markdown 仅作为
明确的导入/导出格式，永远不会成为第二个可写存储。

## 仓库结构

| 路径 | 作用 |
|------|------|
| `apps/desktop` | Electron 桌面应用 |
| `apps/cli` | `cocurdex` CLI |
| `packages/daemon` | 本地守护进程（持有 SQLite 和智能体运行时） |
| `packages/rpc` | 桌面端/CLI ↔ 守护进程的契约（内部接口，暂不承诺兼容性） |
| `apps/console` | 团队控制台（早期） |
| `apps/api` | 团队 HTTP API（早期；自托管后续推出） |

桌面端不依赖 `apps/api` 即可运行。团队同步和自托管控制面在规划中，
将采用同样的源码可用条款。

面向用户的文档见 [cocurdex.com/docs](https://cocurdex.com/docs/)（站点源码
位于私有仓库 `cocurdex-sites`）。工程 ADR 在 `docs/adr/`。
