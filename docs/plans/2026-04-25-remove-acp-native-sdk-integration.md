# 移除 ACP 协议，改用各 Agent 官方 SDK 直接集成

> 状态: 计划中 | 日期: 2026-04-25
> Phase 1 目标: Claude Code + Codex + OpenCode，最接近原生 CLI 的体验

---

## 1. 动机

### 1.1 为什么移除 ACP

- **ACP 已被合并**: 2025 年 8 月，IBM 的 ACP 协议并入 Google 的 A2A，不再作为独立标准维护。
- **中间层损耗**: ACP 作为协议翻译层，限制了各 agent 的独占功能（如 structured output、sub-agent、hooks 等）。
- **维护成本**: `acp-adapter.ts` 695 行，统一协议翻译逻辑复杂，每个新 agent 都需要适配协议。
- **官方不支持**: `@agentclientprotocol/sdk` / `@agentclientprotocol/claude-agent-acp` / `@zed-industries/codex-acp` 均为社区/第三方封装，非官方维护。

### 1.2 为什么用官方 SDK

每个目标 agent 都有官方 SDK，这些 SDK 本质就是 CLI 运行时的 programmatic 版本：

| Agent | 官方 SDK | 版本 (2026.04) |
|-------|----------|-----------------|
| Claude Code | `@anthropic-ai/claude-agent-sdk` | 0.2.119 |
| Codex | `@openai/codex-sdk` | 0.116.0 |
| OpenCode | `@opencode-ai/sdk` | 最新 |

优势：
1. **功能完全一致** — SDK 就是 CLI 运行时，支持 structured output、MCP、hooks 等全部功能
2. **无协议翻译损耗** — 直接消费结构化事件，无需通过 NDJSON RPC 二次编码/解码
3. **代码大幅简化** — 每个 adapter 约 50-100 行，删除 695 行通用 ACP adapter
4. **类型安全** — 三款 SDK 均提供完整 TypeScript 类型定义

---

## 2. 架构设计

### 2.1 现有架构

```
┌──────────────────────────────────────────────────┐
│  Electron Main Process (main.ts)                 │
│  - createAgentAdapter(agentId) → AgentAdapter    │
│  - createSessionRuntime(payload) → AgentSession   │
│  - emitAgentEvent(event) → IPC → Renderer         │
├──────────────────────────────────────────────────┤
│  packages/agent-adapters/                        │
│  ├── acp-adapter.ts (695行) ← 通用 ACP 子进程管理   │
│  ├── claude-code-adapter.ts ← ACP 配置             │
│  └── codex-adapter.ts ← ACP 配置                   │
├──────────────────────────────────────────────────┤
│  packages/agent-core/                            │
│  ├── agent-types.ts ← 接口定义                     │
│  ├── agent-registry.ts ← agent 描述               │
│  └── agent-events.ts ← 事件类型                    │
├──────────────────────────────────────────────────┤
│  packages/shared/                                │
│  └── contracts.ts ← 共享类型                      │
└──────────────────────────────────────────────────┘
```

### 2.2 目标架构

```
┌──────────────────────────────────────────────────┐
│  Electron Main Process (main.ts)    [微调]        │
│  + 'opencode' case                               │
├──────────────────────────────────────────────────┤
│  packages/agent-adapters/                        │
│  ├── claude-code-adapter.ts (～100行) ← SDK 封装   │
│  ├── codex-adapter.ts      (～100行) ← SDK 封装   │
│  ├── opencode-adapter.ts   (～100行) ← SDK 封装    │
│  └── index.ts                                   │
├──────────────────────────────────────────────────┤
│  packages/agent-core/          [不变]             │
├──────────────────────────────────────────────────┤
│  packages/shared/              [微调]             │
└──────────────────────────────────────────────────┘
```

### 2.3 接口层不变

以下接口保持不变，只需替换实现层：

```typescript
// packages/agent-core/src/agent-types.ts

interface AgentAdapter {
  getDescriptor(): AgentDescriptor
  createSession(
    payload: CreateAgentSessionPayload,
    onEvent: (event: AgentEvent) => void
  ): AgentSession
}

interface AgentSession {
  sendMessage(payload: SendAgentMessagePayload): Promise<MessageRecord>
  stop(): void
  dispose(): void
}

// 事件类型不变
type AgentEventType =
  | 'message.delta'
  | 'message.completed'
  | 'tool.started'
  | 'tool.finished'
  | 'state.changed'
  | 'error'
```

---

## 3. 详细设计

### 3.1 Claude Code Adapter

**依赖**: `@anthropic-ai/claude-agent-sdk`

**核心 API**:

```typescript
import { query, type Message } from "@anthropic-ai/claude-agent-sdk";
```

`query()` 参数：
- `prompt` — 用户消息和附件拼接
- `options.allowedTools` — 工具白名单
- `options.permissionMode` — `"default"` (read-only) 或 `"acceptEdits"` (native-write)
- `options.workdir` — `workspaceRootPath`
- `options.mcpServers` — MCP 配置（暂不暴露，由用户 agent 配置文件管理）
- `signal` — `AbortController.signal` 用于 `stop()`

**事件映射**:

| SDK 事件 | AgentEvent |
|----------|-----------|
| `{ type: "assistant", message: { content: [{ type: "text", text }] } }` (streaming) | `message.delta` (每收到 text delta 时 emit) |
| `{ type: "assistant", message: { content: [{ type: "tool_use" }] } }` | `tool.started` |
| 同上，tool call 完成时 | `tool.finished` |
| `{ type: "result" }` | `message.completed` + `state.changed: idle` |
| Error | `error` |

**Session 生命周期**:
- `sendMessage()`: 发起新的 `query()` 调用，保存 AbortController
- `stop()`: 调用 `AbortController.abort()`
- `dispose()`: 清理资源（无子进程需要清理，SDK 在进程内运行）
- SDK 内部管理 session 持久化，可通过 `sessionId` 恢复

**WriteMode 映射**:
- `read-only` → `permissionMode: "default"`
- `native-write` → `permissionMode: "acceptEdits"`

---

### 3.2 Codex Adapter

**依赖**: `@openai/codex-sdk`

**核心 API**:

```typescript
import { Codex } from "@openai/codex-sdk";
```

- `new Codex({ apiKey, baseUrl?, codexPathOverride?, env? })` — 初始化客户端
- `codex.startThread()` → `Thread` — 创建新会话
- `codex.resumeThread(threadId)` → `Thread` — 恢复已有会话
- `thread.runStreamed(prompt)` → `AsyncIterable<StreamEvent>` — 流式执行
- `thread.id` — 用于持久化和恢复

**事件映射**:

| SDK StreamEvent | AgentEvent |
|----------------|-----------|
| `{ event: "text_delta", text }` (通过 item events 解析) | `message.delta` |
| `{ event: "turn.completed", turn: { finalResponse } }` | `message.completed` |
| `{ event: "command_execution", phase: "start" }` | `tool.started` |
| `{ event: "command_execution", phase: "complete" }` | `tool.finished` |
| `{ event: "error" }` | `error` |
| `{ event: "turn.failed" }` | `error` |

**注意**: Codex SDK 的事件流结构需要通过 `runStreamed()` 的 async iterator 逐条消费。事件类型参考 SDK 文档。

**Session 生命周期**:
- `sendMessage()`: 调用 `thread.runStreamed()`，启动异步消费循环
- `stop()`: 取消当前 turn（SDK 内部 AbortController）
- `dispose()`: 清理 thread 引用
- 保存 `threadId` 到 session 元数据，用于恢复

---

### 3.3 OpenCode Adapter

**依赖**: `@opencode-ai/sdk`

**核心 API**:

```typescript
import { createOpencode, type OpencodeClient } from "@opencode-ai/sdk";
```

- `createOpencode({ hostname, port, config })` → `{ client: OpencodeClient }` — 启动 server + 创建 client
- `client.sessions.create({ ... })` — 创建 session
- `client.sessions.sendMessage({ sessionId, content })` — 发送消息
- `client.sessions.onEvent(sessionId, callback)` — 监听事件流

**备选方案**: `createOpencodeClient({ baseUrl })` — 连接到已运行的 `opencode serve` 实例。适用于多个 session 共享一个 server 进程。

**推荐**: 使用 `createOpencode()` 在 adapter 内自管理 server 生命周期。

**事件映射**:

| SDK 事件 | AgentEvent |
|----------|-----------|
| `message.delta` (SDK 自己的事件名) | `message.delta` (透传) |
| `message.completed` | `message.completed` |
| `tool.started` | `tool.started` |
| `tool.finished` | `tool.finished` |
| session error | `error` |

**WriteMode 映射**:
- `read-only` → 配置 `dangerouslySkipPermissions: false`（默认）
- `native-write` → 配置 `dangerouslySkipPermissions: true`

**Session 生命周期**:
- `sendMessage()`: 调用 `client.sessions.sendMessage()` 并监听事件
- `stop()`: 调用 `client.sessions.abort()` 或等效 API
- `dispose()`: 关闭 client 连接 + 停止 server（如用 `createOpencode`）

---

## 4. 文件变更清单

### 4.1 删除

| 文件 | 原因 |
|------|------|
| `packages/agent-adapters/src/acp-adapter.ts` | ACP 协议全部移除 |
| `packages/agent-adapters/src/acp-adapter.test.ts` | 同上 |

### 4.2 重写

| 文件 | 说明 |
|------|------|
| `packages/agent-adapters/src/claude-code-adapter.ts` | 用 `@anthropic-ai/claude-agent-sdk` 重写，约 80-120 行 |
| `packages/agent-adapters/src/claude-code-adapter.test.ts` | 更新测试以匹配新实现 |
| `packages/agent-adapters/src/codex-adapter.ts` | 用 `@openai/codex-sdk` 重写，约 80-120 行 |

### 4.3 新建

| 文件 | 说明 |
|------|------|
| `packages/agent-adapters/src/opencode-adapter.ts` | 新建，约 80-120 行 |

### 4.4 修改

| 文件 | 变更 |
|------|------|
| `packages/agent-adapters/package.json` | 删除 3 个 ACP 依赖，新增 3 个 SDK 依赖 |
| `packages/agent-adapters/src/index.ts` | 删除 ACP 导出，新增 opencode 导出 |
| `packages/agent-core/src/agent-registry.ts` | opencode: `availability: "available"`，capabilities 加入 `native-write` |
| `packages/shared/src/contracts.ts` | 确认 `AgentEvent` 类型足够（不排除微调） |
| `apps/desktop/electron/main.ts` | `createAgentAdapter()` 新增 `"opencode"` case |
| `apps/desktop/package.json` | 移除 `@agentclientprotocol/claude-agent-acp` 和 `@zed-industries/codex-acp` |

---

## 5. SDK 事件到 AgentEvent 的映射参考

### 5.1 流式文本映射

三个 SDK 都提供流式文本输出，通过 async iterable / event listener 模式消费。每个 text chunk 都 emit 一个 `message.delta` 事件。

### 5.2 Tool call 映射

```
SDK 发出 tool_use 开始 → emit tool.started (status: "in_progress")
SDK 发出 tool_use 完成 → emit tool.finished (status: "completed" | "failed")
```

AgentToolCallRecord 字段：
- `id`: SDK 提供的 tool call id（或生成 UUID）
- `sessionId`: 当前 session id
- `title`: tool name（如 "Read", "Bash", "Write"）
- `kind`: tool 类别（如 "read", "write", "exec"）
- `status`: "pending" → "in_progress" → "completed"/"failed"
- `rawInput`: tool 输入参数
- `rawOutput`: tool 输出结果
- `locations`: 涉及的文件路径（如 Edit/Write 有文件路径）
- `startedAt`: ISO 时间戳
- `updatedAt`: ISO 时间戳

### 5.3 Message completed

```
SDK 发出最终结果 → emit message.completed (包含完整 MessageRecord)
```

MessageRecord 字段：
- `id`: 生成 UUID
- `sessionId`: 当前 session id
- `role`: "assistant"
- `content`: 完整回复文本
- `attachments`: 空数组（或后续扩展）
- `createdAt`: ISO 时间戳

---

## 6. 注意事项 & 风险

### 6.1 Electron 打包

三款 SDK 可能依赖 Node.js native 模块或大型可选依赖。需要：
- 在 `electron-vite` 构建中正确 externalize native 依赖
- 测试打包后的 Electron app 能正常加载 SDK
- `@anthropic-ai/claude-agent-sdk` 内包含可选的 native binary，需要确认 Electron 下的兼容性

### 6.2 API Key 管理

- Claude Code: 从环境变量 `ANTHROPIC_API_KEY` 或用户已有的 `~/.claude.json` 认证
- Codex: 从环境变量 `CODEX_API_KEY` 或 `OPENAI_API_KEY` 或 `~/.codex/config.toml`
- OpenCode: 通过 SDK config 传递 API key 或依赖 `~/.opencode/config.json`

初期建议：依赖各 agent 自己的认证方式（环境变量/配置文件），不在 app 内管理 API key。

### 6.3 MCP 配置

三个 agent 都原生支持 MCP。初期不暴露 MCP 配置界面，让用户通过各 agent 自身的配置文件管理（如 `.mcp.json`、`~/.codex/config.toml`），后续可在 UI 层统一配置。

### 6.4 Session 持久化

- Claude SDK: session 自动持久化到 `~/.claude/sessions/`
- Codex SDK: thread 持久化到 `~/.codex/sessions/`
- OpenCode SDK: session 由 server 管理

adapter 需要保存 SDK 返回的 session/thread ID，用于后续恢复。

### 6.5 中断 & 资源清理

- `stop()`: 取消当前 agent 运行，但不销毁 session（用户可继续发消息）
- `dispose()`: 完全清理 — 关闭连接、清理监听器、停止子进程/服务器
- 需要确保 `dispose()` 在所有退出路径（正常/异常）都被调用

### 6.6 Pi (Cursor) 集成

Phase 2 处理。Cursor 目前：
- Cloud Agents REST API（官方，稳定）
- TypeScript SDK（Beta，包名未公开）
- `agent acp` CLI 子进程（ACP 协议，但仅用于 Cursor）

建议等 Cursor 官方 TypeScript SDK 稳定后再集成，届时按同样模式新增 `pi-adapter.ts`。

---

## 7. 执行步骤（待审批后执行）

1. 安装新 SDK 依赖到 `packages/agent-adapters`
2. 重写 `claude-code-adapter.ts` + 更新测试
3. 重写 `codex-adapter.ts`
4. 新建 `opencode-adapter.ts`
5. 删除 `acp-adapter.ts` + 测试
6. 更新 `index.ts` 导出
7. 更新 `agent-registry.ts`（opencode status）
8. 更新 `electron/main.ts`（新增 opencode case）
9. 移除 `apps/desktop/package.json` 中的 ACP 依赖
10. 移除 `packages/agent-adapters/package.json` 中的 ACP 依赖
11. 运行 `pnpm --filter @cocurdex/desktop exec tsc --noEmit`
12. 运行 `pnpm exec biome check --write apps/desktop/src`
13. 运行现有测试确认无回归

---

## 8. 参考链接

- Claude Agent SDK: https://docs.anthropic.com/en/docs/claude-code/sdk
- Claude Headless Mode: https://docs.anthropic.com/en/docs/claude-code/headless
- Codex SDK: https://developers.openai.com/codex/sdk
- Codex CLI Reference: https://developers.openai.com/codex/cli/reference
- OpenCode SDK: https://opencode.ai/docs/sdk
- OpenCode GitHub: https://github.com/anomalyco/opencode
