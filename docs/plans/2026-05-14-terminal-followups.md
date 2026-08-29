# Terminal Feature — Follow-up TODO

Initial integration shipped 2026-05-14 (see [terminal-kind-dusk.md](../../../.claude/plans/terminal-kind-dusk.md)). This doc captures the known gaps in priority order. Pick from top to bottom.

## P0 — Daily-use blockers ✅ DONE 2026-05-14

All five items below shipped in the same pass; details kept for archaeology.

### 1. macOS PATH missing inside terminal ✅
- **Symptom**: 终端里 `git` / `node` / `brew` 找不到，`echo $PATH` 缺 `/opt/homebrew/bin`、`~/.cargo/bin`、nvm shims。
- **Root cause**: `ptySpawn(shell, [], ...)` 没传 `-l`，启动的是 non-login shell；GUI 启动的 Electron 进程 `$PATH` 本身就缺，子 shell 也不会去读 `~/.zprofile`。
- **Shipped**: non-Windows 默认传 `["-l"]`（POSIX login shell），Windows 维持空 args。`apps/desktop/electron/pty-service.ts`。
- **Open**: 若 login shell 仍不够（zsh 单纯没装 `.zprofile`、或用 fish），下一步改抓 `shell-env`-style env 抓取并 cache。

### 2. xterm loses focus on view switch ✅
- **Symptom**: 从 editor/browser 切回 terminal tab，必须再点一下面板内部才能输入。
- **Shipped**: `TerminalPanel` 接 `isActive` prop，独立 effect 在 `isActive && status === "ready"` 时调 `termRef.current.focus()`。`right-editor-panel.tsx` 传 `isActive={activeView === "terminal"}`。

### 3. Shell exit leaves panel stuck ✅
- **Symptom**: 用户敲 `exit` 后 PTY 死掉，再无响应也无重启入口。
- **Shipped**: panel 维护 `status.kind === "exited"`，右下角浮一个 Restart 按钮（lucide `RotateCcw` + `Button size="sm" variant="outline"`）。点击 → 自增 `restartTick`，init effect re-run 拆掉旧 xterm + 重新 spawn。`failedToStart` 错误态也复用同按钮。

### 4. Workspace switch drops in-renderer scrollback ✅ (Option B, 2026-05-14)
- **Shipped (Option A first)**: 去掉 `key={activeWorkspace.id}`，workspaceId 作为 prop 传入。
- **Shipped (Option B)**: 新增 `apps/desktop/src/features/terminal/terminal-registry.ts`，把 `Terminal` 实例缓存到 module-level `Map<workspaceId, Entry>`。`TerminalPanel` 萎缩成 thin wrapper：只在挂载/卸载时调 `attachTerminal` / `detachTerminal`，把缓存里的 `host` DOM 节点移进/移出 React slot。xterm、FitAddon、PTY 订阅、ResizeObserver、输入 forward 全部活在 registry 内，跨 view 切换和 workspace 切换都不重建，scrollback 与运行中进程双双保留。
- **取舍**：
  - PTY exit 文案改成 registry 内裸英文 `[process exited with code N]`，避免 registry 依赖 react-i18next（i18n key 已从 locale 移除）。
  - 任何 workspace 创建后 xterm 实例直到 `disposeAllTerminals()`（beforeunload）才回收 — 当前没有「workspace 删除时清掉对应 terminal」逻辑，记入 P2。
  - 真正没解决的场景：app 重启后 scrollback 仍然丢（要 Option C 才行）。

### 5. ptyResize flood while dragging ✅
- **Shipped**: ResizeObserver 回调用 `requestAnimationFrame` 合并，单帧只发一次 `fit()` + `ptyResize`；cleanup 里 `cancelAnimationFrame` 防泄漏。

## P0 follow-ups (deferred)

- **Scrollback survives app restart (Option C)**: main 端 ring buffer + `pty:replay` IPC。只在用户明确反馈「重启 app 后想看历史」时再做。
- **真实用户 env 抓取**: 即便 `-l` 也无法解决「用户根本没在 `.zprofile` 配 PATH」的情况；可 cache `$SHELL -ilc env` 输出 merge 到 spawn env。
- **Workspace 删除时清掉对应 terminal**: 当前 registry 没有 evict 钩子；workspace 被删后内存里仍残留 xterm + PTY 直到 app 退出。需要在 workspace 删除流程里加 `disposeTerminal(workspaceId)` + `desktopApi.ptyKill`。

## P1 — Sharp edges ✅ ALL DONE 2026-05-14

### 6. PtySpawn cwd boundary too wide ✅
- **Shipped**: `apps/desktop/electron/main.ts` `assertCwdIsKnownWorkspace()` 在 `pty:spawn` handler 里跑：拿 `listWorkspaces()` 的 rootPath 集合做 `path.normalize` 等值校验，cwd 不在白名单直接 throw。Zod schema 仍保证 cwd 是绝对路径，handler 再做语义校验。
- **取舍**: 暂只允许精确等于 workspace root；如果将来想支持 cd-into-subdir，把判断换成 prefix match（带 separator 防止 `/foo/bar` 通过 `/foo` 校验）。

### 7. Theme not reactive ✅
- **Shipped**: `terminal-registry.ts` 在模块加载时挂 `matchMedia('(prefers-color-scheme: dark)') change` 监听；触发时遍历 entries 重新跑 `buildTerminalTheme()` 并赋值给 `term.options.theme`。因为 `buildTerminalTheme()` 通过 `getComputedStyle(document.documentElement)` 读 CSS 变量，跟系统主题切换的 token swap 自动对齐。
- **未覆盖**：app 内是否将来有自定义 theme atom 让用户手动切（独立于系统）。届时只需在 atom 变更处也调一次 `refreshAllThemes()`。

### 8. WebLinksAddon opens links in-app ✅
- **Shipped**: 新增 `shell:openExternal` IPC（main 用 `electron.shell.openExternal`），preload + types + fallback 同步加 `openExternal(url)`。`terminal-registry.ts` 构造 `WebLinksAddon((event, uri) => { event.preventDefault(); desktopApi.openExternal(uri); })`，链接强制走系统默认浏览器。

### 9. Hardcoded English in panel ✅ DONE 2026-05-14
- **Status**: 第一次落 P0 时加了 `t("terminal.exitedWithCode")`，但接着把 xterm 生命周期搬进 `terminal-registry.ts` 后 registry 不再依赖 react-i18next，exit 文案恢复为裸英文 `[process exited with code N]` 写在 registry 的 onPtyExit 里。i18n key 同步从 en/zh locale 移除。原因：避免 framework-level module 依赖 React hook。

### 10. Cmd+C / Cmd+V semantics ✅
- **Shipped**: `terminal-registry.ts` 调 `term.attachCustomKeyEventHandler`：
  - `Cmd/Ctrl+C` 当有选区时 → `navigator.clipboard.writeText(selection)` + `clearSelection()`，吞掉事件不让 PTY 收到 SIGINT；空选区时 fall through 透传，shell 还是能正常 ^C 中断。
  - `Cmd/Ctrl+V` → 读系统剪贴板写入 PTY；剪贴板 API 失败时 fall through 让 xterm 默认 paste 兜底。

## P2 — Polish & long-term

### 11. SearchAddon ✅ DONE 2026-05-14
- **Shipped**: 装 `@xterm/addon-search@^0.16.0`，registry 里 load 进每个 entry。Cmd/Ctrl+F 在 `attachCustomKeyEventHandler` 里拦下来，通过 `notifySearchOpen` 通知 panel；panel 渲染 `TerminalSearchOverlay`（`apps/desktop/src/features/terminal/terminal-search-overlay.tsx`）：Input + 上一个 / 下一个 / 关闭三按钮。Enter 跳下一处（Shift+Enter 上一处），Esc 关闭并把焦点还给 xterm。
- **Open**: 不支持「全部高亮」`decorations` 配置；想要时给 SearchAddon 传 `decorations` option（颜色需要从主题派生）。

### 12. WebGL renderer ✅ DONE 2026-05-14
- **Shipped**: 装 `@xterm/addon-webgl@^0.19.0`，`tryLoadWebgl(entry)` 在 `term.open()` 之后调用。挂 `onContextLoss` 回调：上下文丢失时 `webgl.dispose()` 自动退回 DOM。整个 load 包在 `try/catch` 里，无 WebGL 环境的机器静默回退。
- **未覆盖**：未做「显式切换 renderer」的 UI，用户不能强制走 DOM。需要时加 settings 配置项。

### 13. Persisted scrollback across app restart — deferred
- 仅在用户明确反馈需要时再做（同 Option C）。最低成本：ring buffer 落到 `userData/terminal-scrollback/<workspaceId>.log`，启动时 replay。

### 14. Configurable shell / profile — deferred (需产品设计)
- 触发条件：用户反馈想换 shell（fish、nushell）或加自定义 env。等 Settings UI 重构 / terminal profile 规格定下来再做。
- 现状：硬编码 `$SHELL ?? /bin/zsh`（POSIX）/ `COMSPEC ?? powershell.exe`（Windows），加 `-l`。

### 15. Multi-tab / multiple PTYs per workspace — deferred (原计划下个 milestone)
- 需要 tab UI + PTY id 由 workspaceId 切到独立 uuid + 持久化「open tabs」。等多 tab 决定上 milestone 再动。

### 16. Attach PTY output to chat — deferred (跨 feature 设计)
- 「选 terminal 输出 → Add to Chat」是 chat composer 的扩展点，不是 terminal 自己的事。等 chat 那侧定 attachment kind 之后联动加。

### 17. Packaging 验证（macOS 签名 / 公证）— deferred (人工 QA)
- 不是代码任务。下一次跑 `dist:mac` + 公证完整流程时验：
  - spawn-helper 在 `.app/Contents/Resources/app.asar.unpacked/...` 且仍可执行（`asarUnpack` 已配）。
  - codesign 包含 spawn-helper 和 pty.node（macOS 签名规则需要 entitlement allow `com.apple.security.cs.allow-unsigned-executable-memory` 或者 sub-sign helper binaries）。
  - notarytool 不报错。
- 现在 dev 能跑、未实测打包。

### 18. Tests ✅ DONE 2026-05-14
- **Shipped**: `src/test/terminal-ipc.test.ts` 12 个测试，覆盖：
  - `schemas.ptySpawn` 接受 well-formed payload；拒绝相对 cwd / 非正 cols+rows / 超过 dimension cap (1000) / workspaceId 里有 path separator。
  - `schemas.ptyWrite` 接受 UTF-8（中文 OK）；拒绝 > 1MB payload。
  - `schemas.ptyResize` 拒绝非整数 cols / rows。
  - `schemas.ptyKill` 必须有 workspaceId。
  - `desktopApi` 上 7 个 terminal 方法都存在。
- **未覆盖**：
  - `PtyService` 单测（要 mock `node-pty`，工作量 ~30min；当前 Schema + 真机 dev 测试已经覆盖大部分回归）。
  - `assertCwdIsKnownWorkspace` 集成测（依赖 SQLite + `listWorkspaces`，要抽出来才好测）。
  - 端到端：xterm canvas 在 jsdom 跑不起来，需要真实 Electron 进程，等有 Playwright Electron 流程时再加。

## Out-of-scope (不在 terminal feature 范围)

- Embedded shell as agent tool — 这是另一个产品方向（让 agent 执行 shell 命令），不要混进交互式 terminal。
- VS Code-style integrated bottom panel — 用户已确认要侧抽屉，重做位置属于产品决策，不是改进。
