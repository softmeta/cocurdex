# 右侧栏新增「写作 / 笔记」Tab（Notion-style notes tab）

> **状态**：✅ 阶段 1-3 已实施（数据层 + IPC、编辑器 tab + 多文档导航、Notion 块增强）。阶段 4 为可选后续。

## 背景与目标

需求是在右侧编辑面板（`apps/desktop/src/app/layout/right-editor-panel.tsx`）新增一个独立 tab，提供类似 Notion / Obsidian 的写作能力。

可行性结论：**完全可行，且改动可控**。右侧面板已是开放式 view 注册架构（`RightPanelView` 联合类型 + `TAB_REGISTRY`），新增 view 路径清晰；持久化有成熟的 SQLite + repository + 版本化迁移；状态用 Jotai；IPC 有 `window.desktopApi` + Zod 校验的标准范式。唯一的新增依赖是富文本编辑器（Tiptap），其余全部复用现有模式。

已确定的产品决策：
- **编辑器形态**：Notion 风格块编辑 WYSIWYG（基于 Tiptap v3 / ProseMirror）
- **存储**：SQLite 新增 `notes` 表（全局，像 `conversations` 一样与 workspace 解耦）
- **组织**：多文档 + 侧栏列表/树导航

## 关键架构事实（已验证）

- DB 是模块级单例：`apps/desktop/electron/chat/app-state.ts` 的 `getDatabase()`；持久化 helper 放此文件，handler 注册放独立 `*-service.ts`。
- `AgentsDatabase` 接口 + repo 构造在 `packages/db/src/sqlite.ts`；迁移用 `PRAGMA user_version` 版本化，见 `packages/db/src/migrations.ts`，当前 `CURRENT_SCHEMA_VERSION = 8`。
- IPC 校验用 `registerHandler(ipc, channel, zodSchema, handler)`（`apps/desktop/electron/ipc/ipc-schemas.ts`），已有 `idSchema` / `isoTimestampSchema`。
- Tiptap 尚未安装。
- 测试：jsdom（`apps/desktop/vitest.config.ts`，`setupFiles: ./src/test/setup.ts`）；DB 测试用真实 `node:sqlite` `DatabaseSync` 跑临时文件。
- 右侧面板各 view 用 `xxxEverActive` 标志 + `visibility:hidden` 保活挂载（见 git/pdf/terminal 三处）。

## 依赖选型（Tiptap v3 stable，renderer-only，放 `apps/desktop` devDependencies）

Tiptap v3 于 2025-07 发布 stable。所有 `@tiptap/*` 锁同一 minor（lockstep 发布，混版会导致 ProseMirror schema 重复）。

v3 关键变化：多个独立扩展包合并为聚合包；tippy.js 移除，菜单系统改用 `@floating-ui/dom`；`BubbleMenu`/`FloatingMenu` 导入路径改为 `@tiptap/react/menus`；`shouldRerenderOnTransaction` 默认关闭（性能更好，UI 更新走 `editor.on('update')` 事件）。

- 核心：`@tiptap/react`、`@tiptap/core`、`@tiptap/pm`、`@tiptap/starter-kit`
- 聚合扩展包（v3 合并）：`@tiptap/extensions`（含 `Placeholder`、`Focus`、`UndoRedo`、`Dropcursor`、`Gapcursor`、`CharacterCount`）、`@tiptap/extension-list`（含 `BulletList`、`OrderedList`、`ListItem`、`ListKeymap`、`TaskList`、`TaskItem`）
- 独立扩展：`@tiptap/extension-link`、`@tiptap/extension-underline`
- 菜单定位：v3 内置 `@floating-ui/dom`（需安装为 peer dep）；`BubbleMenu`/`FloatingMenu` 从 `@tiptap/react/menus` 导入
- 斜杠菜单：`@tiptap/suggestion`（v3 仍可用，`char:"/"`），render 回调需写适配层将 Floating UI 定位接到项目已有的 `@base-ui-components/react` 弹层，管理 `{ onStart, onUpdate, onKeyDown, onExit }` 生命周期
- 块拖拽手柄：`@tiptap/extension-drag-handle-react`（v3 官方）；若不稳定可降级为仅靠侧栏 `notes:move` 重排文档

**内容存 Tiptap JSON**（`editor.getJSON()`），与现有 `content_json` 列范式一致；JSON 无损往返、利于未来 `prosemirror-markdown` 导出 `.md`。v3 路线图含 `renderMarkDown()` / `parseMarkDown()` 原生支持，届时可直接使用。

## 数据模型

`packages/shared/src/notes.ts`（从 `index.ts` 重导出）：`NoteRecord` / `NoteSummary` / `CreateNotePayload` / `UpdateNotePayload` / `MoveNotePayload`，`NoteKind = "note" | "folder"`。

`notes` 表（同时加进 `schema.ts` 的 `createSchemaSql()` 与新迁移 v9 `ensureNotesTable`）：

```sql
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  parent_id TEXT,                         -- 可空，自引用树；NULL=根
  kind TEXT NOT NULL DEFAULT 'note',      -- 'note' | 'folder'
  title TEXT NOT NULL,
  content_json TEXT,                      -- Tiptap doc JSON；folder 为 NULL
  icon TEXT,
  sort_order REAL NOT NULL DEFAULT 0,     -- 分数索引，重排不用改全部兄弟
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_opened_at TEXT,
  FOREIGN KEY (parent_id) REFERENCES notes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_notes_parent_sort ON notes(parent_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at);
```

- `migrations.ts`：`CURRENT_SCHEMA_VERSION` → 9，追加 `{ version: 9, apply: ensureNotesTable }`。
- 列表查询（`listSummaries`）**只选轻量列，绝不取 `content_json`**。空文档初值 `{"type":"doc","content":[{"type":"paragraph"}]}`。
- `ON DELETE CASCADE` 依赖 `PRAGMA foreign_keys = ON`（SQLite 默认关闭）。实施时检查现有连接初始化是否已开启；若未开启，在 `getDatabase()` 初始化后执行 `PRAGMA foreign_keys = ON`。如果开启 pragma 影响范围过大，则放弃 CASCADE，改为 repository 层应用级递归删除。
- `archived_at` 列已移除——阶段 1-5 不涉及归档功能，按预发布策略不留未使用字段，后续需要时通过迁移添加。
- **搜索前瞻**：当前不实现全文搜索，但 schema 设计不阻碍后续添加 FTS5 虚拟表（`notes_fts`）或 `title` 上的额外索引。

## 后端

- **Repository**：`packages/db/src/repositories/note-repository.ts`（接口）+ `sqlite-note-repository.ts`（实现，参考 `sqlite-conversation-repository.ts`，prepared statements，`mappers.ts` 加 `mapNote`/`mapNoteSummary`）。接口含 `listSummaries / getById / upsert / updateContent / rename / move / touchOpened / delete`。delete 先删子节点再删本行（FK pragma 可能关闭）。
- 接入 `packages/db/src/sqlite.ts` 的 `AgentsDatabase`，从 `repositories/index.ts` 导出。
- **主进程 helper**：`app-state.ts` 增 `listNotes / getNote / createNote / updateNote / renameNote / moveNote / touchNoteOpened / deleteNote`，复用 `getDatabase()`，生成 `crypto.randomUUID()` 与 ISO 时间戳。
- **IPC service**：`apps/desktop/electron/notes/notes-service.ts` 导出 `registerNotesHandlers(ipc)`，仿 `registerChatHandlers`。通道：`notes:list/get/create/update/rename/move/delete`。Zod：id 用 `idSchema`，title `z.string().max(512)`，`contentJson` 用 `z.object({ type: z.string() }).passthrough()`（比 `z.unknown()` 更严格，至少保证是含 `type` 字段的对象，防止存入非 JSON 对象的垃圾数据；Tiptap 文档结构的完整校验仍由 renderer 侧持有）。无需流式事件。
- 在 `main.ts` 注册（紧挨现有 `registerChatHandlers` 的 import 与调用）。
- **preload**：`preload.ts` 的 `desktopApi` 增 `notesList/notesGet/notesCreate/notesUpdate/notesRename/notesMove/notesDelete`（`ipcRenderer.invoke`），从 `@cocurdex/shared` 导入 payload 类型。

## 前端 feature 结构 `apps/desktop/src/features/notes/`

每文件 < 400 行；`index.ts` 只导出布局所需（`NotesView` 等）。

```
notes/
  index.ts
  notes-store.ts        // jotai atoms + atom(null, write) 动作
  notes-ipc.ts          // window.desktopApi.notes* 的类型化薄封装
  notes-view.tsx        // <NotesSidebar/> + <NoteEditor/> 分栏
  sidebar/ notes-sidebar.tsx, note-tree-item.tsx, index.ts
  editor/  note-editor.tsx, use-note-autosave.ts, extensions.ts,
           slash-command.ts, slash-command-menu.tsx, index.ts
```

store（仿 `pdf-reader-store.ts`）：`noteSummariesAtom`、`activeNoteIdAtom`、`activeNoteAtom`（按需加载 body）、`notesLoadingAtom`、`noteSaveStatusAtom`、`notesRevealNonceAtom`；动作 `loadNoteSummariesAtom / openNoteAtom / createNoteAtom / deleteNoteAtom`。

**`note-editor.tsx`（性能关键）**：
- `useEditor({ extensions: buildNoteExtensions(), immediatelyRender: false })` — `immediatelyRender:false` 必须，否则 jsdom/无 DOM 下抛错。
- 不要把 `content` 响应式传入；切换 `activeNoteId` 时在 effect 里 `editor.commands.setContent(json, false)`（`false`=不触发 update），用 ref 守卫避免给刚离开的文档误存。
- 自动保存（`use-note-autosave.ts`）：监听 `editor.on('update')`，debounce ~600ms 调 `notesIpc.update`，更新 `noteSaveStatusAtom`；卸载与切文档时 flush，用 ref 持有最新 `noteId` 正确归属。
- title 用受控 `<input>`（不进 Tiptap 文档），debounce 调 `notesIpc.rename`。
- 复用 `EmptyState`/`Spinner`、`Text size=...`、`rounded-*`、shadcn 组件。

斜杠菜单：`slash-command.ts` 用 `Suggestion({char:"/"})`，items = heading1-3 / bullet / ordered / task / quote / codeBlock / divider，`command` 走 `editor.chain().focus().deleteRange(range).<setter>().run()`；过滤逻辑抽成纯函数便于测试。`render()` 回调需实现 `{ onStart, onUpdate, onKeyDown, onExit }` 适配层，将 Floating UI 的定位能力桥接到 base-ui 的 Popover 组件（v3 已移除 tippy.js，菜单定位统一用 Floating UI）。

## 右侧面板接线

1. `right-editor-panel-store.ts`：`RightPanelView` 联合加 `"notes"`，`DEFAULT_TAB_ORDER` 插入 `"notes"`（建议在 `"editor"` 后）。
2. `view-switcher-tabs.tsx`：`TAB_REGISTRY` 加 `notes: { id:"notes", icon: NotebookPen, labelKey:"actions.showNotes" }`（`lucide-react` 的 `NotebookPen`），并把 `"notes"` 加进 `handleValueChange` 的合法值枚举。
3. `right-editor-panel.tsx`：新增 `notesEverActive` 保活层，仿 PDF 块（`activeView==="notes"` 时 `visible`，否则 `invisible pointer-events-none`）。notes 全局、无需 `activeWorkspace` 守卫。`NotesView` 用 `React.lazy` 懒加载，首次激活才进 renderer chunk。
4. i18n：`locales/{en-US,zh-CN}/editor.json` 加 `actions.showNotes`（"Show notes" / "显示笔记"）；feature 内文案（placeholder、斜杠项、空态）新建 `notes` 命名空间。改完跑 `pnpm --filter @cocurdex/desktop i18n:extract` 与 `i18n:types`。

## 分阶段实施（每阶段可独立验证，TDD 优先）

1. **数据层 + IPC（无 UI）**：shared 类型、`notes` 表 + 迁移 v9（含 FK pragma 确认）、repository + sqlite 实现 + mappers、接入 `AgentsDatabase`；`app-state.ts` helper、`notes-service.ts` + Zod、`main.ts` 注册、preload 方法 + 类型增强。测试：repository（建/取/列表不含 body/重命名/move 重排/delete 级联/JSON 往返）+ schema/迁移 v8→v9 + Zod 校验（非法 id、超长 title、非法 contentJson）。`pnpm --filter @cocurdex/db test`；typecheck + devtools 里 `window.desktopApi.notesList()`。
2. **基础编辑器 tab + 多文档导航**：安装 Tiptap v3 依赖；接 `"notes"` 到 union/registry/i18n/保活层；`NotesView` 含 `NotesSidebar`（树、create/open/rename/delete、summaries、EmptyState）+ `NoteEditor`（StarterKit + 自动保存 + title）。测试：store 动作（mock `desktopApi`）、autosave debounce 合并/flush。验证：tab 出现、多笔记切换保活、输入重启后保留、删除级联。
3. **Notion 块增强**：`Placeholder`（从 `@tiptap/extensions` 导入）、`TaskList`/`TaskItem`（从 `@tiptap/extension-list` 导入）、斜杠扩展 + 菜单（`@tiptap/suggestion` + Floating UI → base-ui 适配层）、拖拽手柄、underline/link。验证：`/` 插入块、拖拽重排、勾选框。
4. **（可选后续）**：文件夹层级 UI（分数索引 + `notes:move`）、`.md` 导出（等 v3 原生 `renderMarkDown()` 或 `prosemirror-markdown`）、跨窗口同步事件、云同步、全文搜索。

## 测试要点

- 高价值纯单测（node）：repository、schema/迁移、Zod schema、store 动作、`use-note-autosave`（fake timers）。
- 组件（jsdom）：`note-editor` 必须 `immediatelyRender:false`，只断言挂载/内容/切 noteId 调一次 setContent 且不误存上一篇；**不断言**像素坐标、拖拽、斜杠菜单定位（jsdom 下坐标 API 为 no-op）。`notes-sidebar` 空态/列表/新建。`src/test/setup.ts` 按需补 `ResizeObserver`/`IntersectionObserver` shim（先看已有再加）。

## 风险与权衡

- **体积**：Tiptap v3 + ProseMirror ≈ 200–300 KB gzip；Electron 可接受，用 `React.lazy` 懒加载隔离初始 chunk，`@tiptap/pm` 去重避免双份 ProseMirror。
- **jsdom/SSR**：到处 `immediatelyRender:false`；坐标/选区 API no-op，相关逻辑移出断言。
- **自动保存冲突**：单窗口单写者，主要风险是快速切文档误存（ref 归属 + flush 解决）与 save/delete 竞争（`deleteNoteAtom` 清 pending debounce）。`updated_at` last-writer-wins，足够；未来多窗口再加广播失效。
- **大文档**：600ms debounce 让 `getJSON()`+`stringify` 成本可忽略；`listSummaries` 不含 body。
- **`.md` 导出兼容**：存 JSON 保留导出空间；v3 路线图含原生 `renderMarkDown()` / `parseMarkDown()`，届时可直接使用；后续若加自定义节点须同时提供 markdown 序列化器。
- **商业化前瞻**：SQLite 结构化存储天然支持未来云同步（增量同步基于 `id` + `updated_at`）、存储配额、付费功能（版本历史、回收站、团队共享）。Tiptap JSON + yjs 绑定为协作编辑提供成熟路径。当前 v9 schema 不预留云相关字段，后续迁移添加。

## 端到端验证

- `pnpm --filter @cocurdex/db test`、`pnpm --filter @cocurdex/desktop test`（renderer + IPC schema）。
- 变动文件按 AGENTS.md：相关包 tsc 类型检查 + `pnpm exec biome check --write <变动文件>`；i18n 改动跑 extract/types。
- 桌面应用手动验证（**不要**自己跑 `dev`，完成后交用户验证）：右侧出现笔记 tab → 新建/切换/删除多篇笔记 → 输入并重启确认持久化 → `/` 斜杠菜单插入块 → 块拖拽重排。
