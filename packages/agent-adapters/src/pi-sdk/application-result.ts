const MAX_TEXT = 64_000;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function applicationToolResult(value: unknown) {
  if (!record(value)) throw new Error("Invalid application tool result");
  let remaining = MAX_TEXT;
  let omitted = 0;
  const content: { type: "text"; text: string }[] = [];
  const append = (text: string) => {
    if (!remaining) {
      omitted += 1;
      return;
    }
    const points: string[] = [];
    for (const point of text) {
      if (points.length === remaining) break;
      points.push(point);
    }
    const selected = points.join("");
    remaining -= points.length;
    content.push({ type: "text", text: selected });
    if (selected.length < text.length) omitted += 1;
  };
  if (Array.isArray(value.content)) {
    omitted += Math.max(0, value.content.length - 256);
    for (const item of value.content.slice(0, 256)) {
      if (!record(item)) continue;
      if (item.type === "text" && typeof item.text === "string")
        append(item.text);
      else if (item.type === "resource_link" && typeof item.uri === "string")
        append(
          JSON.stringify({
            uri: item.uri,
            name: item.name,
            mimeType: item.mimeType,
          }),
        );
      else if (
        item.type === "resource" &&
        record(item.resource) &&
        typeof item.resource.text === "string"
      )
        append(item.resource.text);
      else omitted += 1;
    }
  }
  if (
    value.structuredContent !== undefined &&
    (!Array.isArray(value.content) || value.content.length === 0)
  )
    append(JSON.stringify(value.structuredContent));
  return { content, isError: value.isError === true, omittedContent: omitted };
}
