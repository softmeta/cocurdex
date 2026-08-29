# Desktop UI Shadcn Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用最小的 shadcn-style primitives 重做当前桌面端三栏 UI 的视觉层，让现有 app shell 更统一、更像桌面应用。

**Architecture:** 保留当前 `LeftSidebar`、`CenterPanel`、`RightEditorPanel` 与现有 feature 组件边界，只把内部视觉层迁移到统一的基础 UI primitives。基础组件放在 `apps/desktop/src/components/ui/`，业务组件继续留在原位置，避免把 UI 刷新变成结构重构。

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest, Testing Library

---

## File structure

### Create
- `apps/desktop/src/components/ui/button.tsx` — 统一按钮视觉与 variants
- `apps/desktop/src/components/ui/card.tsx` — 统一 panel/card 容器
- `apps/desktop/src/components/ui/badge.tsx` — 统一轻标签样式
- `apps/desktop/src/components/ui/separator.tsx` — 统一横向分隔线
- `apps/desktop/src/components/ui/scroll-area.tsx` — 统一滚动容器包装
- `apps/desktop/src/components/ui/textarea.tsx` — 统一输入区样式
- `apps/desktop/src/lib/utils.ts` — `cn` class 合并工具
- `apps/desktop/src/test/ui-refresh.test.tsx` — 新 UI 结构与关键文案 smoke test

### Modify
- `apps/desktop/src/app/layout/left-sidebar.tsx` — 切换到统一 shadcn-style primitives
- `apps/desktop/src/app/layout/center-panel.tsx` — 调整主工作区容器节奏
- `apps/desktop/src/app/layout/right-editor-panel.tsx` — 用 Card/Button 重组右栏
- `apps/desktop/src/features/sessions/new-session-card.tsx` — 重做 launcher panel
- `apps/desktop/src/features/chat/chat-composer.tsx` — 改用 Textarea / Badge / Button
- `apps/desktop/src/features/chat/chat-view.tsx` — 用 Card 承接消息面板
- `apps/desktop/src/features/editor/file-tree.tsx` — 用 Card 表达文件树 panel
- `apps/desktop/src/features/editor/editor-tabs.tsx` — 用 Card 表达 tabs panel
- `apps/desktop/src/features/editor/monaco-editor.tsx` — 用 Card 风格统一占位 editor
- `apps/desktop/src/features/editor/send-selection-button.tsx` — 改用统一 Button
- `apps/desktop/src/test/app-shell.test.tsx` — 如有必要，更新断言
- `apps/desktop/src/test/new-session-card.test.tsx` — 如有必要，更新断言
- `apps/desktop/src/test/right-editor-panel.test.tsx` — 如有必要，更新断言
- `apps/desktop/src/test/chat-composer.test.tsx` — 如有必要，更新断言

## Task 1: Add minimal shared UI primitives

**Files:**
- Create: `apps/desktop/src/components/ui/button.tsx`
- Create: `apps/desktop/src/components/ui/card.tsx`
- Create: `apps/desktop/src/components/ui/badge.tsx`
- Create: `apps/desktop/src/components/ui/separator.tsx`
- Create: `apps/desktop/src/components/ui/scroll-area.tsx`
- Create: `apps/desktop/src/components/ui/textarea.tsx`
- Create: `apps/desktop/src/lib/utils.ts`
- Test: `apps/desktop/src/test/ui-refresh.test.tsx`

- [ ] **Step 1: Write the failing UI primitive smoke test**

Create `apps/desktop/src/test/ui-refresh.test.tsx`.

```tsx
import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'

describe('UI primitives', () => {
  it('renders button and card primitives', () => {
    render(
      <div>
        <Button>Launch</Button>
        <Card>
          <CardHeader>
            <CardTitle>Panel</CardTitle>
          </CardHeader>
          <CardContent>Content</CardContent>
        </Card>
      </div>
    )

    expect(screen.getByRole('button', { name: 'Launch' })).toBeInTheDocument()
    expect(screen.getByText('Panel')).toBeInTheDocument()
    expect(screen.getByText('Content')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the primitive test to verify it fails**

Run: `pnpm --filter @cocurdex/desktop test -- --run src/test/ui-refresh.test.tsx`
Expected: FAIL with module not found for `../components/ui/button`.

- [ ] **Step 3: Write the minimal shared UI primitives**

Create `apps/desktop/src/lib/utils.ts`.

```ts
export function cn(...inputs: Array<string | false | null | undefined>) {
  return inputs.filter(Boolean).join(' ')
}
```

Create `apps/desktop/src/components/ui/button.tsx`.

```tsx
import * as React from 'react'
import { cn } from '../../lib/utils'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary' | 'ghost' | 'outline'
}

export function Button({ className, variant = 'default', ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-xl text-sm font-medium transition focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
        variant === 'default' && 'bg-zinc-100 px-4 py-2 text-zinc-950 hover:bg-zinc-200',
        variant === 'secondary' && 'bg-white/10 px-4 py-2 text-zinc-100 hover:bg-white/15',
        variant === 'ghost' && 'px-3 py-2 text-zinc-300 hover:bg-white/5',
        variant === 'outline' && 'border border-white/10 bg-transparent px-4 py-2 text-zinc-200 hover:bg-white/5',
        className
      )}
      {...props}
    />
  )
}
```

Create `apps/desktop/src/components/ui/card.tsx`.

```tsx
import * as React from 'react'
import { cn } from '../../lib/utils'

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-2xl border border-white/10 bg-[#171a20] shadow-2xl shadow-black/20', className)} {...props} />
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1.5 p-4', className)} {...props} />
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-sm font-semibold text-zinc-100', className)} {...props} />
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-zinc-400', className)} {...props} />
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4 pt-0', className)} {...props} />
}
```

Create `apps/desktop/src/components/ui/badge.tsx`.

```tsx
import * as React from 'react'
import { cn } from '../../lib/utils'

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('inline-flex items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-200', className)} {...props} />
}
```

Create `apps/desktop/src/components/ui/separator.tsx`.

```tsx
import * as React from 'react'
import { cn } from '../../lib/utils'

export function Separator({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('h-px w-full bg-white/10', className)} {...props} />
}
```

Create `apps/desktop/src/components/ui/scroll-area.tsx`.

```tsx
import * as React from 'react'
import { cn } from '../../lib/utils'

export function ScrollArea({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('overflow-auto', className)} {...props} />
}
```

Create `apps/desktop/src/components/ui/textarea.tsx`.

```tsx
import * as React from 'react'
import { cn } from '../../lib/utils'

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'min-h-28 w-full resize-none rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-500',
        className
      )}
      {...props}
    />
  )
}
```

- [ ] **Step 4: Run the primitive test again**

Run: `pnpm --filter @cocurdex/desktop test -- --run src/test/ui-refresh.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit the shared UI primitives**

```bash
git add apps/desktop/src/components/ui apps/desktop/src/lib/utils.ts apps/desktop/src/test/ui-refresh.test.tsx
git commit -m "feat: add desktop ui primitives"
```

## Task 2: Refresh the left sidebar with shared primitives

**Files:**
- Modify: `apps/desktop/src/app/layout/left-sidebar.tsx`
- Test: `apps/desktop/src/test/app-shell.test.tsx`

- [ ] **Step 1: Write the failing sidebar assertion**

Replace `apps/desktop/src/test/app-shell.test.tsx` with:

```tsx
import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AppShell } from '../app/layout/app-shell'

describe('AppShell', () => {
  it('renders sidebar sections, launcher, and editor panel', () => {
    render(<AppShell />)

    expect(screen.getByText('Workspaces')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New Agent' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Workspace' })).toBeInTheDocument()
    expect(screen.getByText('Editor')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the app shell test to verify the new assertion state**

Run: `pnpm --filter @cocurdex/desktop test -- --run src/test/app-shell.test.tsx`
Expected: PASS or FAIL only if the refactor breaks the existing accessible names.

- [ ] **Step 3: Rewrite the sidebar using shadcn-style primitives**

Replace `apps/desktop/src/app/layout/left-sidebar.tsx` with:

```tsx
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { ScrollArea } from '../../components/ui/scroll-area'
import { Separator } from '../../components/ui/separator'

const workspaceGroups = ['pmndrs/jotai', 'pmndrs/zustand']

export function LeftSidebar() {
  return (
    <aside className="flex min-h-screen flex-col border-r border-white/10 bg-[#111318]">
      <div className="p-4">
        <Button className="w-full justify-between" variant="secondary" type="button">
          <span>New Agent</span>
          <span className="text-xs text-zinc-400">⌘N</span>
        </Button>
      </div>

      <Separator />

      <div className="px-4 py-3 text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Workspaces</div>

      <ScrollArea className="flex-1 px-4 pb-4">
        <div className="space-y-4">
          {workspaceGroups.map((workspace) => (
            <Card key={workspace} className="bg-white/5 shadow-none">
              <CardHeader className="pb-3">
                <CardTitle className="text-xs uppercase tracking-[0.2em] text-zinc-500">{workspace}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm font-medium text-zinc-200">Sessions</div>
                <p className="mt-2 text-sm text-zinc-500">No agents yet</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>

      <Separator />

      <div className="p-4">
        <Button className="w-full justify-start" variant="outline" type="button">
          Open Workspace
        </Button>
      </div>
    </aside>
  )
}
```

- [ ] **Step 4: Run the app shell test again**

Run: `pnpm --filter @cocurdex/desktop test -- --run src/test/app-shell.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit the sidebar refresh**

```bash
git add apps/desktop/src/app/layout/left-sidebar.tsx apps/desktop/src/test/app-shell.test.tsx
git commit -m "feat: refresh desktop sidebar ui"
```

## Task 3: Refresh the session launcher and center panel

**Files:**
- Modify: `apps/desktop/src/app/layout/center-panel.tsx`
- Modify: `apps/desktop/src/features/sessions/new-session-card.tsx`
- Test: `apps/desktop/src/test/new-session-card.test.tsx`

- [ ] **Step 1: Write the failing launcher test update**

Replace `apps/desktop/src/test/new-session-card.test.tsx` with:

```tsx
import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NewSessionCard } from '../features/sessions/new-session-card'

describe('NewSessionCard', () => {
  it('shows an agent chooser panel after a workspace is selected', () => {
    render(<NewSessionCard workspaceName="repo-a" />)

    expect(screen.getByText('New session in repo-a')).toBeInTheDocument()
    expect(screen.getByText('Pick an agent')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Claude Code' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the launcher test to verify it fails**

Run: `pnpm --filter @cocurdex/desktop test -- --run src/test/new-session-card.test.tsx`
Expected: FAIL because `Pick an agent` text does not exist yet.

- [ ] **Step 3: Rewrite the launcher panel with Card and Button primitives**

Replace `apps/desktop/src/app/layout/center-panel.tsx` with:

```tsx
import { NewSessionCard } from '../../features/sessions/new-session-card'

export function CenterPanel() {
  return (
    <section className="flex min-h-screen items-center justify-center bg-[#0f1115] p-8">
      <div className="w-full max-w-4xl">
        <NewSessionCard />
      </div>
    </section>
  )
}
```

Replace `apps/desktop/src/features/sessions/new-session-card.tsx` with:

```tsx
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'

interface NewSessionCardProps {
  workspaceName?: string
}

const agentOptions = ['Claude Code', 'Codex', 'Pi', 'OpenCode']

export function NewSessionCard({ workspaceName }: NewSessionCardProps) {
  if (!workspaceName) {
    return (
      <Card className="rounded-3xl">
        <CardHeader>
          <CardTitle className="text-3xl tracking-tight text-zinc-50">Select a workspace</CardTitle>
          <CardDescription>Choose a local repository from the left sidebar to create a new agent session.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-black/10 text-center">
            <div className="text-sm font-medium text-zinc-200">No workspace selected</div>
            <p className="mt-2 text-sm text-zinc-500">Open a workspace to create your first session.</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="rounded-3xl">
      <CardHeader>
        <div className="text-xs font-medium uppercase tracking-[0.24em] text-zinc-500">Workspace</div>
        <CardTitle className="text-3xl tracking-tight text-zinc-50">{`New session in ${workspaceName}`}</CardTitle>
        <CardDescription>Pick an agent to start a workspace-scoped conversation.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 text-sm font-medium text-zinc-300">Pick an agent</div>
        <div className="grid gap-3 md:grid-cols-2">
          {agentOptions.map((agent) => (
            <Button
              key={agent}
              aria-label={agent}
              className="h-auto flex-col items-start gap-1 rounded-2xl border border-white/10 px-4 py-4 text-left"
              variant="outline"
              type="button"
            >
              <span className="text-sm font-medium text-zinc-100">{agent}</span>
              <span className="text-xs leading-5 text-zinc-400">Start a new session with {agent} in the current workspace.</span>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: Run the launcher test again**

Run: `pnpm --filter @cocurdex/desktop test -- --run src/test/new-session-card.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit the session launcher refresh**

```bash
git add apps/desktop/src/app/layout/center-panel.tsx apps/desktop/src/features/sessions/new-session-card.tsx apps/desktop/src/test/new-session-card.test.tsx
git commit -m "feat: refresh session launcher ui"
```

## Task 4: Refresh chat and editor panels with shared primitives

**Files:**
- Modify: `apps/desktop/src/app/layout/right-editor-panel.tsx`
- Modify: `apps/desktop/src/features/chat/chat-composer.tsx`
- Modify: `apps/desktop/src/features/chat/chat-view.tsx`
- Modify: `apps/desktop/src/features/editor/file-tree.tsx`
- Modify: `apps/desktop/src/features/editor/editor-tabs.tsx`
- Modify: `apps/desktop/src/features/editor/monaco-editor.tsx`
- Modify: `apps/desktop/src/features/editor/send-selection-button.tsx`
- Test: `apps/desktop/src/test/right-editor-panel.test.tsx`
- Test: `apps/desktop/src/test/chat-composer.test.tsx`

- [ ] **Step 1: Update the editor panel and composer tests**

Replace `apps/desktop/src/test/right-editor-panel.test.tsx` with:

```tsx
import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RightEditorPanel } from '../app/layout/right-editor-panel'

describe('RightEditorPanel', () => {
  it('renders file tree, tabs, editor placeholder, and selection action', () => {
    render(<RightEditorPanel />)

    expect(screen.getByText('Files')).toBeInTheDocument()
    expect(screen.getByText('Open tabs')).toBeInTheDocument()
    expect(screen.getByText('Monaco editor')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send to Agent' })).toBeInTheDocument()
  })
})
```

Replace `apps/desktop/src/test/chat-composer.test.tsx` with:

```tsx
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChatComposer } from '../features/chat/chat-composer'

describe('ChatComposer', () => {
  it('renders an attachment badge and sends trimmed text', () => {
    const onSend = vi.fn()

    render(
      <ChatComposer
        attachment={{
          filePath: 'src/app.tsx',
          language: 'tsx',
          selectedText: 'const x = 1',
          startLine: 10,
          endLine: 10,
          surroundingContext: 'const x = 1'
        }}
        onSend={onSend}
      />
    )

    expect(screen.getByText('src/app.tsx:10-10')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  Explain this selection  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(onSend).toHaveBeenCalledWith('Explain this selection')
  })
})
```

- [ ] **Step 2: Run the panel tests to verify current failures**

Run: `pnpm --filter @cocurdex/desktop test -- --run src/test/right-editor-panel.test.tsx src/test/chat-composer.test.tsx`
Expected: PASS or FAIL only when the old implementation does not yet satisfy the new UI semantics.

- [ ] **Step 3: Rewrite chat and editor surfaces with shared primitives**

Replace `apps/desktop/src/features/chat/chat-composer.tsx` with:

```tsx
import { useState } from 'react'
import type { MessageAttachment } from '@cocurdex/shared'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardContent } from '../../components/ui/card'
import { Textarea } from '../../components/ui/textarea'

interface ChatComposerProps {
  attachment?: MessageAttachment
  onSend(message: string): void
}

export function ChatComposer({ attachment, onSend }: ChatComposerProps) {
  const [value, setValue] = useState('')

  return (
    <Card>
      <CardContent className="p-4">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            const trimmedValue = value.trim()
            if (!trimmedValue) {
              return
            }
            onSend(trimmedValue)
            setValue('')
          }}
        >
          {attachment ? <Badge>{`${attachment.filePath}:${attachment.startLine}-${attachment.endLine}`}</Badge> : null}
          <Textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Ask the agent about this workspace or selected code..."
          />
          <div className="flex justify-end">
            <Button type="submit">Send</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
```

Replace `apps/desktop/src/features/chat/chat-view.tsx` with:

```tsx
import type { MessageAttachment, MessageRecord } from '@cocurdex/shared'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { ScrollArea } from '../../components/ui/scroll-area'
import { ChatComposer } from './chat-composer'

interface ChatViewProps {
  messages: MessageRecord[]
  attachment?: MessageAttachment
  onSend(message: string): void
}

export function ChatView({ messages, attachment, onSend }: ChatViewProps) {
  return (
    <section className="flex h-full flex-col gap-4">
      <Card className="flex-1">
        <CardHeader>
          <CardTitle>Conversation</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="min-h-64 space-y-3">
            {messages.length === 0 ? (
              <div className="flex min-h-56 items-center justify-center text-sm text-zinc-500">
                No messages yet. Start with a prompt or send a code selection.
              </div>
            ) : (
              messages.map((message) => (
                <div key={message.id} className="mb-3 rounded-2xl border border-white/10 bg-white/5 p-4 last:mb-0">
                  <div className="mb-2 text-xs font-medium uppercase tracking-[0.24em] text-zinc-500">{message.role}</div>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-200">{message.content}</p>
                </div>
              ))
            )}
          </ScrollArea>
        </CardContent>
      </Card>
      <ChatComposer attachment={attachment} onSend={onSend} />
    </section>
  )
}
```

Replace `apps/desktop/src/features/editor/file-tree.tsx` with:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'

export function FileTree() {
  return (
    <Card className="bg-white/5 shadow-none">
      <CardHeader>
        <CardTitle>Files</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-zinc-500">No workspace loaded.</p>
      </CardContent>
    </Card>
  )
}
```

Replace `apps/desktop/src/features/editor/editor-tabs.tsx` with:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'

export function EditorTabs() {
  return (
    <Card className="bg-white/5 shadow-none">
      <CardHeader>
        <CardTitle>Open tabs</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-zinc-500">No files open.</p>
      </CardContent>
    </Card>
  )
}
```

Replace `apps/desktop/src/features/editor/monaco-editor.tsx` with:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'

export function MonacoEditor() {
  return (
    <Card className="flex-1 bg-white/5 shadow-none">
      <CardHeader>
        <CardTitle>Monaco editor</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex min-h-64 items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/20 text-sm text-zinc-500">
          Editor preview will appear here.
        </div>
      </CardContent>
    </Card>
  )
}
```

Replace `apps/desktop/src/features/editor/send-selection-button.tsx` with:

```tsx
import { Button } from '../../components/ui/button'

interface SendSelectionButtonProps {
  disabled?: boolean
  onClick(): void
}

export function SendSelectionButton({ disabled = false, onClick }: SendSelectionButtonProps) {
  return (
    <Button disabled={disabled} variant="outline" type="button" onClick={onClick}>
      Send to Agent
    </Button>
  )
}
```

Replace `apps/desktop/src/app/layout/right-editor-panel.tsx` with:

```tsx
import { EditorTabs } from '../../features/editor/editor-tabs'
import { FileTree } from '../../features/editor/file-tree'
import { MonacoEditor } from '../../features/editor/monaco-editor'
import { SendSelectionButton } from '../../features/editor/send-selection-button'

export function RightEditorPanel() {
  return (
    <aside className="flex min-h-screen flex-col gap-4 border-l border-white/10 bg-[#111318] p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-100">Editor</h2>
        <SendSelectionButton disabled onClick={() => {}} />
      </div>
      <FileTree />
      <EditorTabs />
      <MonacoEditor />
    </aside>
  )
}
```

- [ ] **Step 4: Run the panel tests again**

Run: `pnpm --filter @cocurdex/desktop test -- --run src/test/right-editor-panel.test.tsx src/test/chat-composer.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit the chat and editor refresh**

```bash
git add apps/desktop/src/app/layout/right-editor-panel.tsx apps/desktop/src/features/chat/chat-composer.tsx apps/desktop/src/features/chat/chat-view.tsx apps/desktop/src/features/editor/file-tree.tsx apps/desktop/src/features/editor/editor-tabs.tsx apps/desktop/src/features/editor/monaco-editor.tsx apps/desktop/src/features/editor/send-selection-button.tsx apps/desktop/src/test/right-editor-panel.test.tsx apps/desktop/src/test/chat-composer.test.tsx
git commit -m "feat: refresh desktop editor and chat ui"
```

## Task 5: Run full validation and polish regressions

**Files:**
- Modify: `apps/desktop/src/app/layout/app-shell.tsx` (only if spacing polish is needed)
- Modify: `apps/desktop/src/styles/globals.css` (only if primitive styles need tiny support)
- Test: `apps/desktop/src/test/app-shell.test.tsx`
- Test: `apps/desktop/src/test/new-session-card.test.tsx`
- Test: `apps/desktop/src/test/right-editor-panel.test.tsx`
- Test: `apps/desktop/src/test/chat-composer.test.tsx`
- Test: `apps/desktop/src/test/ui-refresh.test.tsx`

- [ ] **Step 1: Run the full desktop test suite**

Run: `pnpm --filter @cocurdex/desktop test`
Expected: PASS

- [ ] **Step 2: Run the desktop dev app and visually verify the refreshed shell**

Run: `pnpm --filter @cocurdex/desktop dev`
Expected: Electron window opens with a visibly more consistent left sidebar, center launcher, and right editor panel.

- [ ] **Step 3: If spacing or support styles need a tiny fix, apply only the minimum change**

If needed, update `apps/desktop/src/app/layout/app-shell.tsx` to:

```tsx
import { CenterPanel } from './center-panel'
import { LeftSidebar } from './left-sidebar'
import { RightEditorPanel } from './right-editor-panel'

export function AppShell() {
  return (
    <main className="grid min-h-screen grid-cols-[280px_1fr_420px] bg-[#0b0d10] text-zinc-100">
      <LeftSidebar />
      <CenterPanel />
      <RightEditorPanel />
    </main>
  )
}
```

If needed, update `apps/desktop/src/styles/globals.css` to:

```css
@import "tailwindcss";

:root {
  color-scheme: dark;
  font-family: Inter, sans-serif;
  background: #0b0d10;
}

* {
  box-sizing: border-box;
}

html,
body,
#root {
  min-height: 100%;
}

body {
  margin: 0;
  background: #0b0d10;
  color: #f4f4f5;
  font-family: Inter, sans-serif;
}

button,
textarea {
  font: inherit;
}
```

- [ ] **Step 4: Re-run the full desktop test suite after any tiny polish fix**

Run: `pnpm --filter @cocurdex/desktop test`
Expected: PASS

- [ ] **Step 5: Commit the shadcn desktop refresh**

```bash
git add apps/desktop/src/app/layout app-shell.tsx apps/desktop/src/features apps/desktop/src/styles/globals.css apps/desktop/src/test
git commit -m "feat: refresh desktop shell with shadcn ui"
```

## Self-review

### Spec coverage
- Shared shadcn-style primitives: covered by Task 1.
- Left sidebar refresh: covered by Task 2.
- Center panel and launcher refresh: covered by Task 3.
- Chat and editor panel refresh: covered by Task 4.
- Final consistency and visual verification: covered by Task 5.

### Gaps fixed in plan
- Added a dedicated primitive layer so the UI refresh does not duplicate Tailwind classes everywhere.
- Added a dedicated visual verification task because this change is primarily user-facing.
- Kept the scope to renderer visuals only, avoiding accidental product flow changes.

### Placeholder scan
- No TBD markers or unresolved placeholders remain.
- Each task contains exact file paths, concrete code, and explicit commands.

### Type consistency
- `Button`, `Card`, `Badge`, `Separator`, `ScrollArea`, and `Textarea` names are used consistently.
- Existing `MessageAttachment` and chat/editor prop shapes are preserved.
- The plan keeps current component boundaries intact and does not rename existing domain types.
