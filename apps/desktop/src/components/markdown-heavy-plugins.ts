import { cjk } from "@streamdown/cjk";
import { startTransition } from "react";
import type { PluginConfig } from "streamdown";
import { HtmlPreview } from "./markdown-html-preview";

// Streamdown's heavyweight plugins (syntax highlighting, KaTeX, Mermaid) dominate the
// renderer bundle, and a message only needs them when it actually contains a
// code fence, math, or a diagram. Loading them on demand keeps them out of the
// startup path; until they land, that message renders with the light plugin
// set, which is the same fallback plain prose already uses.
//
// They load independently: a transcript full of code fences must not pull in
// Mermaid, which is the largest of the three and is needed only by ```mermaid.
export type HeavyPluginKind = "code" | "math" | "mermaid";

const importers: Record<HeavyPluginKind, () => Promise<PluginConfig>> = {
  code: () =>
    import("./markdown-code-highlighter")
      .then((module) => module.loadMarkdownCodeHighlighter())
      .then((code) => ({ code })),
  // singleDollarTextMath keeps the $E=mc^2$ form our prompts use; double-dollar
  // blocks still work.
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

// useSyncExternalStore compares snapshots by identity, so this must stay the
// same object until a plugin actually lands. Building it per call makes React
// re-render forever.
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
        // Every mounted MarkdownRenderer re-renders here, and on a long
        // transcript that means highlighting the whole history at once. Keep it
        // interruptible so hover and input stay alive while it runs.
        startTransition(() => {
          for (const listener of listeners) {
            listener();
          }
        });
      })
      .catch((error) => {
        // Leave the light plugin set in place and allow a later retry.
        console.error("[Markdown] heavy plugin load failed", kind, error);
      })
      .finally(() => {
        inFlight.delete(kind);
      });
  }
}
