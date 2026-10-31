const REVERSED_MARKER =
  /<marker\b([^>]*?)\sorient="auto-start-reverse"([^>]*)>([\s\S]*?)<\/marker>/g;

function attributeValue(attributes: string, name: string) {
  return attributes.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
}

export function withoutReversedMarkers(svg: string) {
  if (!svg.includes("auto-start-reverse")) return svg;
  const reversedIds = new Set<string>();
  const markers = svg.replace(
    REVERSED_MARKER,
    (_match, before: string, after: string, content: string) => {
      const attributes = `${before}${after}`;
      const id = attributeValue(attributes, "id");
      const forward = `<marker${before} orient="auto"${after}>${content}</marker>`;
      if (!id) return forward;
      reversedIds.add(id);
      const refX = attributeValue(attributes, "refX") ?? "0";
      const refY = attributeValue(attributes, "refY") ?? "0";
      const reversedAttributes = `${before} orient="auto"${after}`.replace(
        `id="${id}"`,
        `id="${id}--reversed"`,
      );
      const reversed = `<marker${reversedAttributes}><g transform="rotate(180 ${refX} ${refY})">${content}</g></marker>`;
      return `${forward}\n${reversed}`;
    },
  );
  return markers.replace(/marker-start="url\(#([^)]+)\)"/g, (match, id) =>
    reversedIds.has(id) ? `marker-start="url(#${id}--reversed)"` : match,
  );
}
