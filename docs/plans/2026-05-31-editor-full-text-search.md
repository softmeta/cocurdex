# 编辑器全文搜索（Full-text search across workspace files）

> **实施状态**：⬜ 未开始

## 背景与目标

编辑器工具栏已有一个放大镜按钮（`apps/desktop/src/app/layout/right-editor-panel.tsx:238`），
但它**没有 `onClick`**，是个死按钮，挨着「未选择文件」文案。需求是让它驱动**跨工作区文件的全文内容搜索**
（VSCode `Cmd+Shift+F` 风格），不是文件名查找。

不能用朴素的 `fs` 遍历 + 正则：慢、不认 `.gitignore`、二进制/编码处理差。
项目里已经用 **`fd`** 二进制做文件*列举*（vendored、sha256 校验、运行时解析），
全文*搜索*用 **ripgrep（`rg`）** 同理。

**最终效果**：输入关键词 → 结果按文件分组流式返回 → 点击某条 match → 在 preview tab 打开该文件并滚动到对应行。

## 已定决策

| 项 | 决策 | 理由 |
|----|------|------|
| ripgrep 来源 | **`@vscode/ripgrep` npm** | 自带各平台 `rg` 二进制，装上即用，省去 manifest/sha/下载脚本维护 |
| 搜索面板位置 | **替换 EditorTabs 行** | 点放大镜，工具栏 flex-1 槽位从 tabs 切到搜索面板，改动小、复用现有布局 |
| 结果面板位置 | **editor body 内独立纵向区域** | toolbar 只放输入和开关，结果列表不能挤进 28px 高的工具栏 |
| 权限边界 | **main 侧只允许搜索当前 workspace root** | renderer 传入路径不可信，schema 只能校验形状，不能授权 |
| 空查询 | **trim 后为空不启动 rg** | 避免 `rg ""` 扫全仓，清空结果并回到 idle |
| 错误语义 | **done/error 分开建模** | 非法正则、权限错误、spawn 失败不能表现成“无结果” |

## 复用现有能力（不要重造）

- **打开文件 + 跳行**：`openFilePreviewAtom` + `EditorPreviewLocation { filePath, startLine, endLine }`
  （`apps/desktop/src/features/editor/editor-store.ts:8,82`）。Monaco 已消费 `previewLocationsByFileAtom`，
  点击结果只需调这个 atom，**无需新增任何 monaco 代码**。
- **流式 IPC**：pty 范式 —— main 用 `webContents.send("pty:data", …)`，
  preload（`apps/desktop/electron/preload.ts:252`）暴露 `onPtyData(handler)` 返回取消订阅函数，
  外加 `invoke` 做 spawn/kill。镜像出 `search:result` / `search:start` / `search:cancel`。
- **状态管理**：store 用的是 **jotai atoms**（不是 zustand），新状态也用 atoms。
- **IPC 边界校验**：`registerHandler` + `schemas`（`apps/desktop/electron/ipc/ipc-schemas.ts`）。
- **树样式**：`apps/desktop/src/features/editor/tree-style.ts` 给结果树用；
  空态/加载态用 `EmptyState` + `Spinner`（AGENTS.md 规定）。

## 实施步骤

### A. 引入 ripgrep（`@vscode/ripgrep`）

1. `pnpm --filter @cocurdex/desktop add @vscode/ripgrep`（最新稳定版）。
   该包自带各平台 `rg` 二进制，导出 `rgPath`（二进制绝对路径），无需 manifest/sha/下载脚本。
2. **打包**：二进制位于 `node_modules/@vscode/ripgrep/bin/rg`，会被打进 asar，
   而 **asar 内的二进制无法 spawn**。在 `apps/desktop/package.json:91` 的 `asarUnpack` 加一条
   `"node_modules/@vscode/ripgrep/**/*"`（挨着 `node-pty`）。
   运行时把 `rgPath` 的 `app.asar` 替换成 `app.asar.unpacked`（`.replace("app.asar", "app.asar.unpacked")`），需实测验证。
3. 不需要 `vendor/rg`、不需要 `ensure-rg.mjs`、不动 `extraResources`。

### B. Electron 后端 —— 新建 `electron/workspace/search-service.ts`

（**不要**继续撑大 `workspace-service.ts`，它已 551 行。）

- 引入 `{ rgPath } from "@vscode/ripgrep"`，启动时解析一次 unpacked 路径（asar → asar.unpacked），
  不做 `resolveRgPath()` 那种文件系统探测。
- `startSearch(rootPath, query, opts, onBatch, onDone, onError)`：
  - **授权先行**：`rootPath` 必须来自 main 侧当前 workspace/session 状态，或严格校验等于当前 workspace root。
    不接受 renderer 任意传入路径后直接 spawn。
  - `query.trim()` 为空时直接返回 idle/done，不启动 `rg`。
  - spawn `rg --json --line-buffered`，按 opts 拼 flag：
    `-i`/`-s`（大小写）、`-w`（整词）、`-F`（字面量）vs 正则、
    `--max-count N`（每文件上限）、JS 侧再压全局总数上限（约 5000）、
    `-g` glob（include/exclude，后续）。
  - stdout **逐行** parse（`readline` 包裹 stdout），只取 `type === "match"` 记录，
    攒批（约 50 条 / 32ms）→ `onBatch`。
  - **UTF-16 列号修正**：`rg` 的 submatch 偏移是**字节**偏移，monaco 要 **1-based UTF-16** 列号。
    抽纯函数从原始行 `Buffer` + byte offset 重算 column/range，必须覆盖 ASCII、CJK、emoji/surrogate pair。
  - 返回登记到 `Map<searchId, ChildProcess>` 的句柄，供取消。
  - 非 0 exit：区分 “无匹配”(rg exit 1) 和错误（exit > 1 / spawn error），错误回传给 UI。
    stderr 只作为短错误消息展示，限制长度，避免把大量输出塞进 IPC。
- `cancelSearch(searchId)`：`child.kill()`，从 map 删除。
  child `close`/`error` 后也必须 cleanup；`webContents` destroyed 时 kill 该窗口发起的所有 search。

### C. IPC 接线

- `ipc-schemas.ts` 加 `searchStart`（zod：`rootPath` 复用 `filesystemPathSchema`、
  `query` 限长、`caseSensitive`/`wholeWord`/`useRegex` 布尔、`searchId` 走 `idSchema`、`maxResults` int 上限）
  与 `searchCancel`（`searchId`）。
- `main.ts` 注册 `search:start` 调 `startSearch`，批次经 `event.sender.send("search:result", { searchId, batch })`
  转发，外加终止信号 `search:done`；错误经 `search:error` 回传；再注册 `search:cancel`。
  所有回传都带 `searchId`，renderer 必须丢弃非当前 search 的 stale event。
- `preload.ts` 暴露 `startSearch(payload)`、`cancelSearch(searchId)`、
  `onSearchResult(handler)` / `onSearchDone(handler)` / `onSearchError(handler)`（镜像 `onPtyData`，返回取消订阅函数）。
  把类型补进 renderer 用的 `desktopApi` 类型声明。

### D. Renderer —— 新建文件夹 `apps/desktop/src/features/editor/search/`

（按 AGENTS.md 内聚原则；`index.ts` barrel 只 export `SearchPanel`。）

- `search-store.ts` —— jotai atoms：`searchQueryAtom`、各选项 atom、
  `searchResultsAtom`（`Map<filePath, Match[]>`）、`searchStatusAtom`（`idle|running|done|error`）、
  `searchErrorAtom`、`activeSearchIdAtom`。
  一个 `useSearch()` hook 持有此处**唯一允许的 `useEffect`**：它同步外部 `rg` 进程 ——
  query debounce 250ms，起新 `searchId` 前先 `cancelSearch` 上一个，
  订阅 `onSearchResult`/`onSearchDone`/`onSearchError`，卸载时取消订阅 + cancel。
  handler 先比对 `searchId === activeSearchId`，旧搜索的 batch/done/error 直接丢弃。
  query trim 后为空：cancel 旧搜索、清空结果、清空错误、状态置 `idle`。
  （合法 Effect：外部子进程 + IPC 订阅，render 算不出来。）
- `search-panel.tsx` —— 只负责搜索工具条：`Input` + 选项开关（aA / 整词 / 正则，用 shadcn `Toggle`）、
  结果计数、错误短消息、运行中用 `Spinner`。不要把结果列表塞进 toolbar。
- `search-results-pane.tsx` —— 搜索激活时在 editor body 内渲染结果区（独立纵向区域，而不是 toolbar 子元素），
  无查询/无结果用 `EmptyState`，错误态展示 `searchErrorAtom`。
- `search-result-group.tsx` / `search-result-item.tsx` —— 文件分组头 + 行；
  行显示行号 + 行文本，匹配区间高亮（用重算后的 submatch range）。
  复用 `tree-style.ts` + `file-icon.tsx`。
  点击行 → `openFilePreviewAtom({ filePath, startLine: line, endLine: line })`。
- 每个文件控制在 400 行内（AGENTS.md）。

### E. 工具栏接线（替换 EditorTabs 行）

- `right-editor-panel.tsx:238` —— 放大镜按钮加 `onClick` 切换 `searchPanelVisibleAtom`。
  激活时工具栏 flex-1 槽位渲染 `<SearchPanel/>`（新 barrel）**替换** `<EditorTabs/>`（line 246）；
  未激活时照旧渲染 `<EditorTabs/>`。按钮激活态参照 PanelLeft 按钮（`bg-editor-tab-active-bg`）。
  `Cmd+Shift+F` 绑定到这个切换。
- 搜索结果区域在 editor body 内渲染 `<SearchResultsPane/>`；不要挤在 toolbar。
  布局要保留下方 editor preview，点击结果后仍能看到文件跳转。
- 结果行仍驱动 `openFilePreviewAtom`，所以即便 tabs 被搜索面板挡住，下方编辑器照样更新。

## 每次改完的校验（AGENTS.md）

1. `pnpm --filter @cocurdex/desktop exec tsc --noEmit`
2. `pnpm exec biome check --write apps/desktop/src`
3. 新增 `t("…")` 文案 → `i18n:extract`，补齐 `en-US` + `zh-CN`，再 `i18n:types`。

## 验证

- `node -e "console.log(require('@vscode/ripgrep').rgPath)"` 拿到路径后跑 `<path> --version` 确认二进制可用。
- 用户自行运行 `pnpm --filter @cocurdex/desktop dev`（AGENTS.md 规定 agent 不跑 dev）。
- 手动：点放大镜 → 输入已知存在的字符串 → 结果流式进来、按文件分组 → 点某条 → 文件在正确行打开。
  测一个 **CJK** 关键词确认列偏移正确。快速改 query → 无残留旧结果、旧进程被 kill。
  搜单字符常见字母 → 命中上限、UI 不被淹。
- 手动：空查询不会启动搜索；非法正则显示错误态；无匹配显示空态。
- 手动：尝试传非当前 workspace root 的路径，main 侧拒绝搜索。
- 必须：对字节→UTF-16 列号转换写纯函数单测（不依赖 Electron，mock 锁到具体源文件而非 barrel）。

## 显式延后范围

- 仅内容全文搜索；文件名 fuzzy finder（`Cmd+P`）是另一件事。
- include/exclude glob 输入框：后端已支持 `-g`，UI 后续再上。
- 跨文件替换（replace-in-files）：不在范围内。
