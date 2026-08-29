# Cocurdex 多 Agent 编排方案

## Summary

为 Cocurdex 增加一层本地编排 runtime，用来调度 `codex`、`claude-code`、`pi`、`opencode` 这些真实 agent session。顶层编排器只调度 Cocurdex 直接创建的 agent session；各 agent 自己 spawn 的内部子 agent 作为可观测的 provider subgraph 归档展示，不作为顶层可调度节点。

核心原则：顶层调度 agent runtime，内部 subagent 只观测不接管。

## Key Changes

- 新增核心对象模型：
  - `AgentProfile`: `codex`、`claude-code`、`pi`、`opencode` 的身份、默认说明、能力、默认模型、默认权限。
  - `AgentRuntime`: 当前机器上可运行的 agent runtime，包含安装状态、health、capacity、provider/model 可用性。
  - `OrchestrationRun`: 顶层编排执行实例，记录模板、root prompt、状态、预算、汇总结果。
  - `AgentTaskRun`: 一个 managed agent 的具体子任务执行，记录目标 agent、输入、状态、runtime session、worktree/patch 输出。
  - `TaskEventLog`: 按递增 `seq` 记录状态、消息、工具、权限、artifact、usage，供 UI 增量读取和失败复盘。
- 新增编排节点模型：
  - `orchestration`: Cocurdex 顶层编排 root。
  - `managed-agent-session`: Cocurdex 直接启动的 `codex`、`claude-code`、`pi`、`opencode` session。
  - `provider-subagent`: agent runtime 自己 spawn 的子 agent，可观察、可归档、默认不可单独调度。
  - `tool-call`: 普通工具调用节点。
- 扩展 session graph：
  - 复用现有 `parentSessionId` / `parentToolCallId`。
  - root 编排 session 下挂多个 managed agent sessions。
  - provider subagent 挂在对应父 session 或父 tool call 下。
- 新增 orchestration runtime：
  - 负责创建 root 编排任务。
  - 按模板启动多个 agent session。
  - 控制并行/串行、预算、取消、汇总。
  - 执行前做 admission gate，确认目标 agent 已安装、runtime 可用、模型可用、权限模式满足模板。
  - 不直接控制 provider 内部 spawn 的子 agent。
- 新增 provider subagent 策略：
  - `disabled`: 禁用 provider native subagents，用于生命周期无法可靠 drain/cancel 的 runtime。
  - `observed`: 允许 provider native subagents，但只作为 observed-only subgraph 记录。
  - `managed`: 仅当 adapter 能可靠暴露 child lifecycle、drain、cancel、trace 时，才纳入可管理节点。
- 新增编排模板：
  - `parallel_review`: 多 agent 并行分析同一任务，汇总差异和共识。
  - `plan_execute_verify`: 一个 agent 规划，一个 agent 执行，一个 agent 验证。
  - `research_then_code`: 一个 agent 搜索/定位，一个 agent 实现，一个 agent 审查。
- 统一子任务输出格式：
  - `status`
  - `summary`
  - `artifacts`
  - `risks`
  - `nextSuggestedTasks`
  - `confidence`
- 权限策略：
  - root orchestration 定义权限上限。
  - managed agent session 只能获得该上限内的权限。
  - provider-subagent 继承父 session 权限。
  - 危险操作仍走现有 permission request。
  - 顶层不承诺给 provider-subagent 单独提权。
- 取消策略：
  - 顶层 API 只承诺取消 managed agent session。
  - provider-subagent 的细粒度取消仅在对应 adapter 明确支持时实现。
  - 如果 adapter 不支持，停止父 session。
- workspace / session 策略：
  - managed agent session 应尽早持久化 provider session id、working directory、patch/artifact 路径。
  - `shared-read`: plan、review、search、explain 等只读任务共享当前 repo，并强制 read-only 权限。
  - `patch-sandbox`: agent 不直接写主工作树，只输出 patch/artifact；适合能稳定产出 diff 的只读执行模式。
  - `git-worktree`: 并行写入 worker 默认使用独立 worktree，避免多个 agent 同时修改同一工作树。
  - 单个写入任务可继续使用当前 repo；多个并行写入任务必须使用 `git-worktree`。
  - dirty repo + parallel write 默认阻止启动，并提示先提交/stash；dirty repo + read-only/review 允许执行。
  - root orchestration 负责选择、合并或拒绝各 worker 的 patch/artifact。
- UI 展示：
  - 左侧展示 orchestration tree。
  - managed agent session 标记为 Cocurdex controlled。
  - provider-subagent 标记为 spawned by provider / observed only。
  - 每个节点展示状态、工具调用、权限请求、产物、usage、错误。
  - root 汇总视图展示各 agent 的结论、冲突点、最终采用结果。

## Implementation Notes

- 优先复用现有 `agent-adapters`、daemon runtime、`AgentEvent`、`SessionRecord`。
- opencode 已能识别 task/subagent 并映射为子 session，应作为 provider-subagent 的第一套实现基准。
- Codex、Claude Code 若只能暴露内部 task/tool event，则先展示为 tool-call/activity；不要强行伪造成可调度 session。
- Codex native multi-agent 默认应使用 `disabled` 或 `observed` 策略；只有 adapter 能确认父 turn 完成前已 drain 子 agent 输出时，才允许进入 `managed`。
- supervisor 第一版可以是确定性调度器，不必先做一个新的 LLM agent。
- 顶层汇总优先读取 `AgentTaskRun` 的最终输出和 artifact 引用；provider-subagent trace 只作为辅助上下文。
- 事件持久化应采用 append-only log，并支持按 `seq` 增量读取，避免 UI 或 supervisor 反复重放完整 conversation。
- 从 Multica 借鉴 team/squad 的产品模型，但不要把 mention/comment 作为内部调度核心；Cocurdex 应由 orchestration runtime 直接创建 child task。
- rerun 应支持 fresh session：用户认为旧结果错误时，不复用可能污染的 provider conversation；自动重试基础设施错误时，可按 adapter 能力复用 session。
- worktree 路径不要放在 repo 内部，避免 agent 误读或误改；优先放在 app data/cache 目录下，并按 repo hash、run id、task id 分层。
- worker 结束后收集 `git diff`、测试结果和 artifact，由 root orchestration 展示给用户确认；第一版不要自动 `git merge` 到主工作树。

## Test Plan

- 创建 root orchestration 后，应能并行启动多个 managed agent sessions。
- 创建 orchestration 前 admission gate 应能拦截不可用 agent、离线 runtime、缺失模型、不满足权限或不可隔离 workspace 的任务。
- managed agent session 的状态变化、消息、tool call、permission request、artifact、usage 应统一归入 root trace，并能按 `seq` 增量读取。
- opencode 内部 subagent 应显示为 provider-subagent，并正确挂到父 session / tool call。
- Codex native subagents 在 `disabled` 策略下不应启动；在 `observed` 策略下不应影响父 `AgentTaskRun` 的完成判定，除非 adapter 已完成 drain。
- 取消 managed agent session 时，应停止对应 runtime，并把未完成 provider-subagent 标记为 interrupted 或 inherited stopped。
- 权限请求应继承父 session 权限上限，provider-subagent 不应绕过父 session 权限。
- read-only 并行任务应共享 repo 且不能写入；并行写入任务应落在独立 worktree，root orchestration 应能汇总各 worker diff/artifact。
- dirty repo + parallel write 应被 admission gate 阻止；dirty repo + read-only/review 应允许执行。
- worker worktree 结束后应能收集 diff、测试结果和 artifact，并在用户确认前不修改主工作树。
- daemon 或 app 重启后，应能根据已持久化的 session id、work directory、event log 恢复展示或给出明确的 retry path。
- 汇总逻辑应能处理：
  - 全部成功。
  - 部分 agent 失败。
  - agent 输出互相冲突。
  - provider-subagent 只有 tool-call 事件、没有独立 session。
- UI 应区分 controlled 节点和 observed-only 节点，避免用户误以为内部 subagent 可被顶层直接调度。

## Assumptions

- 第一版不做完全自治 agent 群聊。
- 第一版不直接接入 A2A，只保留可映射到 A2A 的 task/artifact/capability 概念。
- 第一版不要求顶层调度器控制 Claude Code / Codex / opencode 内部 spawn 的每个子 agent。
- 第一版不依赖 agent 自己调用 CLI/comment/mention 来推进内部状态机；状态推进由 Cocurdex orchestration runtime 控制。
- 第一版以本地 Cocurdex daemon 编排为主，后续再考虑把 Cocurdex 暴露为 A2A agent 或接入外部 A2A agent。
