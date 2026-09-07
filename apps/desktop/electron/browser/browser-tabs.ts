import { randomUUID } from "node:crypto";
import type { BrowserTab, BrowserTabsSnapshot } from "@cocurdex/shared";
import type { BrowserWindow, Rectangle } from "electron";
import { createBrowserView } from "./browser-view";
import { browserHtmlPreviews } from "./html-preview-protocol";
import { preparePreview } from "./prepare-preview";
import { previewScrollPosition, updatePreviewDom } from "./preview-dom";

type TabEntry = ReturnType<typeof createBrowserView> & {
  state: BrowserTab;
  sourceId?: string;
  contentKey?: string;
  previewUrl?: string;
  preparation?: AbortController;
  annotationMode?: boolean;
};

const tabs = new Map<string, TabEntry>();
let activeId: string | null = null;
let host: BrowserWindow | null = null;
let visible = false;
let bounds: Rectangle = { x: 0, y: 0, width: 0, height: 0 };

export function getBrowserTabs(): BrowserTabsSnapshot {
  return {
    tabs: [...tabs.values()].map(({ state }) => ({ ...state })),
    activeId,
  };
}

function changed() {
  if (host && !host.isDestroyed())
    host.webContents.send("browser:tabs", getBrowserTabs());
}

export function attachBrowserHost(window: BrowserWindow) {
  host = window;
  window.once("closed", () => {
    host = null;
    for (const id of tabs.keys()) closeBrowserTab(id);
    visible = false;
  });
}

export function getBrowserView() {
  return activeId ? tabs.get(activeId)?.view : undefined;
}

export function setBrowserVisible(next: boolean) {
  visible = next;
  for (const [id, tab] of tabs) tab.view.setVisible(visible && id === activeId);
}

export function setBrowserBounds(next: Rectangle) {
  bounds = next;
  getBrowserView()?.setBounds(bounds);
}

export function activateBrowserTab(id: string) {
  if (!tabs.has(id)) return;
  getBrowserView()?.setVisible(false);
  activeId = id;
  getBrowserView()?.setBounds(bounds);
  setBrowserVisible(visible);
  changed();
}

function createTab(
  url: string,
  sourceId?: string,
  previewUrl?: string,
  streaming = false,
) {
  const state: BrowserTab = {
    id: randomUUID(),
    url,
    title: "",
    loading: false,
    streaming,
    error: null,
  };
  const entry = {
    ...createBrowserView(state, changed),
    state,
    sourceId,
    previewUrl,
  };
  tabs.set(state.id, entry);
  host?.contentView.addChildView(entry.view);
  activateBrowserTab(state.id);
  return entry;
}

async function load(tab: TabEntry, url: string) {
  tab.preparation?.abort();
  tab.state.url = url;
  tab.state.error = null;
  tab.state.loading = true;
  changed();
  try {
    await tab.view.webContents.loadURL(url);
  } catch (error) {
    if (tabs.has(tab.state.id) && !String(error).includes("ERR_ABORTED")) {
      tab.state.error = error instanceof Error ? error.message : String(error);
      tab.state.loading = false;
      changed();
    }
  }
}

async function finalizePreview(tab: TabEntry, url: string, html: string) {
  tab.preparation?.abort();
  const controller = new AbortController();
  tab.preparation = controller;
  const oldView = tab.view;
  const state = {
    ...tab.state,
    error: null,
    previewError: undefined,
    streaming: false,
  };
  let committed = false;
  const candidate = createBrowserView(state, () => {
    if (committed) changed();
  });
  const owner = host;
  candidate.view.setBounds(bounds);
  owner?.contentView.addChildView(candidate.view);
  try {
    await preparePreview(
      candidate.view,
      oldView,
      url,
      controller.signal,
      html,
      async () => {
        if (tab.annotationMode) await candidate.toggleAnnotation(true);
      },
    );
    if (
      tabs.get(tab.state.id) !== tab ||
      tab.view !== oldView ||
      tab.state.url.split("#", 1)[0] !== url ||
      controller.signal.aborted
    )
      return;
    if (controller.signal.aborted || tabs.get(tab.state.id) !== tab) return;
    candidate.view.setBounds(bounds);
    tab.view = candidate.view;
    tab.toggleAnnotation = candidate.toggleAnnotation;
    tab.state = state;
    committed = true;
    candidate.view.setVisible(visible && activeId === state.id);
    oldView.setVisible(false);
    owner?.contentView.removeChildView(oldView);
    oldView.webContents.close();
  } catch (error) {
    if (!controller.signal.aborted && tabs.get(tab.state.id) === tab) {
      tab.state.previewError =
        error instanceof Error ? error.message : String(error);
    }
  } finally {
    if (!committed) {
      controller.abort();
      if (host === owner) owner?.contentView.removeChildView(candidate.view);
      candidate.view.webContents.close();
    }
    if (tab.preparation === controller) tab.preparation = undefined;
  }
}

export async function navigateBrowser(url: string) {
  const tab = (activeId && tabs.get(activeId)) || createTab(url);
  await load(tab, url);
}

export async function openBrowserHtml(
  html: string,
  sourceId: string,
  streaming = false,
) {
  const existing = [...tabs.values()].find(
    (tab) => tab.sourceId === sourceId || tab.contentKey === sourceId,
  );
  if (existing?.previewUrl) {
    activateBrowserTab(existing.state.id);
    if (existing.state.url.split("#", 1)[0] !== existing.previewUrl) {
      await load(existing, existing.previewUrl);
    }
    return existing.previewUrl;
  }
  const url = browserHtmlPreviews.add(html);
  const tab = createTab(url, sourceId, url, streaming);
  await load(tab, url);
  return url;
}

export async function updateBrowserHtml(
  url: string,
  html: string,
  contentKey: string,
  streaming = false,
) {
  const tab = [...tabs.values()].find((entry) => entry.previewUrl === url);
  if (!tab) return false;
  tab.contentKey = contentKey;
  browserHtmlPreviews.update(url, html);
  if (tab.state.url.split("#", 1)[0] === url) {
    const contents = tab.view.webContents;
    if (streaming && tab.state.streaming) {
      const result = await contents.executeJavaScriptInIsolatedWorld(1001, [
        {
          code: `(${updatePreviewDom.toString()})(${JSON.stringify(html)})`,
        },
      ]);
      if (!result || typeof result.title !== "string")
        throw new Error("Unable to update HTML preview");
      if (result.title) tab.state.title = result.title;
    } else if (tab.state.streaming && !streaming) {
      await finalizePreview(tab, url, html);
    } else {
      const scroll = await contents.executeJavaScriptInIsolatedWorld(1001, [
        {
          code: `(${previewScrollPosition.toString()})()`,
        },
      ]);
      await load(tab, url);
      if (tabs.has(tab.state.id) && scroll) {
        await contents.executeJavaScriptInIsolatedWorld(1001, [
          {
            code: `window.scrollTo({top: ${scroll.follow ? "document.documentElement.scrollHeight" : Number(scroll.top)}, behavior: "instant"})`,
          },
        ]);
      }
    }
  }
  tab.state.streaming = streaming;
  changed();
  return true;
}

export function closeBrowserTab(id: string) {
  const tab = tabs.get(id);
  if (!tab) return getBrowserTabs();
  const ids = [...tabs.keys()];
  const index = ids.indexOf(id);
  tabs.delete(id);
  tab.preparation?.abort();
  host?.contentView.removeChildView(tab.view);
  tab.view.webContents.close();
  if (tab.previewUrl) browserHtmlPreviews.remove(tab.previewUrl);
  if (activeId === id) {
    activeId = null;
    const next = ids[index + 1] ?? ids[index - 1];
    if (next) activateBrowserTab(next);
  }
  changed();
  return getBrowserTabs();
}

export async function toggleBrowserAnnotationMode(enabled: boolean) {
  const tab = activeId ? tabs.get(activeId) : undefined;
  if (tab) {
    tab.annotationMode = enabled;
    await tab.toggleAnnotation(enabled);
  }
}

export function browserTabIdForContents(id: number) {
  return [...tabs.values()].find((tab) => tab.view.webContents.id === id)?.state
    .id;
}
