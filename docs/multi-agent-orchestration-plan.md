# 多 Agent 编排实施方案：Agent 工具桥、跨 Session 消息、Agent Team、Script Run

本文是给实施 Agent 的交接方案。目标是在 Cocurdex 中实现与 Claude Code 的
[cross-session messaging](https://code.claude.com/docs/en/cross-session-messaging)、
[agent teams](https://code.claude.com/docs/en/agent-teams)、
[dynamic workflows](https://code.claude.com/docs/en/workflows) 对等的能力，
并保持 [AGENTS.md](../AGENTS.md) 的架构约束：产品能力放在 daemon，经 `@cocurdex/rpc` 暴露，客户端只做 UI。

## 结论与顺序

四个阶段严格按顺序做，后一阶段依赖前一阶段的契约：

| 阶段 | 交付物 | 依赖 | 量级 |
| --- | --- | --- | --- |
| 0 | Agent 工具桥：daemon 向每个 agent session 注入一组 Cocurdex 自有 MCP 工具 | 无 | 最大，唯一前置 |
| 1 | 跨 session 消息：`messaging_list_agents` / `messaging_send_message` | 0 | 小 |
| 2 | Agent team：lead 拉起 teammate、共享任务列表、空闲通知、级联停止 | 0、1 | 中 |
| 3 | Script run：模型写 JS 脚本，daemon 后台以 `agent()` / `parallel()` / `pipeline()` 编排子 agent | 0 | 中偏大 |

每个阶段独立可合并、独立可验证。阶段 3 与现有 `packages/daemon/src/workflow` 引擎并列，不改造它；该引擎的处置见下一节。

## 现有 workflow 引擎的评估与冻结决定

评估日期 2026-09-16，结论：**引擎质量可以，产品闭环没有；冻结，不删除，阶段 3 落地后再决定去留。**

| 维度 | 现状 |
| --- | --- |
| 规模 | 源码约 5700 行，测试约 1600 行，50 个文件，跨 shared / daemon / db / desktop / cli |
| 历史 | 2026-08-29 到 2026-09-13 之间 6 次提交，之后未再演进 |
| 桌面入口 | Electron 只转发 5 个定义编辑接口；桌面能画图、存定义，但不能创建、启动、观察运行 |
| 能运行的地方 | 只有 `cocurdex workflow tui` |
| 可运行的定义 | 只有内置 `plan_execute_review`；角色固定三个，产物 schema 为封闭集合，一次只有一个当前步骤 |
| e2e | 无 |
| 恢复 | 租约认领与续约已做；daemon 重启后遇到未落盘的 provider 操作直接抛错，ADR 0002 承诺的续跑未落地 |

做得好的部分：状态机与定义校验是纯函数且测试充分；outbox 加租约、冻结定义与绑定、typed artifact 的设计有 ADR 依据；与 agent role、权限 profile 的绑定已打通。

它独有而阶段 1 到 3 刻意不提供的能力只有两项：阶段之间的人工审批 gate，以及崩溃后续跑。前者对 plan → approve → implement 有价值，后者尚未做完。

已执行的冻结动作：

- 桌面 Settings 侧栏移除 Workflows 入口（`apps/desktop/src/features/settings/settings-sections.ts`）。面板代码、`SettingsSectionId` 中的 `"workflows"`、Electron 转发与 daemon RPC 全部保留，重新加回一行即可恢复。
- 不再按 `docs/workflow-visual-orchestration.md` 扩展画布、节点类型或产物 schema。

冻结期间允许的改动：

- 补一条 e2e：用 `llm-stub` 跑通 `plan_execute_review`，覆盖 gate 审批与一次 `changes_requested` 回退。这是这 5700 行的最低保护，也是将来删除时的安全网。
- 为保持仓库可编译所做的被动适配。

阶段 3 完成后的决策规则：若 script run 增加一个 `gate(message)` 原语即可覆盖审批需求，则把 ADR 0002 标记为 superseded，整体删除 workflow 引擎及其 CLI TUI；若实践中冻结定义与续跑是刚需，再回头补完恢复并恢复桌面入口。

## 实施进度

| 阶段 | 状态 | 说明 |
| --- | --- | --- |
| 0 | 已实现（分支 `feat/agent-tool-bridge`） | 注册表、每 session token、daemon 内置 HTTP MCP 端点 `/mcp`；Claude、ACP（声明 HTTP MCP 的 agent，含 Grok Build）、Codex 走 HTTP，Pi 走进程内 `customTools` |
| 1 | 已实现（同一分支） | `messaging_list_agents` / `messaging_send_message`、`session.listPeers` / `session.sendPeerMessage` / `session.setPeerInbound`、`origin` 字段、桌面来源标签、CLI 命令、`peer.message` 事件 |
| 2 | 已实现（同一分支） | `team.get` / `team.spawn` / `team.stopMember` / `team.stop`、`team` 工具组（spawn、task 三件套、`team_stop` / `team_stop_member`）、`teams` / `team_members` 表、`issues.assignee_session_id`、`sessionKind: "teammate"`、桌面 lead 会话内的 Team 面板、CLI `cocurdex team ...`、`team.changed` 事件 |
| 3 | 未开始 | |

阶段 0 的 adapter 覆盖：

| adapter | 结果 | 方式与依据 |
| --- | --- | --- |
| claude-agent | 已注入 | `query()` 的 `mcpServers`：`{ type: "http", url, headers: { Authorization } }`，与用户自己的 MCP 配置并存 |
| ACP agent | 按能力注入 | 仅当 `initialize` 响应的 `agentCapabilities.mcpCapabilities.http === true` 时，在 `session/new`、`session/load`、`session/resume` 传 `McpServerHttp`（headers 为 `HttpHeader[]`）。ACP 规范只保证 stdio，未声明 HTTP 的 agent 不注入。Grok Build 声明了 `http(true)`（`grok-build/crates/codegen/xai-grok-shell/src/agent/mvp_agent/acp_agent.rs`） |
| codex | 已注入 | `thread/start` / `thread/resume` 的 `config.mcp_servers.cocurdex = { url, http_headers }`，对应 `McpServerTransportConfig::StreamableHttp`（`codex-rs/config/src/mcp_types.rs`）。该覆盖经 `config_manager.load_with_overrides` 生成 thread 自己的 `Config`，`Session::new` 为每个 session 新建 `McpRuntime`，header 不会在 thread 间串用 |
| pi | 已注入 | `createAgentSession({ customTools })`，工具在 daemon 进程内由 `AgentToolInvoker` 执行，无网络、无 token 传输。参数直接用 JSON Schema，Pi 的 `validateToolArguments` 对非 TypeBox schema 走 JSON Schema 校验分支（`pi-mono/packages/ai/src/utils/validation.ts`） |
| opencode | 未注入，排除出 agent team | MCP 配置是 instance 级（`MCP.add` 写 `InstanceState`），所有 session 共享。可行路线：每个 cocurdex session 通过 `POST /mcp` 注册一个 `cocurdex-<sessionId>` 的 remote server（headers 带该 session 的 token），再用 `session.prompt` 的 `tools` 映射只允许本 session 那一个；需实测 `tools` 是否接受通配符 |

核对日期 2026-09-16，对应 codex `8f38d5a877`、pi-mono `6671c6047`、opencode `e03db9bc6`、grok-build `48271133`。

与原方案的偏差：

- 传输是 daemon 内置的 Streamable HTTP MCP 端点，而不是每个 session 一个 stdio 子进程。进程数与活跃 session 数无关；身份仍由 daemon 签发的每 session token 决定，token 只出现在该 session 的 MCP 配置里。
- 端点与 WebSocket 共用一个只监听 `127.0.0.1` 的 HTTP server（`wire.ts`），端口为 `COCURDEX_DAEMON_WS_PORT` 或随机端口，地址写入 daemon 元数据的 `agentToolsUrl`。每个请求新建无状态 `StreamableHTTPServerTransport`（`sessionIdGenerator: undefined`），缺少 bearer token 返回 401。
- 没有 `agentTool.catalog` / `agentTool.call` RPC。HTTP 端点与 Pi 的进程内调用都直接调用 `AgentToolBridge`，不经过 daemon socket。
- 工具可见性只取决于 `sessionKind`，不取决于是否已有 team。MCP 客户端通常只在启动时列一次工具，Pi 的 `customTools` 也在创建时固定，依赖运行时状态的可见性会让 lead 永远看不到后来才可用的工具。lead 可在 spawn 之前 `team_task_create`，此时自动建 team；无 team 时 `team_task_list` 返回空，`team_stop` 返回 `team_not_found`。
- `SessionRecord.agentToolGroups` 字段尚未添加。
- OpenCode 不参加 agent team（`supportsAgentTeam`）：OpenCode 会话不能当 lead，也不能被拉起为 teammate；`team_list_roles` 与 Settings > Teams 不列出 OpenCode 角色；保存或拉起含 OpenCode 角色的模板返回 `unsupported_agent`。

阶段 2 与原方案的偏差：

- 没有新建 `team-state.ts`，`transitionTeamMember` 与 `canSpawnTeammate` 放在 `packages/shared/src/team.ts`。
- `isolateWorktree` 直接走 `service.createWorktree`，没有经过 `decideWorkspaceIsolation`；该函数面向自动策略，显式请求隔离时无需再判定。
- teammate 完成回合的通知复用 `PeerMessagingService.send`，通过可替换的 envelope 渲染函数换前缀，不复制投递逻辑。
- `session.stop` 命中 lead 时同样级联停止整个 team；这意味着用户在 lead 上点"停止"会终止所有 teammate。
- 桌面 Team 面板放在 lead 的聊天视图内（`features/sessions/team`），teammate 会话本身通过 `parentSessionId` 自然出现在会话树里，没有另建侧栏。
- 桌面通过 `data.changed { areas: ["agent"] }` 刷新面板；`team.changed` 事件目前只在 Electron 主进程记录日志，未转发给渲染进程。
- 新增团队模板：`TeamTemplateRecord` 存在 `app_settings` 的 `teamTemplates` 键（JSON），不建新表；RPC `teamTemplate.list/save/delete`、`team.spawnTemplate`；工具 `team_list_roles`、`team_list_templates`、`team_spawn_template`；桌面 Settings > Teams 用已保存的角色为每个成员选配置；CLI `cocurdex team roles|templates|spawn-template`。
- 跨 session 消息有往返上限：同一对 session 在没有用户输入的情况下累计投递 `PEER_EXCHANGE_LIMIT`（12）条后，`send` 返回 `loop_limit` 且不投递；任一方收到无 `origin` 的消息时清零。计数只在 daemon 内存中，重启即清零。teammate 回合结束的自动汇报同样计入，超限时该汇报不投递，Team 面板仍显示成员状态。
- 任务依赖与审核：依赖和审核证据存在新表 `team_tasks`（`team_id`、`issue_id`、`blocked_by_json`、`evidence`），issue 数据模型不变。`team_task_create` 接受 `blockedBy`（只能引用本 team 已有任务，因此不会成环）；`team_task_list` 返回 `blockedBy`、`blocked`、`evidence`。`checkTeamTaskUpdate`（`packages/shared/src/team.ts`）规定：前置任务未全部 done 时不能认领或进入 doing（`TASK_BLOCKED`）；进入 review 必须附 evidence（`EVIDENCE_REQUIRED`）；只有 review 状态能进入 done（`REVIEW_REQUIRED`），且负责人不能批准自己的任务（`SELF_APPROVAL`）。前置任务完成时不主动通知，被阻塞的成员通过 `team_task_list` 查看；桌面 issue 看板暂不显示依赖。
- e2e 只覆盖 RPC 校验路径：`team.spawn` 会真正启动 teammate 的一轮对话，`llm-stub` 无法驱动 agent session，成功路径由 `team-module.test.ts` 的内存桩覆盖。

## 现状事实（实施前请自行核对）

| 事实 | 位置 |
| --- | --- |
| daemon 只读取用户配置的 MCP server 状态，从不向 agent 注入自有工具 | `packages/daemon/src/mcp-config.ts`、各 adapter 中的 `mcpServers` 只是状态投影 |
| `@modelcontextprotocol/sdk` 已是 `@cocurdex/agent-adapters` 依赖 | `packages/agent-adapters/package.json` |
| Claude adapter 通过 `@anthropic-ai/claude-agent-sdk` 的 `query()` 启动，可传 `mcpServers` 选项 | `packages/agent-adapters/src/claude-cli/claude-cli-adapter.ts` |
| Codex adapter 以 `spawn("codex", ["app-server"])` 启动，再 `thread/start` | `packages/agent-adapters/src/codex/codex-app-server-client.ts` |
| Grok Build 已有 MCP 相关文件，OpenCode 以本地 server 启动，Pi 通过 `pi-mcp-adapter` 加载用户 MCP | `packages/agent-adapters/src/{grok-build,opencode,pi-sdk}` |
| `session.send` 已支持三种投递：`start-new-run`、`steer-active-run`、`queue-after-run` | `packages/daemon/src/service.ts` `acceptSessionMessage` |
| `SessionRecord` 已有 `sessionKind: "main" \| "subagent"`、`parentSessionId`、`parentToolCallId` | `packages/shared/src/contracts.ts` |
| provider 自带的子 agent 已被投影为子 session | `packages/shared/src/subagent-session.ts`、`packages/agent-adapters/src/*/…-subagent-*.ts` |
| worktree 隔离决策已有纯函数 | `packages/shared/src/orchestration.ts` `decideWorkspaceIsolation` |
| issue tracker 已有 view、column、issue 的 RPC；issue 没有 assignee 和依赖字段 | `packages/shared/src/issues.ts` |
| daemon 事件总线：`daemon.subscribe` + `CocurdexDaemonEvent` | `packages/shared/src/data-events.ts` |
| 现有 workflow 引擎：冻结定义、单当前步骤、固定三角色、outbox 租约、gate | `docs/adr/0002-daemon-owned-versioned-workflows.md`、`docs/workflow-visual-orchestration.md` |
| DB 使用 `node:sqlite`，`CURRENT_SCHEMA_VERSION` 变更会触发重建 | `packages/db/src/migrations.ts` |
| e2e 用真实 daemon + `llm-stub` 跑，不接真实 provider | `tests/e2e/helpers/llm-stub.ts` |

---

## 阶段 0：Agent 工具桥

### 目标

每个由 daemon 启动的 agent session 都能调用一组 Cocurdex 工具；daemon 能确定调用方是哪个 session，不能被伪造。

### 设计

```
agent 进程 ──MCP Streamable HTTP（Authorization: Bearer <session token>）──▶ daemon /mcp ──▶ AgentToolBridge
Pi（daemon 进程内）──customTools.execute──▶ AgentToolInvoker（闭包绑定 token）──▶ AgentToolBridge
```

- 身份：`ensureSessionRuntime` 为 session 签发 token（`AgentToolBridge.bind`），同时得到 `AgentToolsBinding { token, url }` 与进程内 `AgentToolInvoker`，都放进 `CreateAgentSessionPayload`。请求体不接受调用方自报的 sessionId。runtime 释放时吊销 token。
- 各 adapter 只负责把 binding 翻译成自己的 MCP 配置，或像 Pi 一样把 invoker 注册成进程内工具。所有写入都是追加，不覆盖用户自己的 MCP 配置。

### 契约

工具桥是长期扩展点，工具按工具组组织，桥本身不知道任何具体工具，只负责鉴权、注册与转发。

`packages/shared/src/agent-tools.ts`：`AgentToolGroupId`、`AgentToolDescriptor`、`AgentToolCallerContext`、`AgentToolCatalog`、`AgentToolsBinding { token, url }`、`agentToolFullName`、`agentToolAuthorization` / `agentToolTokenFromAuthorization`。`packages/agent-core/src/agent-types.ts`：`AgentToolInvoker { catalog(), call(name, input) }`。

工具名对 agent 暴露为 `<group>_<name>`，避免与用户自己配置的 MCP server 撞名。

daemon 侧注册接口（`packages/daemon/src/agent-tools/tool-registry.ts`）：`AgentToolHandler { descriptor, isAvailable(caller), execute(caller, input) }` 与 `AgentToolRegistry { register, catalog, call }`。

- 每个工具组是 `packages/daemon/src/agent-tools/groups/<group>.ts`，依赖通过参数注入；新增一个组不改工具桥、不改 adapter。
- `isAvailable` 只能依赖在 session 生命周期内不变的属性（目前是 `sessionKind`）。
- 输入校验在 `execute` 之前统一做一次。
- 需要给 UI 或 CLI 用的能力另行提供具名 RPC（例如 `session.sendPeerMessage`、`team.spawn`），工具 handler 复用同一 service 方法。

### 文件

- `packages/daemon/src/agent-tools/agent-tool-bridge.ts`：签发与吊销 token、解析 caller、`bind` 返回 binding 与 invoker
- `packages/daemon/src/agent-tools/http-server.ts`：`/mcp` 请求处理，每请求一个无状态 MCP server
- `packages/daemon/src/agent-tools/token-registry.ts`：token 与 sessionId 双向映射，进程内，daemon 重启即失效
- `packages/daemon/src/wire.ts`：HTTP server，同时承载 WebSocket 与 `/mcp`
- `packages/agent-adapters/src/shared/agent-tools-mcp.ts`：Claude、ACP、Codex 的 HTTP MCP 配置
- `packages/agent-adapters/src/pi-sdk/pi-agent-tools.ts`：Pi 的 `customTools`

### 验收

- 单元：未知或已吊销 token 返回 `UNAUTHORIZED_AGENT_TOOL`；重复绑定使旧 token 失效；两个带不同 token 的 MCP 客户端并发 `tools/list` 各自得到自己的 caller；无 bearer token 返回 401；ACP 未声明 HTTP 时不注入。
- e2e：真实 daemon 元数据发布 `agentToolsUrl`；匿名请求 401；错误 token 的 `tools/list` 报 `not valid`。

---

## 阶段 1：跨 session 消息

### 目标

任意 session 内的 agent 可以列出同一 daemon 下的其他 session，并向其中一个发送文本消息。消息以带来源的用户消息进入目标 session，目标 session 空闲则立即开始一轮，忙碌则排队到本轮之后。

### 契约

`packages/shared/src/contracts.ts`：

```ts
export interface MessageOrigin {
  kind: "peer";
  sessionId: string;
  sessionTitle: string;
}

export interface MessageRecord {
  // 现有字段不变
  origin?: MessageOrigin | null;
}

export type PeerInboundPolicy = "deliver" | "refuse";

export interface SessionRecord {
  // 现有字段不变
  peerInbound?: PeerInboundPolicy;
}
```

`packages/shared/src/peer-messaging.ts`（新增，纯函数，TDD）：

```ts
export function choosePeerDelivery(target: {
  status: SessionStatus;
  hasActiveTurn: boolean;
}): "start-new-run" | "queue-after-run";

export function renderPeerEnvelope(origin: MessageOrigin, content: string): string;
```

`renderPeerEnvelope` 输出形如：

```
[Message from session "<title>" (<id>)]
<content>
```

只用 `start-new-run` 与 `queue-after-run`。不要用 `steer-active-run`：steer 会改变目标 agent 当前回合的语义，跨 session 消息不应有这种权力。

RPC：

| 方法 | 参数 | 返回 |
| --- | --- | --- |
| `session.listPeers` | `{ sessionId }` | `Array<{ sessionId, title, agentType, status, workspaceId }>`，排除自身、已归档、`sessionKind === "subagent"` |
| `session.setPeerInbound` | `{ sessionId, policy }` | `SessionRecord` |
| `session.sendPeerMessage` | `{ fromSessionId, toSessionId, content }` | `{ messageId, delivery: "start-new-run" \| "queue-after-run" \| "refused" }` |

`messaging` 工具组（`groups/messaging.ts`）：

| 工具 | 输入 | 调用 |
| --- | --- | --- |
| `messaging_list_agents` | 无 | `session.listPeers`，`sessionId` 取自 caller |
| `messaging_send_message` | `{ to, message }` | `session.sendPeerMessage`，`fromSessionId` 取自 caller |

事件：在 `CocurdexDaemonEvent` 增加

```ts
export interface PeerMessageEvent {
  type: "peer.message";
  fromSessionId: string;
  toSessionId: string;
  messageId: string;
  delivery: "start-new-run" | "queue-after-run" | "refused";
}
```

### daemon 实现

- `packages/daemon/src/peer-messaging.ts`：`deliverPeerMessage(from, to, content)`。步骤：校验目标存在且未归档；读 `peerInbound`，`refuse` 直接返回；`choosePeerDelivery` 选投递模式；构造 `MessageRecord`（`role: "user"`，`origin` 填 from，`content` 为 envelope）；调用现有 `sendSessionMessage`；发出 `peer.message` 事件。
- 复用 `service.sessionCommands.run(toSessionId, …)` 串行化，避免与用户输入竞争。
- `messaging` 组的两个工具调用同一个 `deliverPeerMessage` 与列表函数，不复制逻辑。

### DB

`messages` 表加 `origin_json TEXT NULL`；`sessions` 表加 `peer_inbound TEXT NOT NULL DEFAULT 'deliver'`。按 `packages/db/src/migrations.ts` 现有做法处理（当前策略是版本不同即重建，新增列走 `hasColumn` 追加）。

### 客户端

- 桌面 `features/chat`：`origin` 非空的用户消息显示来源徽标（发送方标题，可点击跳转到该 session）。复用现有消息壳，不新建组件。
- 桌面 session 设置：`peerInbound` 开关，用 `SettingsSelect`。
- CLI：`cocurdex session peers`、`cocurdex session send --from <id> --to <id> <text>`。

### 验收

- 单元：`choosePeerDelivery` 四种组合；`renderPeerEnvelope` 快照。
- e2e：两个 session，A 通过 stub 触发 `messaging_send_message` 给 B；断言 B 收到 `origin.sessionId === A`，且 B 忙碌时进入 queued 列表、空闲时立刻开始回合；B 设为 `refuse` 后返回 `refused` 且 B 无新消息。

---

## 阶段 2：Agent team

### 目标

一个 main session 作为 lead，可以拉起若干 teammate session（可跨 provider），共享一个任务列表，teammate 完成回合后自动把最终回复投递给 lead，lead 停止或归档时级联停止 teammate。

### 明确不做

- 嵌套 team：`team_spawn_teammate` 对 teammate 不可用。
- tmux / 分屏：桌面用面板，CLI 用现有 session TUI 打开某个 teammate。
- daemon 重启后恢复 team 运行中的回合：team 记录保留，成员回合按现有 session 恢复语义处理，不额外承诺。

### 契约

`packages/shared/src/team.ts`（新增）：

```ts
export type TeamStatus = "active" | "stopped";
export type TeamMemberStatus = "spawning" | "running" | "idle" | "error" | "stopped";

export interface TeamRecord {
  id: string;
  leadSessionId: string;
  workspaceId: string;
  issueViewId: string;
  status: TeamStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TeamMemberRecord {
  teamId: string;
  sessionId: string;
  name: string;
  agentRoleId: string | null;
  status: TeamMemberStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SpawnTeammatePayload {
  name: string;
  prompt: string;
  agentRoleId?: string | null;
  agentType?: AgentId;
  isolateWorktree?: boolean;
}

export const TEAM_MAX_MEMBERS = 8;
export const TEAM_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
```

`SessionRecord.sessionKind` 扩展为 `"main" | "subagent" | "teammate"`。teammate 的 `parentSessionId` 指向 lead，`parentToolCallId` 为 null。

纯函数（TDD）：`packages/shared/src/team-state.ts`

```ts
export function transitionTeamMember(
  member: TeamMemberRecord,
  event: { type: "turn.started" } | { type: "turn.completed" } | { type: "turn.failed" } | { type: "stopped" },
  now: string,
): TeamMemberRecord;

export function canSpawnTeammate(team: TeamRecord, members: TeamMemberRecord[], payload: SpawnTeammatePayload):
  | { ok: true }
  | { ok: false; reason: "team_stopped" | "member_limit" | "duplicate_name" | "invalid_name" };
```

RPC：

| 方法 | 参数 | 返回 |
| --- | --- | --- |
| `team.get` | `{ leadSessionId }` | `{ team, members } \| null` |
| `team.spawn` | `{ leadSessionId } & SpawnTeammatePayload` | `TeamMemberRecord` |
| `team.stopMember` | `{ teamId, sessionId }` | `TeamMemberRecord` |
| `team.stop` | `{ teamId }` | `TeamRecord` |

`team` 工具组（`groups/team.ts`）：

| 工具 | 输入 | 可用性 | 调用 |
| --- | --- | --- | --- |
| `team_spawn_teammate` | `SpawnTeammatePayload` | 仅 `sessionKind === "main"` | `team.spawn` |
| `team_task_create` | `{ title, description? }` | lead 与 teammate | `issue.create`，view 取 caller 所在 team |
| `team_task_list` | 无 | lead 与 teammate | `issue.loadView` |
| `team_task_update` | `{ issueId, status?: "backlog" \| "doing" \| "review" \| "done", assignee?: "me" \| null }` | lead 与 teammate | `issue.update` / `issue.move`，`"me"` 解析为 caller |

事件：`team.changed { teamId }`，客户端收到后重新拉 `team.get`。

### 任务列表复用 issue tracker

- `team.spawn` 首次调用时创建一个私有 issue view（标题 `team:<leadSessionId>`，`groupBy: "status"`，默认状态列），`issueViewId` 存进 `TeamRecord`。
- `IssueRecord` 增加 `assigneeSessionId: string | null`，`issues` 表加 `assignee_session_id TEXT NULL`。`taskUpdate` 的 `assignee: "me"` 由 token 解析成调用方 sessionId。
- 认领即 `assigneeSessionId` 非空且 `status === "doing"`。两次认领冲突用 `revision` 乐观锁，后到者收到 `TASK_CONFLICT`。
- 桌面 issues 面板对该 view 不做特殊处理，天然可见。

### daemon 实现

`packages/daemon/src/team/team-module.ts`：

- `spawn`：`canSpawnTeammate` 校验 → 决定 worktree（`isolateWorktree` 为真时用 `decideWorkspaceIsolation` + 现有 worktree 创建路径，落到 `SessionRecord.worktreePath`）→ 创建 `SessionRecord`（`sessionKind: "teammate"`，`agentRoleId` 若给定则用 role 的 agentType、model、permissionMode）→ 写 member → 用 `sendSessionMessage` 以 `start-new-run` 投递 spawn prompt。spawn prompt 前面加一段固定说明：你的名字、lead 的 session id、任务列表工具的用法、完成后回复会自动送达 lead。
- 事件订阅：在 daemon 内部监听 `turn.completed` / `turn.failed`，若 sessionId 是 teammate，则 `transitionTeamMember`，并调用阶段 1 的 `deliverPeerMessage(teammate → lead, 最终回复)`，envelope 前缀改为 `[Teammate "<name>" finished]` / `[Teammate "<name>" failed: <error>]`。
- 级联停止：`session.stop` / `session.archive` / `session.delete` 命中 lead 时，对所有 member 调用现有 `stopSession`，成员状态置 `stopped`，team 置 `stopped`。放在 `service.ts` 现有方法里加一处调用，不要复制停止逻辑。
- teammate 的 `messaging_list_agents` 结果只包含同 team 成员和 lead；`messaging_send_message` 目标限制同理。

### DB

新表 `teams`、`team_members`，字段与上面契约一一对应，`team_members` 主键 `(team_id, session_id)`，`name` 在 team 内唯一。放在 `packages/db/src/team/schema.ts`，仓储 `packages/db/src/team/sqlite-team-repository.ts`，接口 `team-repository.ts`，按 `packages/db/src/workflow` 的分层照抄。

### 客户端

- 桌面 `features/sessions/team/`：lead session 的侧栏面板，列出成员名、agent 类型、状态点、最近一条消息时间；点击打开该 teammate 的 session（复用 `features/agent/tool-call/subagent-session-detail.tsx` 的呈现方式）；每行一个停止按钮；面板顶部"停止全部"。
- 状态图标按 AGENTS.md 规则条件渲染，尺寸统一 `size-4`。
- CLI：`cocurdex team get --lead <id>`、`cocurdex team spawn --lead <id> --name <n> --prompt <p> [--role <roleId>] [--worktree]`、`cocurdex team stop --team <id>`。

### 验收

- 单元：`transitionTeamMember` 全部转移；`canSpawnTeammate` 四种拒绝原因。
- e2e：lead 通过 stub 触发 `team_spawn_teammate` 两次（不同 provider 各一，若 stub 支持）；断言两个 `sessionKind: "teammate"` session 出现、`parentSessionId` 正确；stub 让 teammate 完成回合后，lead 收到 `origin.sessionId === teammate` 的消息；lead 归档后所有 teammate 状态为 `stopped`；teammate 的 catalog 不含 `team_spawn_teammate`，强行调用返回 `TOOL_UNAVAILABLE`。
- e2e：`team_task_create` 后 `team_task_list` 可见；两个 teammate 同时 `team_task_update(assignee: "me")` 只有一个成功。

---

## 阶段 3：Script run（对应 dynamic workflow）

### 目标

一段模型生成、用户批准的 JavaScript 在 daemon 后台执行，脚本只能通过 `agent()`、`parallel()`、`pipeline()` 编排子 agent，不能访问文件系统、网络或模块加载。运行记录与每个子 agent 的 session 都持久化，可从桌面和 CLI 观察、取消。

### 与现有 workflow 引擎的关系

并列，不合并。现有引擎提供冻结定义、gate 审批和崩溃恢复；script run 明确不提供中途人工介入和恢复。桌面设置页的 Workflows 保持不变，script run 在 session 侧展示。

### 明确不做（首版）

- 中断恢复：daemon 重启时把 `running` 的 run 标记为 `interrupted`，用户重新运行。
- 与外部安全沙箱等价的隔离：`node:vm` 不是安全边界。脚本由模型生成并经用户批准，且 API 表面只有三个函数；若将来允许第三方脚本，升级到 `worker_threads` + 资源限制或 `isolated-vm`。
- 用量限制等待、prompt cache 错峰启动。

### 契约

`packages/shared/src/script-run.ts`（新增）：

```ts
export type ScriptRunStatus =
  | "draft"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";

export interface ScriptRunRecord {
  id: string;
  workspaceId: string;
  workspaceRootPath: string;
  requesterSessionId: string | null;
  name: string;
  prompt: string;
  script: string;
  status: ScriptRunStatus;
  resultJson: string | null;
  error: string | null;
  agentCount: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export type ScriptRunAgentStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface ScriptRunAgentRecord {
  id: string;
  runId: string;
  sessionId: string;
  label: string;
  status: ScriptRunAgentStatus;
  resultJson: string | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface ScriptAgentOptions {
  label?: string;
  agentRoleId?: string;
  model?: string;
  schema?: Record<string, unknown>;
}

export const SCRIPT_RUN_MAX_CONCURRENCY = 16;
export const SCRIPT_RUN_MAX_AGENTS = 1000;
export const SCRIPT_RUN_MAX_LIST_ITEMS = 4096;
```

脚本 API（与 Claude Code 保持同名同义，方便模型迁移经验）：

```ts
agent(prompt: string, options?: ScriptAgentOptions): Promise<unknown | null>
parallel<T>(tasks: Array<() => Promise<T>>): Promise<T[]>
pipeline<I, O>(items: I[], fn: (item: I) => Promise<O>): Promise<O[]>
log(...values: unknown[]): void
```

- `agent()` 返回 agent 最终回复文本；给了 `schema` 则解析回复中的 JSON 并做 schema 校验，失败一次重试（把校验错误追加进 prompt），仍失败返回 `null`。
- 被取消或不可恢复错误时 `agent()` 返回 `null`，脚本自行处理。
- `parallel` 与 `pipeline` 都受全局并发闸限制；列表超过 `SCRIPT_RUN_MAX_LIST_ITEMS` 直接抛错。
- 脚本顶层 `await` 可用；脚本 `return` 值经 `JSON.stringify` 存入 `resultJson`。

RPC：

| 方法 | 参数 | 返回 |
| --- | --- | --- |
| `scriptRun.create` | `{ workspaceId, workspaceRootPath, name, prompt, script, requesterSessionId? }` | `ScriptRunRecord`（`draft`） |
| `scriptRun.start` | `{ runId }` | `ScriptRunRecord` |
| `scriptRun.cancel` | `{ runId }` | `ScriptRunRecord` |
| `scriptRun.get` | `{ runId }` | `{ run, agents }` |
| `scriptRun.list` | `{ workspaceId? }` | `ScriptRunRecord[]` |

`script_run` 工具组（`groups/script-run.ts`）：

| 工具 | 输入 | 调用 |
| --- | --- | --- |
| `script_run_propose` | `{ name, script }` | `scriptRun.create`，workspace 与 `requesterSessionId` 取自 caller |

事件：`scriptRun.changed { runId }`。

### 脚本来源与批准

- 主路径：session 内的 agent 调用 `script_run_propose` 工具产生 `draft`；桌面在该 session 的聊天流里显示一张卡片（脚本预览、agent 数上限提示、"运行" / "取消"按钮），用户点"运行"才调用 `scriptRun.start`。
- 次路径：CLI `cocurdex script-run create --workspace <id> --name <n> --file <script.js>` 后 `cocurdex script-run start <runId>`。
- 系统提示中给 agent 的工具描述要说明三个函数的语义与限制，让模型直接写出可运行脚本。首版不做"daemon 代为调用 LLM 写脚本"。

### daemon 实现

`packages/daemon/src/script-run/`：

- `script-sandbox.ts`（纯逻辑，TDD）：`runScript(script, api, { signal })`。用 `node:vm` 的 `Script` + `createContext`，context 只放 `agent`、`parallel`、`pipeline`、`log`；脚本体包进 `(async () => { <script> })()`；静态拒绝包含 `import(`、`require(`、`process`、`globalThis` 的脚本，并在 context 里不暴露它们；`vm` 的 `timeout` 只约束同步段，异步整体超时由外层 `AbortSignal` 控制。
- `concurrency-gate.ts`：十行左右的信号量，上限 `min(SCRIPT_RUN_MAX_CONCURRENCY, os.availableParallelism())`。不引入新依赖。
- `script-agent-runner.ts`：`agent()` 的真实实现。创建 `SessionRecord`（`sessionKind: "subagent"`，`parentSessionId` 为 requester session 或 null，`title` 为 label），沿用 `daemon-workflow-agent-turn-runner.ts` 的方式调用 `runtime.sendSessionMessage` 并等待回复；写 `ScriptRunAgentRecord`；总数超过 `SCRIPT_RUN_MAX_AGENTS` 抛错终止整个 run。
- `script-run-module.ts`：RPC 实现与生命周期。`start` 后在后台执行，状态落库，完成或失败时发事件；`cancel` 触发 `AbortController`，对所有 `running` 的子 session 调 `cancelSessionTurn`。
- daemon 启动时把所有 `running` 置为 `interrupted`。

### DB

新表 `script_runs`、`script_run_agents`，字段对应契约。放在 `packages/db/src/script-run/`，结构照 `packages/db/src/workflow`。

### 客户端

- 桌面：requester session 聊天流内的提案卡片；`features/sessions/script-run/` 的运行面板：状态、已启动 / 完成 / 失败的 agent 计数、每个 agent 一行可点开其 session、取消按钮、完成后展示 `resultJson`。用 `Text` 与语义 token；列表用现有组件。
- CLI：`cocurdex script-run list|get|start|cancel|create`。

### 验收

- 单元（`script-sandbox.test.ts`，用假的 `agent` 实现）：顶层 `await` 可用；`parallel` 并发不超过闸值；`pipeline` 保序；含 `require(` 的脚本在启动前被拒；`AbortSignal` 触发后未开始的 `agent()` 直接返回 `null`；`schema` 校验失败重试一次后返回 `null`；`return` 值序列化。
- e2e：用 `llm-stub` 跑一个三阶段脚本（先列文件，再 `pipeline` 逐个审计，最后过滤），断言 `script_run_agents` 数量、每个都有对应 session、run 最终 `completed` 且 `resultJson` 是过滤后的数组；启动后立刻 `cancel`，断言 run 为 `cancelled` 且没有子 session 处于 `running`。

---

## 横向要求

- **翻译**：所有新增 `t("...")` 先跑 `pnpm --filter @cocurdex/desktop i18n:extract`，补齐 en-US 与 zh-CN，再跑 `i18n:types`。
- **检查**：按 AGENTS.md 顺序跑受影响包的 TypeScript 检查与 `biome check --write`；改动依赖结构时跑 `pnpm --filter @cocurdex/desktop lint:cycles`。
- **导入边界**：跨包只走 `@cocurdex/*` 公共入口；新目录都要有 `index.ts`。
- **不加注释**：意图用命名、类型、测试表达。
- **文件长度**：`service.ts` 已近 1900 行，阶段 1 与 2 对它的改动只允许"加一处调用"，逻辑放进新模块。
- **事件**：新增事件类型统一加入 `CocurdexDaemonEvent` 联合，客户端用现有 `daemon.subscribe` 消费。
- **安全**：工具桥必须只信 token；`messaging_send_message` 内容进入目标 session 前不做任何解释，仅包一层 envelope，让接收方模型知道这是来自另一个 agent 的文本而非用户指令。

## 风险与需要提前验证的点

| 风险 | 验证方式 | 若不成立 |
| --- | --- | --- |
| Codex app-server 不支持 per-thread MCP 配置 | 阅读 codex 当前版本 app-server 协议文档并实测 | 用进程级 `-c mcp_servers.…` 注入，一个 daemon 只起一个 app-server 时无差异 |
| 某个 adapter 无法追加 MCP 配置而不覆盖用户配置 | 每个 adapter 的单元测试 | 该 adapter 首版不注入 agent 工具 |
| `queue-after-run` 在目标 session 的队列语义与用户手动排队冲突 | 阅读 `acceptSessionMessage` 与 `resumeQueuedSession` | 为 peer 消息单独维护队列并在 `turn.completed` 后投递 |
| `node:vm` 中 `Promise` 与宿主不同 realm 导致 `instanceof` 问题 | sandbox 单元测试覆盖 `parallel` 返回值 | 在 context 里注入宿主 `Promise` |
| e2e 的 `llm-stub` 不支持工具调用回放 | 阅读 `tests/e2e/helpers/llm-stub.ts` | 先给 stub 增加"按脚本返回 tool_call"的能力，作为阶段 0 的一部分 |

## 交接检查单

实施 Agent 开始前：

1. 读 [AGENTS.md](../AGENTS.md)、[docs/agents/domain.md](agents/domain.md)、[ADR 0002](adr/0002-daemon-owned-versioned-workflows.md)。
2. 核对上文"现状事实"表，任何一条不成立先更新本文再动手。
3. 一个阶段一个分支、一个 PR；PR 描述里列出本文对应阶段的验收项及其结果。
4. 阶段 0 完成前不要开始阶段 1 到 3 的代码。
