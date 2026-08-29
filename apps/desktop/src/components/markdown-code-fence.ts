interface ActiveFence {
  character: "`" | "~";
  length: number;
}

function parseFenceMarker(line: string): {
  indent: string;
  marker: string;
  rest: string;
} | null {
  const match = /^(\s{0,3})(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match) {
    return null;
  }

  return {
    indent: match[1] ?? "",
    marker: match[2] ?? "",
    rest: match[3] ?? "",
  };
}

function isClosingFence(line: string, activeFence: ActiveFence): boolean {
  const fence = parseFenceMarker(line);
  if (!fence || fence.rest.trim().length > 0) {
    return false;
  }

  return (
    fence.marker[0] === activeFence.character &&
    fence.marker.length >= activeFence.length
  );
}

function getFileAnnotationLanguage(info: string): string | null {
  const annotation = /^\d+:\d+:(.+)$/.exec(info);
  const filePath = annotation?.[1]?.trim();
  if (!filePath) {
    return null;
  }

  const extension = /\.([a-z0-9]+)$/i.exec(filePath)?.[1];
  return extension?.toLowerCase() ?? null;
}

export function normalizeMarkdownCodeFenceLanguages(content: string): string {
  let activeFence: ActiveFence | null = null;

  return content
    .split("\n")
    .map((line) => {
      if (activeFence) {
        if (isClosingFence(line, activeFence)) {
          activeFence = null;
        }
        return line;
      }

      const fence = parseFenceMarker(line);
      if (!fence) {
        return line;
      }

      activeFence = {
        character: fence.marker[0] as "`" | "~",
        length: fence.marker.length,
      };

      const info = fence.rest.trim();
      const language = getFileAnnotationLanguage(info);
      if (!language) {
        return line;
      }

      return `${fence.indent}${fence.marker}${language} ${info}`;
    })
    .join("\n");
}
