export interface ExtractedNoteLink {
  kind: "markdown" | "wikilink";
  targetRef: string;
}

export interface ExtractedNoteMetadata {
  tags: string[];
  links: ExtractedNoteLink[];
}

function stripCode(bodyMarkdown: string): string {
  return bodyMarkdown
    .replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[^\n]*$/gmu, " ")
    .replace(/`[^`\n]*`/gu, " ");
}

export function extractNoteMetadata(
  bodyMarkdown: string,
): ExtractedNoteMetadata {
  const prose = stripCode(bodyMarkdown);
  const tags = new Set<string>();
  for (const match of prose
    .replace(/\]\([^)\n]*\)/gu, "]")
    .matchAll(/(?:^|[\s(])#([\p{L}\p{N}_/-]+)/gu)) {
    const tag = match[1]?.trim().toLocaleLowerCase();
    if (tag && /[^\p{N}]/u.test(tag)) {
      tags.add(tag);
    }
  }

  const links: ExtractedNoteLink[] = [];
  const seenLinks = new Set<string>();
  for (const match of prose.matchAll(/\[\[([^\]\n]+)\]\]/gu)) {
    addLink(links, seenLinks, "wikilink", match[1]?.split(/[|#]/u)[0]);
  }
  for (const match of prose.matchAll(/\[[^\]\n]*\]\(note:\/\/([^)]+)\)/gu)) {
    addLink(links, seenLinks, "markdown", match[1]);
  }

  return { tags: [...tags].sort(), links };
}

function addLink(
  links: ExtractedNoteLink[],
  seenLinks: Set<string>,
  kind: ExtractedNoteLink["kind"],
  rawTargetRef: string | undefined,
): void {
  const targetRef = rawTargetRef?.trim();
  if (!targetRef) {
    return;
  }
  const key = `${kind}:${targetRef}`;
  if (seenLinks.has(key)) {
    return;
  }
  seenLinks.add(key);
  links.push({ kind, targetRef });
}
