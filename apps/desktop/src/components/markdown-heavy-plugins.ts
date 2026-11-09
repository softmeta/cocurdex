import { cjk } from "@streamdown/cjk";
import { startTransition } from "react";
import type { PluginConfig } from "streamdown";
import { HtmlPreview } from "./markdown-html-preview";

export type HeavyPluginKind = "code" | "math" | "mermaid";

const importers: Record<HeavyPluginKind, () => Promise<PluginConfig>> = {
  code: () =>
    import("./markdown-code-highlighter")
      .then((module) => module.loadMarkdownCodeHighlighter())
      .then((code) => ({ code })),
  math: () =>
    import("@streamdown/math").then((module) => ({
      math: module.createMathPlugin({ singleDollarTextMath: true }),
    })),
  mermaid: () =>
    import("./markdown-mermaid").then((module) => ({
      renderers: [module.MERMAID_RENDERER],
    })),
};

export const LIGHT_STREAMDOWN_PLUGINS: PluginConfig = {
  cjk,
  renderers: [{ language: ["html", "htm"], component: HtmlPreview }],
};

const loaded = new Map<HeavyPluginKind, PluginConfig>();
const inFlight = new Set<HeavyPluginKind>();
const listeners = new Set<() => void>();

let snapshot: PluginConfig = LIGHT_STREAMDOWN_PLUGINS;
let loadedKinds: ReadonlySet<HeavyPluginKind> = new Set();

function mergePluginConfigs(configs: PluginConfig[]): PluginConfig {
  return {
    ...LIGHT_STREAMDOWN_PLUGINS,
    ...Object.assign({}, ...configs),
    renderers: [LIGHT_STREAMDOWN_PLUGINS, ...configs].flatMap(
      (config) => config.renderers ?? [],
    ),
  };
}

export function getLoadedHeavyPluginKinds() {
  return loadedKinds;
}

export function getStreamdownPlugins() {
  return snapshot;
}

export function subscribeStreamdownPlugins(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function loadHeavyPlugins(kinds: readonly HeavyPluginKind[]) {
  for (const kind of kinds) {
    if (loaded.has(kind) || inFlight.has(kind)) {
      continue;
    }

    inFlight.add(kind);
    void importers[kind]()
      .then((plugin) => {
        loaded.set(kind, plugin);
        snapshot = mergePluginConfigs([...loaded.values()]);
        loadedKinds = new Set(loaded.keys());
        startTransition(() => {
          for (const listener of listeners) {
            listener();
          }
        });
      })
      .catch((error) => {
        console.error("[Markdown] heavy plugin load failed", kind, error);
      })
      .finally(() => {
        inFlight.delete(kind);
      });
  }
}
