// Module-level cache that keeps one xterm.js `Terminal` instance per terminal
// alive across React mounts. Without this, switching to another view (editor /
// browser / git) or another workspace would dispose the xterm and discard its
// scrollback even though the PTY in the main process keeps running.
//
// React's role shrinks to: render an empty <div> slot, ask the registry to
// move the cached host DOM into the slot on mount, and remove it on unmount.
// All xterm lifecycle, PTY subscription, and resize plumbing lives here.
//
// Open trade-off: a long-running task that prints between detach and
// re-attach still loses its mid-detach output, because the renderer-side
// `onPtyData` subscription is gated by terminalId and only writes to the
// matching cached terminal — which works because subscriptions are created
// per entry and live for the entry's whole lifetime (not just while attached).

import type { PtyActivityEvent } from "@cocurdex/shared";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { type IDisposable, Terminal } from "@xterm/xterm";
import { desktopApi, onThemeChanged, readCssVarPx } from "@/lib";
import "@xterm/xterm/css/xterm.css";
import { buildTerminalTheme } from "./terminal-theme";

const DEFAULT_TERMINAL_FONT_FAMILY =
  'Menlo, Monaco, "Cascadia Code", "Source Code Pro", "Courier New", monospace';

function readTerminalFontFamily(): string {
  if (typeof document === "undefined") {
    return DEFAULT_TERMINAL_FONT_FAMILY;
  }
  const fromCss = getComputedStyle(document.documentElement)
    .getPropertyValue("--font-mono")
    .trim();
  return fromCss || DEFAULT_TERMINAL_FONT_FAMILY;
}

function readTerminalFontSize(): number {
  return readCssVarPx("--app-code-font-size", 13);
}

export type TerminalStatus =
  | { kind: "spawning" }
  // `shell` is the basename of the spawned shell (e.g. "zsh"), shown as the
  // tab label once the PTY is live.
  | { kind: "ready"; shell: string }
  | { kind: "error"; message: string }
  | { kind: "exited"; exitCode: number };

// Reduce a shell path to a friendly label: "/bin/zsh" -> "zsh",
// "powershell.exe" -> "powershell".
function shellLabel(shellPath: string): string {
  const base = shellPath.split(/[/\\]/).pop() ?? shellPath;
  return base.replace(/\.exe$/i, "");
}

const IS_MAC =
  typeof navigator !== "undefined" &&
  navigator.platform.toLowerCase().includes("mac");

interface Entry {
  terminalId: string;
  workspaceId: string;
  cwd: string;
  term: Terminal;
  fit: FitAddon;
  search: SearchAddon;
  host: HTMLDivElement;
  unsubscribers: Array<() => void>;
  inputDisposable: IDisposable;
  status: TerminalStatus;
  listeners: Set<(status: TerminalStatus) => void>;
  searchListeners: Set<() => void>;
  resizeObserver: ResizeObserver | null;
  resizeTimer: ReturnType<typeof setTimeout> | null;
}

function notifySearchOpen(entry: Entry) {
  for (const listener of entry.searchListeners) {
    listener();
  }
}

export function onTerminalOpenSearch(
  terminalId: string,
  listener: () => void,
): () => void {
  const entry = entries.get(terminalId);
  if (!entry) {
    return () => {};
  }
  entry.searchListeners.add(listener);
  return () => {
    entry.searchListeners.delete(listener);
  };
}

const entries = new Map<string, Entry>();

// Foreground process / cwd for each terminal, pushed from the main process
// poller. Cached so a tab that mounts between events still renders the last
// known value, and dispatched to per-terminal listeners.
export interface TerminalActivity {
  foregroundProcess: string | null;
  cwd: string | null;
}

const activityState = new Map<string, TerminalActivity>();
const activityListeners = new Map<
  string,
  Set<(activity: TerminalActivity | null) => void>
>();

function handleActivity(event: PtyActivityEvent) {
  const next: TerminalActivity = {
    foregroundProcess: event.foregroundProcess,
    cwd: event.cwd,
  };
  activityState.set(event.terminalId, next);
  const listeners = activityListeners.get(event.terminalId);
  if (listeners) {
    for (const listener of listeners) {
      listener(next);
    }
  }
}

// Synchronous snapshot for `useSyncExternalStore`. Returns the same `null`
// reference until an event replaces it, so React can skip re-renders.
export function getTerminalActivity(
  terminalId: string,
): TerminalActivity | null {
  return activityState.get(terminalId) ?? null;
}

// Drop the cached activity when its PTY exits, so an exited tab stops showing
// the last polled foreground command as if it were still running.
function clearActivity(terminalId: string) {
  if (!activityState.delete(terminalId)) {
    return;
  }
  const listeners = activityListeners.get(terminalId);
  if (listeners) {
    for (const listener of listeners) {
      listener(null);
    }
  }
}

export function subscribeActivity(
  terminalId: string,
  listener: (activity: TerminalActivity | null) => void,
): () => void {
  let set = activityListeners.get(terminalId);
  if (!set) {
    set = new Set();
    activityListeners.set(terminalId, set);
  }
  set.add(listener);
  const cached = activityState.get(terminalId);
  if (cached) {
    listener(cached);
  }
  return () => {
    set.delete(listener);
    if (set.size === 0) {
      activityListeners.delete(terminalId);
    }
  };
}

// Status listeners that subscribed before their terminal's entry existed
// (e.g. an inactive tab rendering its status dot before it is first attached).
// Drained into the entry's own listener set the moment the entry is created.
const pendingStatusListeners = new Map<
  string,
  Set<(status: TerminalStatus) => void>
>();

// Frozen default so `getTerminalStatus` returns a stable reference before the
// entry exists (an inactive tab racing with attach), keeping
// `useSyncExternalStore` from looping.
const SPAWNING_STATUS: TerminalStatus = { kind: "spawning" };

// Synchronous snapshot for `useSyncExternalStore`. `entry.status` is replaced
// wholesale on each transition, so its reference is stable between changes.
export function getTerminalStatus(terminalId: string): TerminalStatus {
  return entries.get(terminalId)?.status ?? SPAWNING_STATUS;
}

function setStatus(entry: Entry, next: TerminalStatus) {
  entry.status = next;
  for (const listener of entry.listeners) {
    listener(next);
  }
}

function createEntry(
  terminalId: string,
  workspaceId: string,
  cwd: string,
): Entry {
  const term = new Terminal({
    theme: buildTerminalTheme(),
    // Match Appearance code font (CSS vars from syncAppearanceSettings).
    fontFamily: readTerminalFontFamily(),
    fontSize: readTerminalFontSize(),
    cursorBlink: true,
    scrollback: 5000,
    allowProposedApi: true,
    // xterm v5 derives the vertical scrollbar size from overviewRuler.width
    // (default 14px). Slim it to match the rest of the app's 6px thin tracks.
    // Note: this also sizes the overview-ruler region itself, which we don't
    // currently populate with decorations, so the visual effect is purely a
    // narrower scrollbar.
    overviewRuler: { width: 6 },
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  // Route link clicks through the main process so they open in the user's
  // real default browser, not inside Electron's BrowserView / BrowserWindow.
  term.loadAddon(
    new WebLinksAddon((event, uri) => {
      event.preventDefault();
      void desktopApi.openExternal(uri);
    }),
  );
  // Search inside scrollback (Cmd+F overlay is wired in TerminalPanel).
  const search = new SearchAddon();
  term.loadAddon(search);

  // Accel + C: when the user has a selection, treat it as a copy gesture
  // and swallow the event so the shell doesn't also receive SIGINT. When the
  // selection is empty, fall through to the PTY (shell expects ^C).
  // Accel + V: always pull from the system clipboard and write to the PTY.
  // Accel is Cmd on macOS only — treating Ctrl as an accelerator there would
  // hijack readline keys (Ctrl+F forward-char, Ctrl+V quoted-insert) that
  // must reach the shell.
  term.attachCustomKeyEventHandler((event) => {
    if (event.type !== "keydown") {
      return true;
    }
    const isAccel = IS_MAC ? event.metaKey : event.ctrlKey;
    if (!isAccel) {
      return true;
    }
    const key = event.key.toLowerCase();
    if (key === "c" && term.hasSelection()) {
      const selection = term.getSelection();
      if (selection) {
        void navigator.clipboard.writeText(selection);
      }
      term.clearSelection();
      return false;
    }
    if (key === "v") {
      void navigator.clipboard
        .readText()
        .then((text) => {
          if (text) {
            void desktopApi.ptyWrite(terminalId, text);
          }
        })
        .catch(() => {
          // Clipboard read can fail under sandboxing. The keydown was
          // already swallowed synchronously, so the paste is dropped —
          // there is no sync fallback path left at this point.
        });
      return false;
    }
    if (key === "f") {
      // Notify the panel to open its search overlay. We can't render React
      // UI from inside the registry, so we just emit and let the panel
      // handle focus + input.
      const entry = entries.get(terminalId);
      if (entry) {
        notifySearchOpen(entry);
      }
      return false;
    }
    return true;
  });

  const host = document.createElement("div");
  host.style.height = "100%";
  host.style.width = "100%";
  host.style.minHeight = "0";

  const entry: Entry = {
    terminalId,
    workspaceId,
    cwd,
    term,
    fit,
    search,
    host,
    unsubscribers: [],
    // Forwarding user keystrokes to the PTY lives at the entry level so it
    // survives detach/re-attach without re-registering.
    inputDisposable: term.onData((data) => {
      void desktopApi.ptyWrite(terminalId, data);
    }),
    status: { kind: "spawning" },
    listeners: new Set(),
    searchListeners: new Set(),
    resizeObserver: null,
    resizeTimer: null,
  };

  entry.unsubscribers.push(
    desktopApi.onPtyData((event) => {
      if (event.terminalId !== terminalId) {
        return;
      }
      term.write(event.data);
    }),
    desktopApi.onPtyExit((event) => {
      if (event.terminalId !== terminalId) {
        return;
      }
      // Single technical line; intentionally kept English to avoid coupling
      // this module to react-i18next (registry runs outside React tree).
      term.writeln(`\r\n[process exited with code ${event.exitCode}]`);
      clearActivity(terminalId);
      setStatus(entry, { kind: "exited", exitCode: event.exitCode });
    }),
  );

  return entry;
}

async function bootPty(entry: Entry) {
  setStatus(entry, { kind: "spawning" });
  try {
    const result = await desktopApi.ptySpawn({
      terminalId: entry.terminalId,
      workspaceId: entry.workspaceId,
      cwd: entry.cwd,
      cols: entry.term.cols,
      rows: entry.term.rows,
    });
    setStatus(entry, { kind: "ready", shell: shellLabel(result.shell) });
    entry.term.focus();
  } catch (error) {
    setStatus(entry, {
      kind: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

// Upgrade the renderer to WebGL after the xterm DOM is mounted. WebGL is
// ~5x faster than the default DOM renderer on heavy output (long builds,
// `cat` of large files) but isn't always available — headless GPU, blocked
// WebGL context, Linux without GL libs all fall back. We attach a one-shot
// `onContextLoss` listener so a lost context downgrades to DOM rather than
// rendering garbage.
function tryLoadWebgl(entry: Entry) {
  try {
    const webgl = new WebglAddon();
    webgl.onContextLoss(() => {
      webgl.dispose();
    });
    entry.term.loadAddon(webgl);
  } catch {
    // GL initialization can throw on systems without a working WebGL
    // context; the terminal continues with the default DOM renderer.
  }
}

// Debounce window for refitting after the slot stops resizing. Each `fit()`
// resizes the WebGL canvas, which clears it for a frame and drops the rendered
// glyphs — fitting on every animation frame of a divider drag therefore made
// the terminal text strobe. Trailing-edge debounce keeps the canvas (and its
// glyphs) at the last good size for the whole drag and reflows exactly once
// when motion settles. Mid-drag the host grows/shrinks around a fixed-size
// grid; the uncovered strip is the viewport, painted with the terminal
// background (see base.css), so the size mismatch is invisible.
const RESIZE_DEBOUNCE_MS = 100;

function rebindResizeObserver(entry: Entry, slot: HTMLElement) {
  if (entry.resizeObserver) {
    entry.resizeObserver.disconnect();
  }
  if (entry.resizeTimer !== null) {
    clearTimeout(entry.resizeTimer);
    entry.resizeTimer = null;
  }
  const observer = new ResizeObserver(() => {
    if (entry.resizeTimer !== null) {
      clearTimeout(entry.resizeTimer);
    }
    entry.resizeTimer = setTimeout(() => {
      entry.resizeTimer = null;
      // Skip while the slot is collapsed (the panel is hidden via display:none
      // on a non-terminal view). Fitting at zero size would shrink cols/rows,
      // and revealing the panel would then reflow the whole grid — a visible
      // cursor/content jump. Keeping the last good size means show is a no-op.
      if (slot.clientWidth === 0 || slot.clientHeight === 0) {
        return;
      }
      try {
        entry.fit.fit();
        void desktopApi.ptyResize(
          entry.terminalId,
          entry.term.cols,
          entry.term.rows,
        );
      } catch {
        // Slot may have been removed mid-debounce; ignore.
      }
    }, RESIZE_DEBOUNCE_MS);
  });
  observer.observe(slot);
  entry.resizeObserver = observer;
}

export function attachTerminal(
  terminalId: string,
  workspaceId: string,
  cwd: string,
  slot: HTMLElement,
): void {
  let entry = entries.get(terminalId);
  const firstAttach = entry === undefined;

  if (entry) {
    // Keep the cached entry current so restartTerminal reboots the shell in
    // the caller's latest cwd, not the one from the first attach.
    entry.workspaceId = workspaceId;
    entry.cwd = cwd;
  } else {
    entry = createEntry(terminalId, workspaceId, cwd);
    entries.set(terminalId, entry);
    // Hand any listeners that subscribed before this entry existed to the
    // live entry so they receive every subsequent status transition.
    const pending = pendingStatusListeners.get(terminalId);
    if (pending) {
      for (const listener of pending) {
        entry.listeners.add(listener);
      }
      pendingStatusListeners.delete(terminalId);
    }
  }

  // appendChild moves the host node if it was attached elsewhere.
  slot.appendChild(entry.host);

  if (firstAttach) {
    // term.open requires its container to be in the DOM, so we wait until
    // the host is parented before initializing the xterm DOM tree.
    entry.term.open(entry.host);
    tryLoadWebgl(entry);
    try {
      entry.fit.fit();
    } catch {
      // Slot may have zero size during first paint; ResizeObserver will
      // correct on the first measurable frame.
    }
    void bootPty(entry);
  } else {
    try {
      entry.fit.fit();
    } catch {
      // Same first-paint caveat.
    }
  }

  rebindResizeObserver(entry, slot);
}

export function detachTerminal(terminalId: string): void {
  const entry = entries.get(terminalId);
  if (!entry) {
    return;
  }
  if (entry.resizeObserver) {
    entry.resizeObserver.disconnect();
    entry.resizeObserver = null;
  }
  if (entry.resizeTimer !== null) {
    clearTimeout(entry.resizeTimer);
    entry.resizeTimer = null;
  }
  entry.host.parentElement?.removeChild(entry.host);
}

export function subscribeStatus(
  terminalId: string,
  listener: (status: TerminalStatus) => void,
): () => void {
  const entry = entries.get(terminalId);
  if (!entry) {
    // No entry yet: caller is racing with attach (a freshly created tab that
    // hasn't mounted, or an inactive tab's status dot). Park the listener so
    // attachTerminal can hand it to the entry once it exists.
    let pending = pendingStatusListeners.get(terminalId);
    if (!pending) {
      pending = new Set();
      pendingStatusListeners.set(terminalId, pending);
    }
    pending.add(listener);
    listener({ kind: "spawning" });
    return () => {
      const set = pendingStatusListeners.get(terminalId);
      if (set) {
        set.delete(listener);
        if (set.size === 0) {
          pendingStatusListeners.delete(terminalId);
        }
      }
      // attachTerminal may have handed this listener to the live entry since
      // we parked it; remove it there too or it leaks past unsubscribe.
      entries.get(terminalId)?.listeners.delete(listener);
    };
  }
  entry.listeners.add(listener);
  listener(entry.status);
  return () => {
    entry.listeners.delete(listener);
  };
}

export type SearchDirection = "next" | "previous";

export function searchInTerminal(
  terminalId: string,
  query: string,
  direction: SearchDirection,
): boolean {
  const entry = entries.get(terminalId);
  if (!entry || !query) {
    return false;
  }
  const opts = { caseSensitive: false, wholeWord: false };
  return direction === "next"
    ? entry.search.findNext(query, opts)
    : entry.search.findPrevious(query, opts);
}

export function clearTerminalSearch(terminalId: string): void {
  const entry = entries.get(terminalId);
  if (!entry) {
    return;
  }
  // SearchAddon doesn't expose a clear API; clearing the xterm selection is
  // the closest visual reset.
  entry.term.clearSelection();
}

export function focusTerminal(terminalId: string): void {
  const entry = entries.get(terminalId);
  if (!entry) {
    return;
  }
  if (entry.status.kind === "ready") {
    entry.term.focus();
  }
}

export async function restartTerminal(terminalId: string): Promise<void> {
  const entry = entries.get(terminalId);
  if (!entry) {
    return;
  }
  // Hard reset xterm so the user gets a clean screen on restart. Scrollback
  // history is intentionally cleared because the user explicitly asked for
  // a fresh shell.
  entry.term.reset();
  try {
    await desktopApi.ptyKill(terminalId);
  } catch {
    // PTY may already be gone (exit path); ignore.
  }
  await bootPty(entry);
}

export async function disposeTerminal(terminalId: string): Promise<void> {
  const entry = entries.get(terminalId);
  if (!entry) {
    return;
  }
  entries.delete(terminalId);
  activityState.delete(terminalId);
  pendingStatusListeners.delete(terminalId);
  for (const unsub of entry.unsubscribers) {
    unsub();
  }
  entry.inputDisposable.dispose();
  entry.resizeObserver?.disconnect();
  if (entry.resizeTimer !== null) {
    clearTimeout(entry.resizeTimer);
  }
  entry.host.parentElement?.removeChild(entry.host);
  entry.term.dispose();
  try {
    await desktopApi.ptyKill(terminalId);
  } catch {
    // PTY may already be gone through a natural exit.
  }
}

export function disposeAllTerminals(): void {
  for (const terminalId of Array.from(entries.keys())) {
    void disposeTerminal(terminalId);
  }
}

export function refreshTerminalThemes() {
  // CSS variables drive theme + code font; re-read so Appearance changes apply.
  const theme = buildTerminalTheme();
  const fontFamily = readTerminalFontFamily();
  const fontSize = readTerminalFontSize();
  for (const [, entry] of entries) {
    entry.term.options.theme = theme;
    entry.term.options.fontFamily = fontFamily;
    entry.term.options.fontSize = fontSize;
    try {
      entry.fit.fit();
    } catch {
      // Host may be detached; fit on next attach.
    }
  }
}

// Last-ditch cleanup: in production the main process already disposes the
// underlying PTY children on window close, but the renderer-side xterm
// instances and IPC subscriptions can leak across Vite HMR reloads otherwise.
if (typeof window !== "undefined") {
  // Single global subscription fans foreground/cwd updates out to per-terminal
  // listeners via the activityState cache.
  desktopApi.onPtyActivity(handleActivity);

  window.addEventListener("beforeunload", () => {
    disposeAllTerminals();
  });

  // App theme/appearance changes are announced instead of calling in here, so
  // the xterm bundle stays out of the startup path until a terminal exists.
  onThemeChanged(refreshTerminalThemes);

  // React to OS-level color-scheme changes so the terminal stops contrasting
  // with the rest of the app when the user flips dark ↔ light.
  if (typeof window.matchMedia === "function") {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener?.("change", refreshTerminalThemes);
  }
}
