import { MATH_LANGUAGE } from "@cocurdex/note-doc";
import {
  createNotePreviews,
  hasEditingDecoration,
  type RenderedLanguage,
  renderedLanguage,
} from "@cocurdex/note-doc/preview";
import type { NodeViewRendererProps } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Decoration } from "@tiptap/pm/view";
import type {
  NoteDiagram,
  NoteDiagramRequest,
} from "../../src/notes/editor/note-editor-protocol";
import { NOTE_MATH_READY_EVENT } from "./math-contract";

const REQUEST_DELAY_MS = 150;
const DIAGRAM_CACHE_LIMIT = 32;
const SOURCE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/></svg>';

export interface PreviewLabels {
  showSource: string;
  openDiagram: string;
}

interface PreviewHost {
  requestDiagrams(requests: NoteDiagramRequest[]): void;
  requestMath(): void;
  openDiagram(source: string): void;
}

function sanitizedSvg(svg: string) {
  const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = parsed.documentElement;
  if (root.localName !== "svg" || parsed.querySelector("parsererror")) {
    return null;
  }
  for (const script of root.querySelectorAll("script")) script.remove();
  for (const element of [root, ...root.querySelectorAll("*")]) {
    for (const { name, value } of [...element.attributes]) {
      const lower = name.toLowerCase();
      const externalLink =
        (lower === "href" || lower.endsWith(":href")) && !value.startsWith("#");
      if (lower.startsWith("on") || externalLink) {
        element.removeAttribute(name);
      }
    }
  }
  return document.importNode(root, true);
}

export function createRenderedPreviews({
  requestDiagrams,
  requestMath,
  openDiagram,
}: PreviewHost) {
  let labels: PreviewLabels = { showSource: "", openDiagram: "" };
  const diagrams = new Map<string, NoteDiagram | null>();
  const requested = new Map<number, string>();
  const asked = new Set<string>();
  const queue: NoteDiagramRequest[] = [];
  const repaints = new Set<() => void>();
  const waitingInline = new Map<HTMLElement, string>();
  let nextId = 1;
  let mathRequested = false;

  function needMath() {
    if (window.noteMath || mathRequested) return;
    mathRequested = true;
    requestMath();
  }

  function repaintAll() {
    for (const repaint of repaints) repaint();
  }

  function paintInline(target: HTMLElement, tex: string) {
    const rendered = window.noteMath?.render(tex, false);
    if (rendered?.html) target.innerHTML = rendered.html;
    else target.textContent = tex;
  }

  window.addEventListener(NOTE_MATH_READY_EVENT, () => {
    for (const [target, tex] of waitingInline) {
      if (target.isConnected) paintInline(target, tex);
    }
    waitingInline.clear();
    repaintAll();
  });

  function flush() {
    if (queue.length > 0) requestDiagrams(queue.splice(0));
  }

  function askDiagram(source: string) {
    if (asked.has(source)) return;
    asked.add(source);
    const id = nextId;
    nextId += 1;
    requested.set(id, source);
    queue.push({ id, source });
    if (queue.length === 1) setTimeout(flush, REQUEST_DELAY_MS);
  }

  function receiveDiagram(id: number, diagram: NoteDiagram | null) {
    const source = requested.get(id);
    requested.delete(id);
    if (source === undefined) return;
    diagrams.delete(source);
    diagrams.set(source, diagram);
    for (const oldest of diagrams.keys()) {
      if (diagrams.size <= DIAGRAM_CACHE_LIMIT) break;
      diagrams.delete(oldest);
      asked.delete(oldest);
    }
    repaintAll();
  }

  function reset() {
    diagrams.clear();
    asked.clear();
    requested.clear();
    repaintAll();
  }

  function paintMath(preview: HTMLElement, source: string) {
    const rendered = window.noteMath?.render(source, true);
    if (!rendered) {
      needMath();
      return true;
    }
    if (rendered.html !== null) {
      preview.innerHTML = rendered.html;
      return true;
    }
    const error = document.createElement("p");
    error.className = "code-preview-error";
    error.textContent = rendered.error;
    preview.replaceChildren(error);
    return true;
  }

  function paintDiagram(preview: HTMLElement, source: string) {
    if (!diagrams.has(source)) {
      askDiagram(source);
      return true;
    }
    const diagram = diagrams.get(source);
    const svg = diagram ? sanitizedSvg(diagram.svg) : null;
    if (!diagram || !svg) {
      preview.replaceChildren();
      return false;
    }
    svg.removeAttribute("height");
    svg.setAttribute("width", String(diagram.width));
    preview.replaceChildren(svg);
    return true;
  }

  function codeBlockView({
    node,
    editor,
    getPos,
    decorations,
  }: NodeViewRendererProps) {
    const dom = document.createElement("div");
    dom.className = "code-block";
    const tools = document.createElement("div");
    tools.className = "code-tools";
    tools.contentEditable = "false";
    const sourceToggle = document.createElement("button");
    sourceToggle.type = "button";
    sourceToggle.innerHTML = SOURCE_ICON;
    tools.append(sourceToggle);
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    pre.append(code);
    const preview = document.createElement("div");
    preview.className = "code-preview";
    preview.contentEditable = "false";
    dom.append(tools, pre, preview);
    let current: ProseMirrorNode = node;
    let shown: { language: RenderedLanguage; source: string } | null = null;
    let editing = hasEditingDecoration(decorations as readonly Decoration[]);
    let pinned = false;

    const syncSource = () => {
      const sourceShown = pinned || editing;
      dom.toggleAttribute("data-source", pinned);
      sourceToggle.setAttribute("aria-label", labels.showSource);
      sourceToggle.setAttribute("aria-pressed", String(sourceShown));
      const diagram = shown?.language !== MATH_LANGUAGE && shown !== null;
      if (diagram && !dom.hasAttribute("data-failed")) {
        preview.setAttribute("role", "button");
        preview.setAttribute("aria-label", labels.openDiagram);
      } else {
        preview.removeAttribute("role");
        preview.removeAttribute("aria-label");
      }
    };

    const paint = () => {
      const language = renderedLanguage(current.attrs.language);
      const source = current.textContent;
      dom.toggleAttribute("data-rendered", language !== null);
      dom.toggleAttribute("data-empty", source.trim() === "");
      if (!language || source.trim() === "") {
        preview.replaceChildren();
        shown = null;
        dom.removeAttribute("data-failed");
        return;
      }
      const painted =
        language === MATH_LANGUAGE
          ? paintMath(preview, source)
          : paintDiagram(preview, source);
      dom.toggleAttribute("data-failed", !painted);
      shown = { language, source };
    };
    const repaint = () => {
      paint();
      syncSource();
    };

    for (const target of [tools, preview]) {
      target.addEventListener("mousedown", (event) => event.preventDefault());
    }
    sourceToggle.addEventListener("click", (event) => {
      event.preventDefault();
      if (pinned || editing) {
        pinned = false;
        if (editing) editor.commands.blur();
        syncSource();
        return;
      }
      pinned = true;
      syncSource();
      const pos = getPos();
      if (!editor.isEditable || typeof pos !== "number") return;
      editor.commands.focus(pos + 1 + current.content.size);
    });
    preview.addEventListener("click", (event) => {
      event.preventDefault();
      if (preview.getAttribute("role") === "button" && shown) {
        openDiagram(shown.source);
      }
    });

    repaints.add(repaint);
    repaint();

    return {
      dom,
      contentDOM: code,
      update(next: ProseMirrorNode, nextDecorations: readonly Decoration[]) {
        if (next.type !== current.type) return false;
        const changed =
          next.textContent !== shown?.source ||
          renderedLanguage(next.attrs.language) !== shown?.language;
        current = next;
        editing = hasEditingDecoration(nextDecorations);
        if (changed) paint();
        syncSource();
        return true;
      },
      ignoreMutation(mutation: MutationRecord | { type: "selection" }) {
        if (mutation.type === "selection") return false;
        const { target } = mutation as MutationRecord;
        return (
          preview.contains(target) ||
          tools.contains(target) ||
          (target === dom && mutation.type === "attributes")
        );
      },
      destroy() {
        repaints.delete(repaint);
      },
    };
  }

  const inlineMath = createNotePreviews({
    renderInlineMath(tex, target) {
      if (window.noteMath) {
        paintInline(target, tex);
        return;
      }
      target.textContent = tex;
      waitingInline.set(target, tex);
      needMath();
    },
  });

  function setLabels(next: PreviewLabels) {
    labels = next;
    repaintAll();
  }

  return { codeBlockView, inlineMath, receiveDiagram, reset, setLabels };
}
