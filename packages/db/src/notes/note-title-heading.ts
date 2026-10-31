const LEADING_TITLE_HEADING =
  /^(?:[ \t]*\r?\n)*[ \t]{0,3}#[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*(?:\r?\n|$)(?:[ \t]*\r?\n)*/u;

function normalizeHeadingText(text: string): string {
  return text.trim().replace(/\s+/gu, " ");
}

export function leadingTitleHeading(bodyMarkdown: string): string | null {
  const match = LEADING_TITLE_HEADING.exec(bodyMarkdown);
  const text = match ? normalizeHeadingText(match[1] ?? "") : "";
  return text || null;
}

export function stripLeadingTitleHeading(
  bodyMarkdown: string,
  title: string,
): string {
  const match = LEADING_TITLE_HEADING.exec(bodyMarkdown);
  if (!match) {
    return bodyMarkdown;
  }
  const heading = normalizeHeadingText(match[1] ?? "");
  if (!heading || heading !== normalizeHeadingText(title)) {
    return bodyMarkdown;
  }
  return bodyMarkdown.slice(match[0].length);
}
