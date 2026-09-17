export type PlainTextSegment =
  | { kind: "text"; text: string }
  | { kind: "link"; url: string };

const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;

const TRAILING_PUNCTUATION = /[.,;:!?…"')\]）】》，。；：！？、]/;

function countChar(value: string, char: string) {
  let count = 0;

  for (const candidate of value) {
    if (candidate === char) {
      count += 1;
    }
  }

  return count;
}

function trimTrailingPunctuation(candidate: string) {
  let end = candidate.length;

  while (end > 0) {
    const char = candidate[end - 1] as string;

    if (char === ")") {
      const opens = countChar(candidate.slice(0, end), "(");
      const closes = countChar(candidate.slice(0, end), ")");

      if (opens >= closes) {
        break;
      }

      end -= 1;
      continue;
    }

    if (!TRAILING_PUNCTUATION.test(char)) {
      break;
    }

    end -= 1;
  }

  return candidate.slice(0, end);
}

export function toLinkHref(url: string) {
  return url.toLowerCase().startsWith("www.") ? `https://${url}` : url;
}

function hasHost(url: string) {
  const rest = url.replace(/^(?:https?:\/\/)?(?:www\.)?/i, "");

  return rest.length > 0 && !rest.startsWith("/");
}

function isTokenBoundary(text: string, index: number) {
  if (index === 0) {
    return true;
  }

  return !/[\w/@.-]/.test(text[index - 1] as string);
}

export function splitTextByLinks(text: string): PlainTextSegment[] {
  const segments: PlainTextSegment[] = [];
  let cursor = 0;

  for (const match of text.matchAll(URL_PATTERN)) {
    const index = match.index ?? 0;

    if (!isTokenBoundary(text, index)) {
      continue;
    }

    const url = trimTrailingPunctuation(match[0]);

    if (!hasHost(url)) {
      continue;
    }

    if (index > cursor) {
      segments.push({ kind: "text", text: text.slice(cursor, index) });
    }

    segments.push({ kind: "link", url });
    cursor = index + url.length;
  }

  if (cursor < text.length) {
    segments.push({ kind: "text", text: text.slice(cursor) });
  }

  return segments.length > 0 ? segments : [{ kind: "text", text }];
}
