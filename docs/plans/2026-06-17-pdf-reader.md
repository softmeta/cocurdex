# PDF 内嵌阅读器（In-app PDF reader with selection-to-chat）

> **实施状态**：✅ 已实现（MVP）。**架构调整**：PDF 不在 editor view 内分流，而是作为右侧面板**顶层独立
> tab**（`RightPanelView "pdf"`）。文件树点开 `.pdf` → `openPdfReaderAtom` 设置当前 PDF + reveal nonce →
> 面板切到 PDF tab → `PdfReaderView` 渲染 `PdfViewer`。PDF 不再进 editor 的 `openFiles`。其余（IPC、renderer
> 隔离边界、划选发 agent、虚拟化、cmap）与下文一致；显式延后范围不变。

## 背景与目标

右侧编辑器面板（`apps/desktop/src/app/layout/right-editor-panel.tsx`）的 editor view 目前对所有打开的文件
固定渲染 `<MonacoEditor>`（line 437）。需求是让用户能在面板里**阅读 PDF**，并复用编辑器已有的
「划选文本 → 气泡 → 加入 Chat」链路，把选中的 PDF 文本作为上下文发给 agent 辅助理解。

关键判断：**这套「内嵌阅读器 + 划选发给 agent」所需的基础设施几乎全都有了**。Monaco 编辑器已经跑通
selection → `ContextFileAttachment` → `setChatComposerAttachmentAtom` → composer 折叠成 mention pill →
adapter（claude-code / codex / pi / opencode）共用的 `buildTextWithContextAttachments` 注入 prompt。
PDF 阅读器只要**产出同形状的附件**，agent 侧零改动即可消费。

不能用 `<iframe>` / Chromium 内置 PDF 插件：拿不到选中文本和页码，无法对接 agent。必须用能渲染
**text layer**（透明可选文本层覆盖在 canvas 上）的方案，让浏览器原生 `window.getSelection()` 能选中文字。

**最终效果**：在文件树点开 `.pdf` → 在 editor view 内以阅读器渲染（翻页 / 缩放 / 滚动）→
划选文字 → 出现「加入 Chat」气泡 → 选中文本作为上下文附件进入 composer → 发给 agent。

## 已定决策

| 项 | 决策 | 理由 |
|----|------|------|
| 放置层级 | **editor view 内的文件类型** | `.pdf` 走现有 `openPreviewFileAtom` / `EditorTabs` / session 持久化 / breadcrumb，全部免费复用，改动最小 |
| 渲染库 | **`react-pdf`，但关进隔离边界** | text layer 开箱即用、体积可控；用唯一一个 renderer 文件封装，后期可平滑切到裸用 `pdfjs-dist` |
| 附件建模（MVP） | **纯文本，复用 `ContextFileAttachment`** | 选中文本即可，不新增 attachment kind，adapter 侧零改动；页码等结构化信息留待后续迭代 |
| 文件读取 | **走 IPC 拿 buffer，不走 `file://`** | 打包后 renderer 直连 `file://` 受限；照 `readImageAttachmentDataUrl` 范式新增 `readPdfData` |
| 大文件 | **页面虚拟化** | 用项目已装的 `@tanstack/react-virtual`，只渲染视口附近页 |

## 复用现有能力（不要重造）

- **打开文件 + tab 管理**：`openPreviewFileAtom` / `openFileAtom` / `openFilesAtom` / `activeFileAtom` /
  `previewFileAtom`（`apps/desktop/src/features/editor/editor-store.ts:15-91`）。`.pdf` 进 `openFilesAtom`
  后，`EditorTabs`、`saveEditorViewSnapshotAtom` 的 session 持久化、breadcrumb 全部自动生效，**无需新增 tab 代码**。
- **加入 Chat 数据流**：`setChatComposerAttachmentAtom`（`editor-store.ts:122`）→ composer 的
  `chatComposerAttachmentAtom` → `ChatComposer` 把 context attachment 折叠成 mention pill。
  `right-editor-panel.tsx:438` 已经把 `onAddSelectionToChat` 接到这个 atom。
- **气泡按钮 UI**：`apps/desktop/src/features/editor/selection/send-selection-button.tsx`（纯 UI，可直接复用）。
- **附件构造范式**：`apps/desktop/src/features/editor/context-file-attachment.ts` 的
  `buildContextFileAttachment(filePath, fileText)`——PDF selection 照此构造 `ContextFileAttachment`。
- **adapter 注入**：`packages/agent-adapters/src/shared/attachment-utils.ts` 的
  `buildTextWithContextAttachments` + `formatContextFileAttachments`，**零改动**直接消费纯文本附件。
- **文件读 IPC 范式**：`readImageAttachmentDataUrl`——`electron/main.ts:447` 注册、`preload` 暴露、
  `apps/desktop/src/lib/types.ts:154` 声明、`lib/ipc.ts:84` 提供 fallback。`readPdfData` 镜像这一套。
- **状态管理**：jotai atoms（不是 zustand）。
- **空态 / 加载态**：`EmptyState` + `Spinner`（AGENTS.md 规定）。
- **图标**：`lucide-react`，统一 `size-3.5` / `size-4`（AGENTS.md）。

## 实施步骤

### A. 引入 react-pdf 与 pdf.js 资源

1. `pnpm --filter @cocurdex/desktop add react-pdf`（最新稳定版，自带 `pdfjs-dist` peer）。
2. **worker 配置**：在 renderer 入口或 renderer 文件里设
   `pdfjs.GlobalWorkerOptions.workerSrc`。按 `react-pdf` v10 推荐写法用
   `new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString()` 取得 URL；如果
   electron-vite 打包产物实测有问题，再退回 Vite `?url` import。
3. **中文必需的 cMap + 标准字体**（macOS 优先，但中文 PDF 是刚需，漏了会显示成方块）：
   把 `pdfjs-dist/cmaps` 和 `pdfjs-dist/standard_fonts` 作为 renderer 静态资源复制到 Vite 输出目录。
   当前 `apps/desktop` 没有现成 `public/`，不要只假设 public 存在；优先在
   `electron.vite.config.ts` 的 renderer 配置里用 Vite 静态复制方案（如 `vite-plugin-static-copy`
   或等价配置）把资源产出到 `out/renderer/cmaps/` 和 `out/renderer/standard_fonts/`，因为
   `electron-builder` 目前只打包 `out/**`。给 `<Document options={{ cMapUrl, cMapPacked: true,
   standardFontDataUrl }}>` 传入相对 renderer origin 的路径：`/cmaps/`、`/standard_fonts/`。
   dev、`pnpm --filter @cocurdex/desktop dist:dir`、mac 包三种场景都要验证路径。
4. **CSP**：确认 renderer 的 CSP 允许 `worker-src blob:`（pdf.js worker 走 blob）。
5. **打包验证点**：worker、cmap、standard_fonts 三处资源在 `electron-builder` 产物里路径正确（最易踩坑）。
6. **text layer CSS**：在唯一的 react-pdf renderer 边界文件里引入
   `react-pdf/dist/Page/TextLayer.css`。不引入时 text layer 可能渲染但无法正确选择/定位文本。

### B. Electron 后端 —— 新增 `readPdfData` IPC

照 `readImageAttachmentDataUrl` 范式，**不要**新建大 service，挂到现有图片/文件读取所在模块即可：

- main 侧 `readPdfData({ filePath, workspaceRootPath }): Promise<Uint8Array>`：`fs.readFile` 返回 buffer。
   IPC 用 structured clone 直接传 `Uint8Array`（无需 base64）。
- **授权边界（必须做，不是 nice-to-have）**：`filePath` 来自 renderer 不可信。schema 用现有
  `filesystemPathSchema` 校验 `filePath` 和 `workspaceRootPath`；main 侧用 `path.resolve()` 后确认
  `filePath` 位于 `workspaceRootPath` 内，且扩展名是 `.pdf`。越界、非 PDF、空路径都拒绝。
- **文件大小上限**：先设一个明确 MVP 上限（建议 50 MB，可按实现时体验调整）。超限时 main 侧拒绝，
  renderer 显示 `EmptyState` 错误文案，避免一次性把超大 PDF clone 到 renderer。
- `ipc-schemas.ts` 加 `readPdfData`（zod：`filePath` / `workspaceRootPath` 复用 `filesystemPathSchema`）。
- `main.ts` 注册 `pdf:read-data`；`preload.ts` 暴露 `readPdfData(payload)`；
  `lib/types.ts` 的 `desktopApi` 补类型；`lib/ipc.ts` 补 fallback（返回空 `Uint8Array`）。
- 不要复用 image attachment storage 的 root 约束。PDF 是 workspace 文件读取能力，应按 workspace root 授权。

### C. Renderer —— 新建功能文件夹 `apps/desktop/src/features/pdf-reader/`

（按 AGENTS.md 内聚原则；`index.ts` barrel 只 export `PdfViewer`。每文件 ≤ 400 行，超了先拆。）

- `renderer/react-pdf-renderer.tsx` —— **唯一**直接 import `react-pdf` 的文件。对外暴露项目自定义的
  内部 props（如 `pages` / `scale` / `onTextLayerReady`），把 `<Document>` / `<Page>`（含 text layer）
  关在里面。**切换到裸用 `pdfjs-dist` 时只动这一个文件**，viewer 主体零改动。
- `pdf-viewer.tsx` —— 阅读器主体：
  - 用 `desktopApi.readPdfData({ filePath, workspaceRootPath })` 拿 `Uint8Array`，传给 renderer 的
    `file={{ data }}`。
  - 请求需要处理竞态：快速切换文件时，旧请求返回不能覆盖新文件状态。用 request id、`AbortController`
    可用部分，或局部 cancelled flag 保护 state。
  - 工具栏（缩放 +/- / 页码 / 适应宽度）用项目已有 shadcn 组件，**不手写基础控件**。
  - 多页用 `@tanstack/react-virtual`（已装）虚拟化，只渲染视口附近页。
  - 明确虚拟化只减少 DOM / page render 压力，不解决 `Uint8Array` 一次性读入内存的问题；超大文件靠
    main 侧大小上限兜底。
  - 加载用 `Spinner`，加载失败 / 扫描件无文本层用 `EmptyState`。
  - 只依赖 `renderer/` 的内部 props，不直接碰 `react-pdf` API。
- `use-pdf-selection.ts` —— DOM selection → 附件 + 气泡定位：
  - 监听容器内 `mouseup`，用 `window.getSelection()` 取跨 span 的纯文本；
    trim 后过短（参照 editor 的 `MIN_SELECTION_ACTIONABLE_CHARS`）不触发。
  - 用 `Range.getBoundingClientRect()` 算气泡位置（**不能**复用 monaco 的 `useSelectionBubble`，
    那个依赖 monaco API；本 hook 是它的 DOM 版对应物）。
  - 选中后构造 `ContextFileAttachment`：`selectedText` / `surroundingContext` = 选中文本，
    `filePath` = PDF 路径，`language: "pdf"`，行号字段占位（MVP）。
    把占位行号构造封装成小纯函数（如 `buildPdfSelectionAttachment`），不要把 `startLine: 1` /
    `endLine: 1` 散落在 hook 里；后续替换为页码附件时只改一处。
    通过 `setChatComposerAttachmentAtom` 推给 composer。
  - 合法 Effect：同步外部 DOM selection 事件，render 算不出来。
- `pdf-selection-bubble.tsx`（可选，或直接在 viewer 内渲染）—— 复用
  `editor/selection/send-selection-button.tsx`，点按调上面的「加入 Chat」。

### D. editor view 内按扩展名分流

- `right-editor-panel.tsx:435-442` —— editor body 当前固定渲染 `<MonacoEditor>`。改为按
  `activeFile` 扩展名分流：`.pdf` → `<PdfViewer filePath={activeFile} />`，其余照旧 `<MonacoEditor>`。
  把分流判断抽成小工具函数（如 `isPdfPath`），便于单测。
- `<EditorBreadcrumb>` 对 PDF 同样适用，保留。
- `EditorTabs`（`editor-tabs.tsx`）的 markdown 「编辑/预览」切换只对 `.md`，PDF 无需，不动。
- `FileTypeIcon`（`@/components`）确认对 `.pdf` 有图标（lucide `FileText` 兜底）；缺则补映射。

### E. mention pill 显示（已知 MVP 取舍）

composer 把 `ContextFileAttachment`（`kind` 默认 `context-file`）折叠成 mention pill 时，label 走
`getContextAttachmentMentionLabel` / serialized text 基于 `filePath:startLine-endLine`。PDF 用占位行号，
pill 会显示成类似 `foo.pdf:1-1`。**MVP 可接受**；后续若要显示页码（`foo.pdf p3`），再引入结构化
建模（新增 `PdfSelectionAttachment` kind + 改 adapter 共用的 `attachment-utils`）——此项明确延后。

## 每次改完的校验（AGENTS.md）

1. `pnpm --filter @cocurdex/desktop exec tsc --noEmit`（只针对变动的 TS 源文件）。
2. `pnpm exec biome check --write <变动文件>`。
3. 新增 `t("…")` 文案 → `pnpm --filter @cocurdex/desktop i18n:extract`，补齐 `en-US` + `zh-CN`，
   再 `pnpm --filter @cocurdex/desktop i18n:types`。

## 验证

- 用户自行运行 `pnpm --filter @cocurdex/desktop dev`（AGENTS.md 规定 agent 不跑 dev）。
- 手动：文件树点开一个 `.pdf` → 在 editor view 渲染、可翻页/缩放；
  打开一个**中文 PDF** 确认 cmap/字体生效（不出现方块）。
- 手动：划选一段文字 → 出现「加入 Chat」气泡 → 点击 → composer 出现 mention pill →
  发送后 agent 收到选中文本（在 prompt 里能看到该段内容）。
- 手动：打开多页（上百页）PDF 确认虚拟化生效、滚动不卡。
- 手动：打开扫描件（图片型 PDF）→ 选不中文字时给出空态/提示，不报错崩溃。
- 手动：session 切换 / 重开后，已打开的 PDF tab 能从 `editorViewsBySession` 恢复。
- 必须单测（不依赖 Electron，mock 锁到具体源文件而非 barrel）：
  - `isPdfPath` 扩展名分流；
  - `right-editor-panel` 或抽出的 editor body 分流：`.pdf` 渲染 `PdfViewer`，其他文件仍渲染
    `MonacoEditor`；
  - `buildPdfSelectionAttachment` / `use-pdf-selection` 的「selection 文本 → `ContextFileAttachment`」
    纯函数部分；
  - `readPdfData` main 侧纯校验逻辑：workspace 内允许、workspace 外拒绝、非 `.pdf` 拒绝、超限拒绝；
  - `desktopApi` 类型/fallback：`readPdfData` 存在且返回 `Uint8Array`。

## 显式延后范围

- **结构化页码附件**：`PdfSelectionAttachment` kind + adapter `attachment-utils` 改造、pill 显示页码——延后。
- **裸用 `pdfjs-dist`**：renderer 隔离边界已留好，性能/定制需要时再切——延后。
- **OCR**：扫描件文本识别不在范围内。
- **PDF 内搜索 / 注释 / 书签 / 缩略图侧栏**：MVP 只做阅读 + 划选发 agent。
- **打开工作区外任意 PDF（系统文件选择器）**：MVP 走文件树（工作区内）；独立入口后续再议。
