import type { PtyActivityEvent } from "@cocurdex/shared";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { type IDisposable, Terminal } from "@xterm/xterm";
import { desktopApi, onThemeChanged, readCssVarPx } from "@/lib";
import "@xterm/xterm/css/xterm.css";
import { markTerminalLive, takeQueuedTerminalCommand } from "./terminal-store";
import {
  buildTerminalTheme,
  terminalBackgroundIsTransparent,
} from "./terminal-theme";

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
  | { kind: "ready"; shell: string }
  | { kind: "error"; message: string }
  | { kind: "exited"; exitCode: number };

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

export function getTerminalActivity(
  terminalId: string,
): TerminalActivity | null {
  return activityState.get(terminalId) ?? null;
}

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

const pendingStatusListeners = new Map<
  string,
  Set<(status: TerminalStatus) => void>
>();

const SPAWNING_STATUS: TerminalStatus = { kind: "spawning" };

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
    allowTransparency: terminalBackgroundIsTransparent(),
    theme: buildTerminalTheme(),
    fontFamily: readTerminalFontFamily(),
    fontSize: readTerminalFontSize(),
    cursorBlink: true,
    scrollback: 5000,
    allowProposedApi: true,
    overviewRuler: { width: 6 },
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.loadAddon(
    new WebLinksAddon((event, uri) => {
      event.preventDefault();
      void desktopApi.openExternal(uri);
    }),
  );
  const search = new SearchAddon();
  term.loadAddon(search);

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
        .catch(() => {});
      return false;
    }
    if (key === "f") {
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
    const queued = takeQueuedTerminalCommand(entry.terminalId);
    if (queued) {
      void desktopApi.ptyWrite(entry.terminalId, queued);
    }
    entry.term.focus();
  } catch (error) {
    setStatus(entry, {
      kind: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function tryLoadWebgl(entry: Entry) {
  try {
    const webgl = new WebglAddon();
    webgl.onContextLoss(() => {
      webgl.dispose();
    });
    entry.term.loadAddon(webgl);
  } catch {}
}

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
      } catch {}
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
    entry.workspaceId = workspaceId;
    entry.cwd = cwd;
  } else {
    entry = createEntry(terminalId, workspaceId, cwd);
    entries.set(terminalId, entry);
    markTerminalLive(terminalId, true);
    const pending = pendingStatusListeners.get(terminalId);
    if (pending) {
      for (const listener of pending) {
        entry.listeners.add(listener);
      }
      pendingStatusListeners.delete(terminalId);
    }
  }

  slot.appendChild(entry.host);

  if (firstAttach) {
    entry.term.open(entry.host);
    tryLoadWebgl(entry);
    try {
      entry.fit.fit();
    } catch {}
    void bootPty(entry);
  } else {
    try {
      entry.fit.fit();
    } catch {}
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
  entry.term.reset();
  try {
    await desktopApi.ptyKill(terminalId);
  } catch {}
  await bootPty(entry);
}

export async function disposeTerminal(terminalId: string): Promise<void> {
  const entry = entries.get(terminalId);
  if (!entry) {
    return;
  }
  entries.delete(terminalId);
  markTerminalLive(terminalId, false);
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
  } catch {}
}

export function disposeAllTerminals(): void {
  for (const terminalId of Array.from(entries.keys())) {
    void disposeTerminal(terminalId);
  }
}

export function refreshTerminalThemes() {
  const theme = buildTerminalTheme();
  const fontFamily = readTerminalFontFamily();
  const fontSize = readTerminalFontSize();
  for (const [, entry] of entries) {
    entry.term.options.theme = theme;
    entry.term.options.fontFamily = fontFamily;
    entry.term.options.fontSize = fontSize;
    try {
      entry.fit.fit();
    } catch {}
  }
}

if (typeof window !== "undefined") {
  desktopApi.onPtyActivity(handleActivity);

  window.addEventListener("beforeunload", () => {
    disposeAllTerminals();
  });

  onThemeChanged(refreshTerminalThemes);

  if (typeof window.matchMedia === "function") {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener?.("change", refreshTerminalThemes);
  }
}
