import type { MermaidAppearance } from "@cocurdex/shared";

export type RenderedDiagram = {
  svg: string;
  width: number;
  height: number;
  image: string | null;
};

export type DiagramEntry =
  | { kind: "rendered"; id: string; diagram: RenderedDiagram }
  | { kind: "failed"; id: string };

const DEFAULT_CAPACITY = 64;

export function createDiagramCache(
  capacity = DEFAULT_CAPACITY,
  release: (diagram: RenderedDiagram) => void = () => undefined,
) {
  const entries = new Map<string, DiagramEntry>();
  const sources = new Map<string, string>();
  const listeners = new Set<() => void>();
  let nextId = 0;

  const keyOf = (source: string, appearance: MermaidAppearance) =>
    `${appearance}\n${source}`;

  function forget(key: string) {
    const previous = entries.get(key);
    if (!previous) return;
    entries.delete(key);
    sources.delete(previous.id);
    if (previous.kind === "rendered") release(previous.diagram);
  }

  function store(source: string, key: string, entry: DiagramEntry) {
    forget(key);
    entries.set(key, entry);
    sources.set(entry.id, source);
    for (const oldest of entries.keys()) {
      if (entries.size <= capacity) break;
      forget(oldest);
    }
    for (const listener of [...listeners]) listener();
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    get(source: string, appearance: MermaidAppearance) {
      return entries.get(keyOf(source, appearance)) ?? null;
    },
    sourceOf(id: string) {
      return sources.get(id) ?? null;
    },
    rendered(
      source: string,
      appearance: MermaidAppearance,
      diagram: RenderedDiagram,
    ) {
      nextId += 1;
      store(source, keyOf(source, appearance), {
        kind: "rendered",
        id: String(nextId),
        diagram,
      });
    },
    failed(source: string, appearance: MermaidAppearance) {
      nextId += 1;
      store(source, keyOf(source, appearance), {
        kind: "failed",
        id: String(nextId),
      });
    },
  };
}
