# Browser Annotation Design Mode

## Overview

Implement a Cursor-like Design Mode that lets users annotate UI elements directly in an embedded browser, then send those annotations as context to coding agents. This closes the gap between visual feedback and code changes.

## Core Capabilities

| Capability | Interaction | Priority |
|---|---|---|
| Embedded browser preview | Show dev server page inside the app | P0 |
| Element click selection | Click an element to capture its CSS selector, tag, text, and bounding box | P0 |
| Region box selection | Shift+drag to draw a rectangular region overlay | P1 |
| Screenshot capture | Capture page/section screenshots as visual context for the agent | P1 |
| Annotations → agent context | Selected elements/regions attached to chat prompt | P2 |

## Architecture

```
Main Process                              Renderer Process
                       
  WebContentsView                         RightEditorPanel
  ┌──────────────────┐                   ┌─────────────────────┐
  │ dev server page  │                   │ [Editor│Git│Browser] │
  │                  │   bounds sync     │                     │
  │ ┌──────────────┐ │ ←─────────────── │ ┌─────────────────┐ │
  │ │annotation.js │ │   IPC             │ │ container ref   │ │
  │ │ hover highlt │ │ ───────────────→ │ │ (ResizeObserver)│ │
  │ │ click select │ │   element data   │ └─────────────────┘ │
  │ │ drag region  │ │                  │ ┌─────────────────┐ │
  │ └──────────────┘ │                  │ │ URL bar + nav   │ │
  └──────────────────┘                  │ │ Annotations list│ │
       │                                │ └─────────────────┘ │
       │ browser-preload ipcRenderer    └─────────────────────┘
       ▼                                         │
  ipcMain.on("browser:...")             ChatComposer (attachments)
       │                                         ▲
       ▼                                         │
  BrowserWindow.webContents.send        desktopApi.sendMessage()
```

## Implementation Plan

### Step 1: IPC Channels & Type Extensions

**`packages/shared/src/contracts.ts`** — new types:

```typescript
export interface BrowserAnnotation {
  id: string
  type: 'element' | 'region'
  selector?: string           // CSS selector (element mode)
  tagName?: string            // element tag name
  textContent?: string        // truncated to 200 chars
  boundingBox: { x: number; y: number; width: number; height: number }
  regionScreenshot?: string   // base64 (region mode)
  pageUrl: string
  note?: string               // user note
  capturedAt: string
}
```

**`apps/desktop/src/lib/types.ts`** — extend `DesktopApi`:

```typescript
export interface DesktopApi {
  // ... existing methods
  browserNavigate(url: string): Promise<void>
  browserReload(): Promise<void>
  browserToggleAnnotationMode(enabled: boolean): Promise<void>
  browserCaptureScreenshot(): Promise<string>
  onBrowserAnnotation(listener: (a: BrowserAnnotation) => void): () => void
  setBrowserBounds(bounds: { x: number; y: number; w: number; h: number }): void
}
```

### Step 2: Main Process — WebContentsView

**`electron/main.ts`** — create and manage `WebContentsView`:

- Create `WebContentsView` with isolated preload (`browser-preload.cjs`)
- IPC handlers: `browser:navigate`, `browser:reload`, `browser:toggleAnnotationMode`
- Forward annotation events from WebContentsView to renderer windows
- Handle `browser:setBounds` for layout synchronization
- Screenshot capture via `webContents.capturePage()`

### Step 3: Browser Preload — Annotation Injection

**`electron/browser-preload.ts`** (new file):

- Expose `__ANNOTATION_API__` via `contextBridge`
- Listen for `annotation:toggle` IPC from main to enable/disable annotation mode
- Annotation mode interactions:
  - `mouseover` → highlight element (CSS outline overlay)
  - `click` → select element, compute unique CSS selector + metadata
  - `Shift+mousedown+mousemove+mouseup` → draw rectangular region overlay
- Send captured data via `ipcRenderer.send('browser:elementSelected', data)`
- Prevent default page interactions while in annotation mode

### Step 4: Renderer — Browser Panel

**`src/features/browser/browser-store.ts`** (new):

```
browserUrlAtom          // current URL
isAnnotationModeAtom    // design mode toggle
annotationsAtom         // BrowserAnnotation[]
isBrowserLoadingAtom    // loading state
```

**`src/features/browser/browser-panel.tsx`** (new):

- URL input bar with navigation buttons (back, forward, reload)
- Container `<div>` for WebContentsView overlay (syncs bounds via `ResizeObserver`)
- Design Mode toggle button
- Annotation list showing captured elements/regions
- Screenshot capture button

**`src/features/browser/url-bar.tsx`** (new):

- URL text input with enter-to-navigate
- Navigation button group

**`src/features/browser/annotation-list.tsx`** (new):

- Scrollable list of captured annotations
- Each item shows type icon, selector/tag, thumbnail
- Delete/clear controls

**`src/app/layout/right-editor-panel.tsx`** — modifications:

- Add `'browser'` to `RightPanelView` type
- Add Browser tab button (Globe icon)
- Render `<BrowserPanel />` when `activeView === 'browser'`

### Step 5: Keyboard Shortcuts

**`src/app/layout/app-shell.tsx`**:

- Add `⌘+Shift+D` shortcut to toggle Design Mode
- Annotations are automatically included as context when sending messages

### Step 6: Agent Integration

**`src/features/chat/chat-composer.tsx`**:

- Read `annotationsAtom` before sending messages
- Format active annotations as text context inserted into the prompt:

```
[Browser Annotations]
- Element: <button class="submit-btn"> → CSS selector: .submit-btn
  Text: "Submit"
  Bounds: (120, 340) 150×40
- Region: (100, 200) 300×50
```

## File Change Summary

| Action | File |
|--------|------|
| New | `electron/browser-preload.ts` |
| New | `src/features/browser/browser-panel.tsx` |
| New | `src/features/browser/browser-store.ts` |
| New | `src/features/browser/annotation-list.tsx` |
| New | `src/features/browser/url-bar.tsx` |
| Modify | `electron/main.ts` — WebContentsView + IPC handlers |
| Modify | `electron/preload.ts` — expose browser API |
| Modify | `electron.vite.config.ts` — browser-preload build target |
| Modify | `src/lib/types.ts` — DesktopApi extension |
| Modify | `src/lib/ipc.ts` — fallback mock |
| Modify | `src/app/layout/right-editor-panel.tsx` — browser tab |
| Modify | `src/app/layout/app-shell.tsx` — shortcut + bounds sync |
| Modify | `packages/shared/src/contracts.ts` — BrowserAnnotation type |
| Modify | `src/features/chat/chat-composer.tsx` — annotation context injection |

## Key Technical Details

### Element Identification

Unique CSS selector generation strategy (priority order):
1. `#id` — if element has an id
2. `[data-testid="..."]` — if element has a testid attribute
3. `tag.class1.class2` + `:nth-child(N)` fallback for uniqueness

### WebContentsView Bounds Sync

The `ResizeObserver` on the renderer's browser container `<div>` tracks position and size changes. These bounds are sent to the main process via `desktopApi.setBrowserBounds()`, which calls `WebContentsView.setBounds()`. When the browser tab is not active, the view is hidden (`setVisible(false)`).

### Security

- `WebContentsView` preload: `contextIsolation: true`, `nodeIntegration: false`
- Preload script only exposes a controlled API via `contextBridge`
- No Node.js APIs are injected into the loaded page
- Annotation script is injected via preload, not via `executeJavaScript`

### Risk Assessment

| Risk | Mitigation |
|------|------------|
| Bounds sync latency on resize | Use `ResizeObserver` and `requestAnimationFrame` for smooth updates |
| CSS selector ambiguity | Generate selectors with parent hierarchy + nth-child fallback |
| Large page performance (hover highlights) | Use event delegation + debounce (16ms throttle) |
| Dev server not running | Show connection error state with retry button |

## Dependencies

- Electron ≥ 30 (current: 41.2.1) — `WebContentsView` support
- No additional npm packages required
