const RENDER_ID_PREFIX = /^cocurdex-mermaid-\d+[-_]/;
const DEFINITION_TAGS = new Set([
  "filter",
  "lineargradient",
  "marker",
  "radialgradient",
  "style",
]);

function partKey(element: Element) {
  const tag = element.tagName.toLowerCase();
  const dataId = element.getAttribute("data-id");
  if (dataId) {
    return `${tag}[data-id=${dataId}]`;
  }
  if (DEFINITION_TAGS.has(tag)) {
    return null;
  }
  return element.id
    ? `${tag}#${element.id.replace(RENDER_ID_PREFIX, "")}`
    : null;
}

export function collectMermaidParts(svg: Element) {
  const parts = new Map<string, Element>();
  for (const element of svg.querySelectorAll("[id], [data-id]")) {
    const key = partKey(element);
    if (key && !parts.has(key)) {
      parts.set(key, element);
    }
  }
  return parts;
}

export function newMermaidParts(
  parts: ReadonlyMap<string, Element>,
  previousKeys: ReadonlySet<string>,
) {
  const added = new Set<Element>();
  for (const [key, element] of parts) {
    if (!previousKeys.has(key)) {
      added.add(element);
    }
  }
  return [...added].filter((element) => {
    for (
      let parent = element.parentElement;
      parent;
      parent = parent.parentElement
    ) {
      if (added.has(parent)) {
        return false;
      }
    }
    return true;
  });
}
