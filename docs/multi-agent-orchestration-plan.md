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
| 0 | 已实现（分支 `feat/agent-tool-bridge`） | 注册表、token 鉴权、stdio MCP 子命令、`agentTool.catalog` / `agentTool.call`；Claude、ACP（Grok Build）、Codex 三个 adapter 已注入 |
| 1 | 已实现（同一分支） | `messaging_list_agents` / `messaging_send_message`、`session.listPeers` / `session.sendPeerMessage` / `session.setPeerInbound`、`origin` 字段、桌面来源标签、CLI 命令、`peer.message` 事件 |
| 2 | 已实现（同一分支） | `team.get` / `team.spawn` / `team.stopMember` / `team.stop`、`team` 工具组四个工具、`teams` / `team_members` 表、`issues.assignee_session_id`、`sessionKind: "teammate"`、桌面 lead 会话内的 Team 面板、CLI `cocurdex team ...`、`team.changed` 事件 |
| 3 | 未开始 | |

阶段 0 的 adapter 覆盖与偏差：

| adapter | 结果 | 备注 |
| --- | --- | --- |
| claude-agent | 已注入 | 走 `query()` 的 `mcpServers` stdio 配置，与用户自己的 MCP 配置并存 |
| grok-build 及其他 ACP agent | 已注入 | `session/new` 与 `session/load` 的 `mcpServers` |
| codex | 已注入，待实测 | 通过 `thread/start` / `thread/resume` 的 `config.mcp_servers` 覆盖；app-server 是一个共享进程，需确认它对每个 thread 独立启动该 MCP server |
| opencode | 未注入 | OpenCode server 是 daemon 级共享进程，`OPENCODE_CONFIG_CONTENT` 是进程级配置，无法携带每个 session 的 token |
| pi | 未注入 | `pi-mcp-adapter` 只读文件配置，同样无法按 session 区分 |

opencode 与 pi 的可行路线：为共享进程签发进程级 token，并让工具桥在调用时要求 agent 自报 session id，再由 daemon 校验该 session 确实运行在该进程上。这会削弱"调用方不可伪造"的保证，留到有需求时再做。

与原方案的偏差：

- Claude 没有走 SDK 进程内 MCP，而是与其他 adapter 一样走 stdio 子进程，减少一条代码路径。
- 工具桥子进程通过 `COCURDEX_USER_DATA_PATH` 读取 daemon 元数据（socket 与 daemon token），只额外携带 `COCURDEX_AGENT_TOKEN`。
- `SessionRecord.agentToolGroups` 字段尚未添加；catalog 目前完全由各工具的 `isAvailable` 决定。

阶段 2 与原方案的偏差：

- 没有新建 `team-state.ts`，`transitionTeamMember` 与 `canSpawnTeammate` 放在 `packages/shared/src/team.ts`。
- `isolateWorktree` 直接走 `service.createWorktree`，没有经过 `decideWorkspaceIsolation`；该函数面向自动策略，显式请求隔离时无需再判定。
- teammate 完成回合的通知复用 `PeerMessagingService.send`，通过可替换的 envelope 渲染函数换前缀，不复制投递逻辑。
- `session.stop` 命中 lead 时同样级联停止整个 team；这意味着用户在 lead 上点"停止"会终止所有 teammate。
- 桌面 Team 面板放在 lead 的聊天视图内（`features/sessions/team`），teammate 会话本身通过 `parentSessionId` 自然出现在会话树里，没有另建侧栏。
- 桌面通过 `data.changed { areas: ["agent"] }` 刷新面板；`team.changed` 事件目前只在 Electron 主进程记录日志，未转发给渲染进程。
- e2e 只覆盖 RPC 校验路径：`team.spawn` 会真正启动 teammate 的一轮对话，`llm-stub` 无法驱动 agent session，成功路径由 `team-module.test.ts` 的内存桩覆盖。

## 现状事实（实施前请自行核对）

| 事实 | 位置 |
| --- | --- |
| daemon 只读取用户配置的 MCP server 状态，从不向 agent 注入自有工具 | `packages/daemon/src/mcp-config.ts`、各 adapter 中的 `mcpServers` 只是状态投影 |
| `@modelcontextprotocol/sdk` 已是 `@cocurdex/agent-adapters` 依赖 | `packages/agent-adapters/package.json` |
| Claude adapter 通过 `@anthropic-ai/claude-agent-sdk` 的 `query()` 启动，可传 `mcpServers` 选项 | `packages/agent-adapters/src/claude-cli/claude-cli-adapter.ts` |
| Codex adapter 以 `spawn("codex", ["app-server"])` 启动，再 `thread/start` | `packages/agent-adapters/src/codex/codex-app-server-client.ts` |
| Grok Build 已有 MCP 相关文件，OpenCode 以本地 server 启动，Pi 依赖 `pi-mcp-adapter` | `packages/agent-adapters/src/{grok-build,opencode,pi-sdk}` |
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
agent 进程 ──MCP stdio──▶ cocurdex agent-tools 子进程 ──daemon socket RPC──▶ daemon
                          (env: COCURDEX_DAEMON_SOCKET, COCURDEX_AGENT_TOKEN)
```

- 工具桥是一个 stdio MCP server 可执行入口，放在 `packages/daemon/src/agent-tools/`，通过 daemon 二进制的子命令启动（例如 `cocurdex-daemon agent-tools`）。不要新建 package。
- Claude adapter 走例外：`@anthropic-ai/claude-agent-sdk` 支持进程内 MCP server（`createSdkMcpServer`），直接在 adapter 内用同一套工具定义注册，省掉子进程。工具定义与 handler 必须与 stdio 版本共用同一份代码。
- 身份：daemon 在创建 session runtime 时为该 session 签发一次性 token，写入子进程环境变量。工具桥每次调用都带 token；daemon 侧新增 `agentTool.*` RPC，由 token 反查 `sessionId`，请求体里不接受调用方自报的 sessionId。
- 注入点：`packages/daemon/src/runtime.ts` `ensureSessionRuntime` 组装 `CreateAgentSessionPayload` 时增加 `agentTools: { socketPath, token }`；各 adapter 负责把它翻译成自己的 MCP 配置。

### 契约

工具桥是长期扩展点，后续会承载消息、team、script run 之外的能力（例如记忆、笔记、issue、工作区搜索）。因此工具按**工具组**组织，工具桥本身不知道任何具体工具，只负责鉴权、注册与转发。

`packages/shared/src/agent-tools.ts`（新增，经 `@cocurdex/shared` 导出）：

```ts
export interface AgentToolsBinding {
  socketPath: string;
  token: string;
}

export type AgentToolGroupId =
  | "messaging"
  | "team"
  | "script_run"
  | "memory"
  | "notes"
  | "issues";

export interface AgentToolDescriptor {
  group: AgentToolGroupId;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface AgentToolCallerContext {
  sessionId: string;
  sessionKind: SessionRecord["sessionKind"];
  workspaceId: string;
  teamId: string | null;
}

export interface AgentToolCatalog {
  caller: AgentToolCallerContext;
  tools: AgentToolDescriptor[];
}
```

工具名对 agent 暴露为 `<group>_<name>`（例如 `messaging_send_message`、`memory_recall`），避免与用户自己配置的 MCP server 撞名。

daemon 侧的注册接口（`packages/daemon/src/agent-tools/tool-registry.ts`）：

```ts
export interface AgentToolHandler<Input = unknown, Output = unknown> {
  descriptor: AgentToolDescriptor;
  isAvailable(caller: AgentToolCallerContext): boolean;
  execute(caller: AgentToolCallerContext, input: Input): Promise<Output>;
}

export class AgentToolRegistry {
  register(handler: AgentToolHandler): void;
  catalog(caller: AgentToolCallerContext): AgentToolCatalog;
  call(caller: AgentToolCallerContext, name: string, input: unknown): Promise<unknown>;
}
```

- 每个工具组是 daemon 里一个独立模块（`packages/daemon/src/agent-tools/groups/<group>.ts`），只依赖它需要的 service 能力，通过构造函数注入；新增一个组不改工具桥、不改 adapter。
- `isAvailable` 由各工具自己判断（例如 `team_spawn_teammate` 只对 `sessionKind === "main"` 可用），catalog 按调用方动态生成，agent 看到的就是它此刻能用的集合。
- 输入校验在 `execute` 之前用 `inputSchema` 做一次，所有工具统一，不在各组内重复。
- 阶段 0 交付注册表、鉴权、stdio 与进程内两种传输，以及一个空的 `messaging` 组骨架；具体工具由后续阶段填充。`memory`、`notes`、`issues` 等组现在只占枚举位，不实现。
- 工具组的启用可以按 session 由用户关闭：`SessionRecord` 预留 `agentToolGroups?: AgentToolGroupId[] | null`，为 null 表示全部启用。阶段 0 只加字段，不做 UI。

`packages/rpc/src/index.ts` 新增（请求都不带 sessionId，由 token 决定）：

| 方法 | 参数 | 返回 |
| --- | --- | --- |
| `agentTool.catalog` | `{ token }` | `AgentToolCatalog` |
| `agentTool.call` | `{ token, name, input }` | `unknown` |

只这两个 RPC。后续阶段新增工具时不再新增 `agentTool.*` 方法，都走 `agentTool.call`；需要给 UI 或 CLI 用的能力另行提供具名 RPC（例如 `session.sendPeerMessage`、`team.spawn`），工具 handler 内部复用同一 service 方法，保证 CLI 与 agent 走同一份逻辑。

### 各 adapter 注入方式

| adapter | 方式 | 需先验证 |
| --- | --- | --- |
| claude-agent | `query()` 的 `mcpServers` 选项注册进程内 server | 当前 SDK 版本 `0.3.221` 的 `createSdkMcpServer` 签名 |
| codex | `spawn("codex", ["app-server", "-c", "mcp_servers.cocurdex.command=…"])` 或 `thread/start` 的 config 覆盖 | 官方 app-server 是否接受 per-thread MCP 配置；若不接受则用进程级 `-c` |
| grok-build | 已有 `grok-build-mcp.ts`，沿其配置通道加入 | 配置格式 |
| opencode | `opencode-server.ts` 启动参数或配置文件写入 MCP server | opencode 的 MCP 配置文件位置与热加载行为 |
| pi | 通过 `pi-mcp-adapter` 注册 | 现有接入方式 |

所有 adapter 的写入必须是**追加**，不能覆盖用户自己的 MCP 配置。每个 adapter 一个单元测试：给定 `AgentToolsBinding`，断言生成的启动配置包含 cocurdex server 且保留原有 server。

### 文件清单

新增：

- `packages/shared/src/agent-tools.ts`
- `packages/daemon/src/agent-tools/tool-registry.ts`（注册表、catalog、输入校验与转发）
- `packages/daemon/src/agent-tools/groups/messaging.ts`（阶段 0 为空骨架）
- `packages/daemon/src/agent-tools/stdio-server.ts`（stdio MCP 入口）
- `packages/daemon/src/agent-tools/token-registry.ts`（token → sessionId，进程内 Map，daemon 重启后失效即可）
- `packages/daemon/src/agent-tools/index.ts`

修改：

- `packages/agent-core/src/agent-types.ts`：`CreateAgentSessionPayload` 增加 `agentTools?: AgentToolsBinding`
- `packages/daemon/src/runtime.ts`：签发 token 并传入
- `packages/daemon/src/handler.ts`：`agentTool.catalog` 与 `agentTool.call` 两个分支
- 五个 adapter 的 session 启动路径
- daemon 二进制入口：加 `agent-tools` 子命令

### 验收

- 单元：token 不匹配返回错误码 `UNAUTHORIZED_AGENT_TOOL`；同一 token 只能解析到签发时的 session。
- e2e（`tests/e2e`）：以 `llm-stub` 驱动一个 session，stub 返回一次 `messaging_list_agents` 工具调用，断言 daemon 收到 `agentTool.call` 且解析出的 `caller.sessionId` 正确。若现有 stub 不支持工具调用回放，先扩展 stub。

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
- 任务依赖（`blockedBy`）：首版不做，issue 数据模型不加依赖字段。
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
- **安全**：`agentTool.*` 必须只信 token；`messaging_send_message` 内容进入目标 session 前不做任何解释，仅包一层 envelope，让接收方模型知道这是来自另一个 agent 的文本而非用户指令。

## 风险与需要提前验证的点

| 风险 | 验证方式 | 若不成立 |
| --- | --- | --- |
| Codex app-server 不支持 per-thread MCP 配置 | 阅读 codex 当前版本 app-server 协议文档并实测 | 用进程级 `-c mcp_servers.…` 注入，一个 daemon 只起一个 app-server 时无差异 |
| 某个 adapter 无法追加 MCP 配置而不覆盖用户配置 | 每个 adapter 的单元测试 | 该 adapter 首版不支持 agent 工具，`agentTool.catalog` 的 `tools` 返回空数组，UI 提示 |
| `queue-after-run` 在目标 session 的队列语义与用户手动排队冲突 | 阅读 `acceptSessionMessage` 与 `resumeQueuedSession` | 为 peer 消息单独维护队列并在 `turn.completed` 后投递 |
| `node:vm` 中 `Promise` 与宿主不同 realm 导致 `instanceof` 问题 | sandbox 单元测试覆盖 `parallel` 返回值 | 在 context 里注入宿主 `Promise` |
| e2e 的 `llm-stub` 不支持工具调用回放 | 阅读 `tests/e2e/helpers/llm-stub.ts` | 先给 stub 增加"按脚本返回 tool_call"的能力，作为阶段 0 的一部分 |

## 交接检查单

实施 Agent 开始前：

1. 读 [AGENTS.md](../AGENTS.md)、[docs/agents/domain.md](agents/domain.md)、[ADR 0002](adr/0002-daemon-owned-versioned-workflows.md)。
2. 核对上文"现状事实"表，任何一条不成立先更新本文再动手。
3. 一个阶段一个分支、一个 PR；PR 描述里列出本文对应阶段的验收项及其结果。
4. 阶段 0 完成前不要开始阶段 1 到 3 的代码。
