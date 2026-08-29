# Kanban Board Feature

## Context

Cocurdex 右面板目前有 6 个 tab（git / editor / notes / browser / pdf / terminal）。用户需要在右面板新增一个看板（Kanban）功能，用于任务管理。数据模型采用 Board → Column → Card 三层结构，拖拽使用 @dnd-kit/core，视图作为右面板的第 7 个 tab。

整体架构完全复用 notes 功能的端到端模式：shared types → DB schema + repository → main process IPC → renderer store + view。

---

## Phase 1: Shared Types

**文件**: `packages/shared/src/kanban.ts`（新建）

定义三个核心类型和 payload：

```
KanbanBoardRecord   { id, title, icon?, createdAt, updatedAt }
KanbanColumnRecord  { id, boardId, title, color?, sortOrder, createdAt }
KanbanCardRecord    { id, columnId, boardId, title, description?, color?, sortOrder, createdAt, updatedAt }
```

Payload 类型：`CreateBoardPayload`, `UpdateBoardPayload`, `CreateColumnPayload`, `MoveColumnPayload`, `CreateCardPayload`, `UpdateCardPayload`, `MoveCardPayload`

从 `packages/shared/src/index.ts` 导出。

---

## Phase 2: Database Layer

### 2a. Schema — `packages/db/src/schema.ts`

在 `createSchemaSql()` 末尾追加三张表：

- `kanban_boards` (id TEXT PK, title, icon, created_at, updated_at)
- `kanban_columns` (id TEXT PK, board_id FK → boards ON DELETE CASCADE, title, color, sort_order REAL, created_at)
- `kanban_cards` (id TEXT PK, column_id FK → columns ON DELETE CASCADE, board_id FK → boards ON DELETE CASCADE, title, description, color, sort_order REAL, created_at, updated_at)
- 索引：`idx_kanban_columns_board_sort(board_id, sort_order)`, `idx_kanban_cards_column_sort(column_id, sort_order)`

### 2b. Migration — `packages/db/src/migrations.ts`

`CURRENT_SCHEMA_VERSION` 从当前值 +1。新增 migration：执行上述三条 CREATE TABLE + 索引。

### 2c. Repository

- 接口：`packages/db/src/repositories/kanban-repository.ts`（新建）
  - `listBoards()`, `getBoard(id)` (返回 board + columns + cards), `createBoard()`, `updateBoard()`, `deleteBoard()`
  - `createColumn()`, `updateColumn()`, `moveColumn()`, `deleteColumn()`
  - `createCard()`, `updateCard()`, `moveCard()`, `deleteCard()`
- 实现：`packages/db/src/repositories/sqlite-kanban-repository.ts`（新建）
- 在 `packages/db/src/sqlite.ts` 的 `AgentsDatabase` 接口和 `createAgentsDatabase()` 中注册
- 从 `packages/db/src/repositories/index.ts` 导出

---

## Phase 3: Main Process IPC

### 3a. Schemas — `apps/desktop/electron/kanban/kanban-schemas.ts`（新建）

Zod schemas：boardId, createBoard, updateBoard, createColumn, moveColumn, createCard, updateCard, moveCard 等。

### 3b. Service — `apps/desktop/electron/kanban/kanban-service.ts`（新建）

注册 IPC handlers（复用 `registerHandler` 模式）：
- `kanban:listBoards`, `kanban:getBoard`, `kanban:createBoard`, `kanban:updateBoard`, `kanban:deleteBoard`
- `kanban:createColumn`, `kanban:updateColumn`, `kanban:moveColumn`, `kanban:deleteColumn`
- `kanban:createCard`, `kanban:updateCard`, `kanban:moveCard`, `kanban:deleteCard`

### 3c. 集成

- `apps/desktop/electron/kanban/index.ts` — 导出 `registerKanbanHandlers`
- `apps/desktop/electron/main.ts` — 在 `app.on('ready')` 中调用 `registerKanbanHandlers(ipcMain)`
- `apps/desktop/electron/preload.ts` — 暴露 `kanbanListBoards`, `kanbanGetBoard`, `kanbanCreateBoard` 等方法
- `apps/desktop/src/lib/types.ts` — `DesktopApi` 接口加对应方法签名
- `apps/desktop/src/lib/ipc.ts` — 加 fallback stub（测试/SSR 用）

---

## Phase 4: Renderer — Feature Module

### 4a. 目录结构

```
apps/desktop/src/features/kanban/
├── index.ts                    # barrel 导出
├── kanban-ipc.ts              # desktopApi 薄封装
├── kanban-store.ts            # jotai atoms
├── kanban-view.tsx            # 主视图（sidebar + board area）
├── sidebar/
│   ├── index.ts
│   └── kanban-sidebar.tsx     # board 列表 sidebar
├── board/
│   ├── index.ts
│   ├── kanban-board.tsx       # 看板主区域（DndContext）
│   ├── kanban-column.tsx      # 单列组件（SortableContext）
│   └── kanban-card.tsx        # 单卡片组件（useSortable）
└── dialogs/
    ├── index.ts
    ├── card-detail-dialog.tsx # 卡片详情编辑弹窗
    └── column-editor.tsx      # 列标题/颜色编辑
```

### 4b. Store — `kanban-store.ts`

Atoms:
- `kanbanBoardsAtom` — board 列表
- `activeKanbanBoardIdAtom` — 当前 board ID
- `activeKanbanBoardAtom` — 当前 board 完整数据（含 columns + cards）
- `kanbanLoadingAtom`

Write atoms:
- `loadKanbanBoardsAtom`, `openKanbanBoardAtom`
- `createKanbanBoardAtom`, `deleteKanbanBoardAtom`
- `createColumnAtom`, `moveColumnAtom`, `deleteColumnAtom`
- `createCardAtom`, `updateCardAtom`, `moveCardAtom`, `deleteCardAtom`

### 4c. 拖拽 — @dnd-kit

安装 `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`。

- `kanban-board.tsx`：`<DndContext>` + `<SortableContext>` 管理列排序
- `kanban-column.tsx`：`<SortableContext>` 管理列内卡片排序
- `kanban-card.tsx`：`useSortable()` hook
- `onDragEnd` 中调用 `moveCardAtom` / `moveColumnAtom` 写入 store → IPC → DB

### 4d. UI 复用

- `Card` 组件包裹卡片
- `ScrollArea` 做列内滚动
- `EmptyState` 做空 board / 空列提示
- `Badge` 做卡片标签
- `Dialog` 做卡片详情
- `ContextMenu` 做卡片/列右键菜单
- `GripVertical` (lucide) 做拖拽手柄
- `KanbanSquare` (lucide) 做 tab 图标

---

## Phase 5: 右面板集成

改动文件（均为小改动）：

1. **`right-editor-panel-store.ts`** — `RightPanelView` 加 `"kanban"`, `DEFAULT_TAB_ORDER` 加 `"kanban"`
2. **`view-switcher-tabs.tsx`** — `TAB_REGISTRY` 加 kanban 项，`handleValueChange` 加 `"kanban"` 分支
3. **`right-editor-panel.tsx`** — lazy import `KanbanView`，加 `kanbanEverActive` 状态，加条件渲染块（复用 notes 的 visibility 切换模式）

---

## Phase 6: i18n

- 运行 `pnpm --filter @cocurdex/desktop i18n:extract`
- 补齐 en-US / zh-CN：tab label、空态文案、按钮文案、dialog 标题等
- 运行 `pnpm --filter @cocurdex/desktop i18n:types`

---

## Phase 7: Tests

按 TDD 流程，每个 phase 写对应测试：

- `packages/db` — repository 单元测试（CRUD + move sort_order）
- `apps/desktop/src/test/kanban/kanban-store.test.ts` — store atoms 测试
- `apps/desktop/src/test/kanban/kanban-board.test.tsx` — board 渲染 + 拖拽交互
- `apps/desktop/src/test/app/layout/view-switcher-tabs.test.tsx` — 更新现有测试，验证 kanban tab 出现

---

## Verification

1. `pnpm --filter @cocurdex/db test` — DB 层测试通过
2. `pnpm --filter @cocurdex/desktop typecheck` — 类型检查通过
3. `pnpm exec biome check --write` — lint 通过
4. `pnpm --filter @cocurdex/desktop test` — 全部测试通过
5. 用户手动验证桌面应用：
   - 右面板出现 kanban tab 图标
   - 可新建 board、添加列、添加卡片
   - 卡片可在列间拖拽，列可重排
   - 重启应用后数据持久化

---

## Skipped / Future

- 卡片截止日期、优先级、标签等扩展字段 — 当前只做 title + description + color
- 卡片关联 note 或 session — 后续需求
- 看板筛选/搜索 — 后续需求
- 看板导出 — 后续需求
