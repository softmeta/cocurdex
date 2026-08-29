# Cocurdex

## 语言

所有代码、文档和提交信息都必须以英文为主要语言。

## 平台优先级

这是一个跨平台应用。设计、实现、验证和问题排查时，优先考虑 macOS，其次考虑 Windows，Linux 放在最后。

## 联网搜索与官方文档

涉及近期信息、依赖版本、API 行为、平台限制、错误排查、配置语法或第三方工具用法时，要主动联网搜索并优先查阅官方文档、官方仓库、发布说明或权威规范；不要凭记忆猜测。

- 能通过官方文档确认的事项，先查官方文档，再给结论或改代码。
- 搜索结果之间冲突时，以官方来源和当前版本文档为准，并说明判断依据。
- 如果无法联网或官方文档缺失，要明确说明不确定性，并把结论限定为基于本地代码和已知上下文的推断。
- 对用户有成本、风险或长期维护影响的建议，必须先核实当前资料。

## 修改后校验

每次修改文件后，必须按顺序执行并修复所有问题：

1. **TypeScript 类型检查：** 运行相关包的类型检查，且只针对变动的 TypeScript 源文件。
2. **Biome 检查和格式化：**`pnpm exec biome check --write <变动文件>`

新增 `t("...")` 调用时，先跑 `pnpm --filter @cocurdex/desktop i18n:extract`，补齐 en-US / zh-CN 文案，再跑 `pnpm --filter @cocurdex/desktop i18n:types`。

## TDD 工作流

- 只对比较关键的纯函数等做 TDD
- UI、功能流程和快速变化的产品行为不强制 TDD，稳定后再补回归测试。

## 测试价值与稳定性

- 测试只覆盖稳定且重要的业务语义、关键算法 / 状态转换、协议 / 持久化边界和高风险回归；不要为覆盖率写测试。
- 不测试无业务约束的实现细节，如 `className`、DOM 层级、元素索引、内部调用顺序、简单字符串拼接或直通 getter；若这些本身是明确的视觉、a11y 或协议契约则例外。
- 测试应直接导入具体被测模块并只 mock 真实边界；避免通过宽 barrel 导入整棵模块树、mock 大对象或依赖无关模块初始化。
- 因正常重构、文案或 UI 迭代频繁破裂，且没有保护关键行为的测试，应删除或改写；不要为维持脆弱测试扭曲生产代码。

## 依赖安装

新增依赖时，尽量选择最新稳定版；除非用户明确要求或兼容性必须，不安装 prerelease、beta、alpha、canary 或已废弃版本。

## 开发服务器

不要运行 `pnpm --filter @cocurdex/desktop dev`。完成修改和校验后，告知用户自行验证桌面应用。

## 预发布变更策略

项目正式发布前，默认不要做权宜修复、临时补丁或兼容垫片。应从根因解决问题，直接调整底层设计、数据模型、API 或控制流。除非用户明确要求兼容层，否则移除过时路径，而不是为了兼容继续保留。

## 代码规模

避免过长代码行。编辑超过 400 行的代码文件时，先考虑拆分组件、hook、工具函数或测试夹具；除非拆分会降低可读性或扩大改动范围，否则优先拆分。此约束不适用于 `.md` 文件。

避免嵌套三元表达式。分支超过两层、分支内继续包含条件表达式，或需要来回匹配 `?` / `:` 时，改用具名变量、辅助函数、`if` 或查表映射。

## 代码组织

同一个功能块的代码需要内聚到同一个文件夹里。

- 仅被当前功能使用的组件、hook、工具函数、类型和测试夹具，应放在该功能文件夹内。
- 通用的、共享的能力，应按使用范围逐层冒泡到外层文件夹，避免过早放到全局目录。
- 跨 `apps` 复用的能力，应抽到 `packages` 里，而不是在 app 之间互相引用。
- 每个文件夹都应提供 `index.ts` 或 `index.tsx`，只导出对外依赖。

## 导入

跨功能、跨目录或跨包导入时，优先使用路径别名和包入口。

- `apps/desktop/src` 内部跨功能导入应使用 `@/*`，例如 `@/i18n`、`@/features/settings`。
- 跨包导入应使用 `@cocurdex/*` 包入口，例如 `@cocurdex/shared`。
- 不要从业务代码直接导入 `packages/*/src/*`、`apps/*/src/*`，也不要用 `../../../..` 绕过入口。
- 同一功能文件夹内的近距离协作，保留 `./` 或少量 `../`。
- 入口缺少所需符号时，先补入口导出；不要用深路径规避模块边界。

## Barrel 文件（`index.ts`）使用规范

`index.ts` 只是对外入口，不是内部总线：

- 子文件夹内部互相引用，走相对路径，不走自家 barrel 文件，避免循环依赖。
- 同一 barrel 文件暴露的兄弟文件之间，禁止再导入这个 barrel 文件。
- 优先具名重新导出，慎用 `export *`，避免副作用和无关模块被求值。
- 副作用 / 初始化 / `*.test.ts` / `*.stories.tsx` / `*.css` 不进 barrel 文件。
- barrel 文件顶层禁止可执行代码，如 `console.log`、`registerXxx()`、顶层 `await`。
- main / preload / renderer 不共享同一个 barrel 文件，避免跨进程依赖泄漏。
- 测试里 mock 具体源文件，不 mock barrel 文件。
- 测试需要的内部符号，直接从具体模块导入，不要为测试往 barrel 文件加导出。

经验法则：**跨领域引用 = barrel 文件；同领域引用 = 相对路径。**

### barrel 文件不导出重依赖

重依赖（编辑器、终端、diff / 树渲染、语法高亮、图表、PDF 等大包）不进 barrel 文件，否则一次入口导入就把它拉进启动 bundle，不报错、只是变慢。

- 从功能子入口导入，如 `@/components/markdown-body-editor`；这是入口，不算深路径。
- 受 UI 门控的重组件，功能内提供 `*-lazy.tsx`（`lazy` + `Suspense`），barrel 文件导出包装而非组件本身。
- 轻量常量 / 纯函数与重依赖同文件时，拆出独立模块再导出。
- 启动路径不直接调用重依赖模块；用事件反转依赖，重模块加载后自己订阅（见 `lib/theme-events.ts`）。
- 以入口 chunk 大小为准，不靠感觉。

### 循环依赖

会炸的是跨领域双向依赖（`features/A` ↔ `features/B`），运行时表现为 `undefined`；协调逻辑上移到 `app/layout`，不要让两个功能互相 import。

检查 `pnpm --filter @cocurdex/desktop lint:cycles`（手动跑，未接 CI）。新环一律修掉；结构性递归才考虑加进 `scripts/check-cycles.mjs` 的 `ALLOWED_CYCLES` 并附原因。

## 代码注释

禁止写注释。不要新增 `//`、`/* */`、JSX `{/* */}` 或 JSDoc。意图用命名、类型、结构和测试表达。不要为解释例外、补偿既有注释，也不要顺手扩写旁边的旧注释。工具强制要求的指令（如文件级 lint disable）除外。

## UI 一致性与对齐

写 UI 时优先保证**视觉与交互的一致性和统一性**。同一产品表面里，能共用一套规则的就共用，非必要不搞特殊化。

- **颜色、交互态、尺寸、间距、icon、字号、圆角、阴影**等：应统一的都统一；不要在邻近场景各自发明一套 hover / active / disabled / focus 或按钮/图标尺寸。
- **非必要不特殊化**：同一类控件在不同布局模式（如 float / pinned）、不同面板或不同路由下，默认共用同一套尺寸、间距和交互。确有产品理由必须例外时，用命名或结构把例外收成可识别的封装，并在 PR 里说明原因；不要在代码旁加注释。
- **优先复用再封装**：能用现有 `components/ui` 或功能内组件就用现有组件；重复出现的结构 + 样式 + 行为抽成组件，而不是复制 class 或手写第二套近似控件。
- **对齐是基本要求**：水平对齐（同一行控件基线/中线、列起始边、右侧操作列）和垂直对齐（相邻区块顶/中/底、工具栏与内容区、分栏 chrome 与内容）都要做到；切换状态时不要因 padding、icon 尺寸或条件渲染导致内容上下/左右跳动。
- 布局变化（侧栏开关、pin/unpin、折叠展开）后，对照检查：header 高度是否稳定、相邻列分割线是否贯通、同类 icon 是否同尺寸、可点区域与视觉重心是否仍对齐。

## UI 组件

构建 UI 时优先使用已安装的 shadcn/ui 组件，不手写等价基础控件、菜单、弹窗、表单控件或反馈组件。

- 如果需要的 shadcn 组件尚未安装，先考虑通过 shadcn CLI 添加组件，再基于组件做项目内样式适配。
- 只有 shadcn 没有合适组件、组件组合会降低可读性，或需求是项目特有复合组件时，才手写自定义 UI。
- 手写自定义 UI 前，先确认现有 `apps/desktop/src/components/ui` 中没有可复用组件。
- UI 中能复用的部分应抽取为公共组件、工具函数或样式常量。
- 反馈类场景复用 `EmptyState` 和 `Spinner`，不要自己拼空态或加载态。
- `Dialog` 的尺寸通过 `DialogContent` 的 `size` 变体（`default`/`compact`/`wide`）控制，不要在调用处叠加 `max-w-[..] p-X rounded-N` 等覆盖类。
- 排版优先用 `<Text size="meta|body|display|...">` 和项目命名字号；禁止新增 `text-[Npx]`。
- UI 必须考虑 RTL。布局、间距、定位、圆角、图标方向和文本对齐优先用逻辑方向，确实绑定物理方向时才用 `left` / `right`。

### 非必要不改 `components/ui`（优先封装）

**非必要不要直接改 `apps/desktop/src/components/ui` 源码。** 产品约定、默认外观、业务组合放在 **`apps/desktop/src/components/app/`**（如 `AppSelect`、`AppSearchableSelect`）或 CSS token 映射里，业务只依赖封装与 token。

| 层级 | 路径 | 职责 |
|------|------|------|
| 底层 | `components/ui/` | shadcn 源码，非必要不改 |
| 产品封装 | `components/app/` | 基于 ui 的统一 API / 默认样式 / 选项协议 |
| 领域 / 功能 | `components/chat/`、`features/*` 等 | 场景复合，不是通用 ui 封装 |

| 优先做（由上到下） | 才改 `components/ui` |
|--------------------|----------------------|
| 语义 token / `theme-tailwind` 映射 | 上游 bug、a11y 必须在 primitive 修 |
| `components/app` 封装 props 与默认行为 | 官方无 `className` / `render` / 组合扩展点 |
| 业务侧薄 `className`（仍优先收回 `app/`） | 升级 shadcn 后 API 变了，必须跟源码对齐 |
| 组合现有 ui 组件 | — |

要求：

- 基于 `ui` 的全 app 复用封装放进 `components/app/`，经 `components/index.ts` 再导出；业务优先 `import { AppSelect } from "@/components"`（或 `@/components/app`）。
- `app/` 内部同文件夹用相对路径，禁止再 import 自家 barrel 造成环。
- 领域复合（markdown、chat shell 等）不要塞进 `app/`。
- 不要为「绝不碰 ui」复制一整份 Button/Select；也不要在业务里到处打补丁却不抽封装。
- 不要把产品逻辑堆进 `components/ui`。
- 若必须改 ui：改动保持最小、可回滚，并在 PR 里用英文说明原因（为何封装不够）。不要在源码里加注释。

### 外观 token（业务优先，禁止 Tailwind 默认外观阶梯）

**新增或修改业务 UI / App 封装时：外观用项目语义 token，不要用 Tailwind / shadcn 自带外观阶梯。**  
原则是 **布局用 Tailwind，外观用业务 token**。

| 用业务 token | 可以用 Tailwind 原语 |
|--------------|----------------------|
| 圆角、字号、颜色 / 表面、产品语义色 | 布局：`flex` / `grid` / `gap-*` / `min-w-0` / `truncate` |
| chat / editor / sidebar 等产品表面 | 定位与尺寸工具：`w-full`、`absolute`、`size-*`（图标等） |
| 控件圆角与层级（control / card / …） | 无对应 token 的纯布局 spacing（勿为每个 `p-2` 硬造 token） |

**禁止**在业务与 App 封装中新增：

- 圆角：`rounded-sm/md/lg/xl/2xl/…`、`rounded-[Npx]`（用下表语义档）
- 字号：`text-xs/sm/base/…` 当设计字号、`text-[Npx]`（用 `Text` / 命名字号）
- 颜色：随意 `bg-zinc-*` / `text-gray-*` 等调色板；优先 `bg-background`、`text-muted-foreground`、以及 `bg-chat-*` / `text-editor-*` 等产品 token

**例外：**

- `components/ui` 可保留 shadcn 类名（升级友好）；视觉由 `theme-tailwind` 把 shadcn 半径等映射到语义档。
- 确需一次性设计值时，优先先加语义 token 再引用；不要用注释登记例外。

#### 圆角语义档（`theme-tailwind.css`，写死 px）

| Token | 值 | 用途 |
|-------|-----|------|
| `rounded-micro` | 2px | checkbox、tooltip 箭头尖、极细 chrome |
| `rounded-dense` | 4px | 密排 glyph、kbd 小块、很小的 icon 热区 |
| `rounded-control` | 6px | 按钮、输入、列表行、menu item、select trigger |
| `rounded-card` | 12px | 卡片、raised 面、App 封装的下拉 content |
| `rounded-panel` | 14px | Dialog / 大面板 / 消息气泡壳 |
| `rounded-overlay` | 20px | 命令面板、超大浮层 |
| `rounded-full` | 圆 | 头像、状态点、真 pill/chip |
| `rounded-none` | 0 | 分段接缝、贴边 chrome |

shadcn 映射（仅服务 `components/ui`）：`sm→dense(4)`、`md/lg→control(6)`、`xl→card`、`2xl→panel`、`3xl/4xl→overlay`。  
方向圆角（`rounded-tr-md` 等）可保留，数值跟对应 shadcn 档走映射。

### 选择器 / 下拉（必须统一）

「点 trigger → 弹出列表 → 选一项（可选搜索）」在全应用内**禁止**再手写 `Popover + Command`、`CommandItem + AppDropdownCheck`，或业务内自建第二套 Combobox。

| 场景 | 用 | 底层 |
|------|----|------|
| **可搜索**单选（模型、语言、字体、分支、workspace…） | `AppSearchableSelect`（`components/app`，经 `@/components`） | shadcn Base `components/ui/combobox` |
| **不可搜索**短列表单选（agent、权限、thinking、设置页…） | `AppSelect` / `SettingsSelect` | shadcn Base `components/ui/select` |
| 复合菜单内单选（与 checkbox / submenu / 多段 action 混用） | `AppDropdownRadioList` | shadcn DropdownMenu Radio |
| 全局命令面板 / 编辑器 `@` `/` 补全 | `Command` 或现有 mention/slash 菜单 | 不是 value-select，勿改成 Combobox/Select |
| 页面内表格/列表过滤条 | 普通 `Input` | 不是下拉 |

扩展可搜索选择时：优先给 `components/app` 的 `AppSearchableSelect` 加 props；只有官方 Combobox 能力不够时，才在 `components/ui/combobox` 上薄扩，并仍通过 `app/` 出口给业务用。业务代码不要直接拼 `ComboboxTrigger` + `ComboboxList` 除非在 `app/` 封装层内。

扩展不可搜索选择时：优先给 `components/app` 的 `AppSelect` 加 props；只有官方 Select 能力不够时，才在 `components/ui/select` 上薄扩。业务代码不要直接拼 `SelectTrigger` + `SelectContent` 除非在 `app/` 封装层内。

## 图标

图标必须保持尺寸一致。同一行或同一场景内使用相同 `size` 或 `className`，不要混用默认尺寸。详见「UI 一致性与对齐」。

- 优先使用 `lucide-react` 提供的图标。
- 统一使用 `className="size-4"`、`size-3.5` 或 `size-5`。
- 状态图标用条件渲染，不用 `opacity-0` 占位。

## className

`className` 要优先方便从浏览器 DevTools 复制 class 后回到代码里搜索定位。

- 一次性样式直接写完整字面量字符串；不要用 `+` 或模板字符串把 class token 拆碎。
- 条件样式用项目内 `cn`，静态 base 放在同一个完整字符串参数里，后面只追加条件 class；避免把静态 class 拆成多个字符串参数，也避免在 `className` 里写三元表达式。
- 重复样式提取 React 组件，封装结构 + 样式 + 行为；不要把 `className` 提取成模块级字符串常量。
- 不保留 class 常量；DOM 字符串拼装、第三方覆盖等特殊场景也优先用函数或组件生成完整 class 字符串。只有组件和函数都不适合时，才说明原因后例外处理。
- 避免超长单行；类名需要分段组织时用组件拆结构，不要靠拆字符串牺牲可搜索性。

来源：Tailwind CSS 官方文档《Styling with utility classes — Managing duplication》

## React：Hook 调用规范

Hook（以 `use` 开头的函数）只能在 React 渲染函数组件时调用。违反规则会触发 `Hooks can only be called inside the body of a function component`。

- 只在函数组件或自定义 Hook 的顶层调用 Hook，且在任何提前 `return` 之前。
- 不在循环、条件分支、嵌套函数内调用 Hook。
- 不在条件 `return` 之后调用 Hook。
- 不在事件处理器内调用 Hook。
- 不在 class 组件内调用 Hook，改写成函数组件。
- 不在传给 `useMemo`、`useReducer`、`useEffect` 的回调里调用 Hook。

需要条件化时，把条件移到 Hook 内部，而不是把 Hook 放进条件里。

依赖一致性：保证 `react` 与 `react-dom` 版本匹配，且整个应用只有一份 React 副本，避免重复或版本错配导致同类报错。

开启 Biome 的 `useHookAtTopLevel` 规则自动捕获违规。

来源：React 官方文档《Rules of Hooks》
<https://react.dev/warnings/invalid-hook-call-warning>

## React：你可能并不需要 Effect

`useEffect` 只用于同步外部系统，例如 DOM、网络、定时器、订阅、浏览器 API 或非 React 组件。没有外部系统时，不要先写 Effect。

- 不用 Effect 根据 props / state 推导渲染数据，直接在 render 中计算。
- 不用 Effect 缓存纯计算结果；测量确认昂贵时才用 `useMemo`。
- 不用 Effect 处理用户操作；把逻辑放回触发事件。
- 不用 Effect 镜像 state；删除冗余状态或状态提升。
- 不用 Effect 因组件身份 prop 变化重置本地状态；优先拆分组件并用稳定 `key` 重置。
- 不因 props 变化就在 Effect 里调整 state；先尝试 render 推导，必要时用带保护条件的前值比较。
- 不写靠 state 更新互相触发的 Effect 链；能 render 计算就直接算，其余放回最初事件批量更新。
- 不在本地 state 变化后用 Effect 通知父组件；同一事件里同时更新，或改为受控组件。
- 能状态上移或抽全局状态，然后在事件处理函数里做的，就在事件处理函数里做，非必要不新增 effect

新增 `useEffect` 前，先说明要同步的外部系统，以及为什么不能用 render 计算、事件处理器、`key` 重置、状态提升或记忆化替代。

来源：React 官方文档《You Might Not Need an Effect》
<https://react.dev/learn/you-might-not-need-an-effect>

## Agent skills

### Product knowledge tracker

PRDs, specs, notes, and issues are private by default under app-owned storage. Writing to workspace `.cocurdex/` requires an explicit user request to publish there. See `docs/agents/issue-tracker.md` and `docs/agents/cocurdex-layout.md`.

Skills are **namespaced** `cocurdex-*` to avoid clashing with other global skills.

Main flow: `/cocurdex-grill` → `/cocurdex-prd` → `/cocurdex-spec?` → `/cocurdex-issue` → `/cocurdex-ship`. Router: `/cocurdex-ask`. Free notes: `/cocurdex-note`. Links: `/cocurdex-link`. **todo** / **ticket** are aliases for **issue** (same selected private or explicitly published issue pool).

Issue **structure** (init / list / create / move / validate) goes through `@cocurdex/cli` (`cocurdex issue …`); skills must not invent issue ids or rewrite status by hand.

**Distribute product skills** from `packages/product-skills` via Settings → Skills or `cocurdex skills install --scope project|global` (no auto-install). See `docs/agents/cocurdex-layout.md`.

### Domain docs

Use the single-context layout. See `docs/agents/domain.md`.
