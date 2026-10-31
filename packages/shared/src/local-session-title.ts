const MAX_SESSION_TITLE_LENGTH = 48;
const MAX_UNSEGMENTED_SESSION_TITLE_LENGTH = 24;
const MAX_SESSION_TITLE_WORDS = 8;
const CJK_TEXT_PATTERN =
  /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]/;
const CLAUSE_SEPARATOR_PATTERN = /[,.，。!?！？;；:：]/;

function trimTitlePunctuation(value: string) {
  return value
    .trim()
    .replace(/^["'`]+|["'`.!?:;,\-，。！？；：、]+$/g, "")
    .trim();
}

function removeContextNoise(value: string) {
  return value
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return (
        trimmed.length > 0 &&
        !trimmed.startsWith("<attached") &&
        !trimmed.startsWith("<context") &&
        !trimmed.startsWith("```")
      );
    })
    .join(" ");
}

function capWords(value: string) {
  const words = value.split(/\s+/).filter(Boolean);

  if (words.length <= MAX_SESSION_TITLE_WORDS) {
    return value;
  }

  return words.slice(0, MAX_SESSION_TITLE_WORDS).join(" ");
}

function capUnsegmentedTitle(value: string) {
  if (!CJK_TEXT_PATTERN.test(value)) {
    return value;
  }

  const firstClause = value
    .split(CLAUSE_SEPARATOR_PATTERN)
    .map((part) => part.trim())
    .find((part) => part.length >= 6);

  const candidate = firstClause ?? value;

  return candidate.length > MAX_UNSEGMENTED_SESSION_TITLE_LENGTH
    ? candidate.slice(0, MAX_UNSEGMENTED_SESSION_TITLE_LENGTH)
    : candidate;
}

export function generateLocalSessionTitle(
  message: string,
  fallbackTitle: string,
) {
  const compact = trimTitlePunctuation(
    removeContextNoise(message).replace(/\s+/g, " "),
  );

  if (!compact) {
    return fallbackTitle;
  }

  const capped = capUnsegmentedTitle(capWords(compact));
  return trimTitlePunctuation(
    capped.length > MAX_SESSION_TITLE_LENGTH
      ? capped.slice(0, MAX_SESSION_TITLE_LENGTH)
      : capped,
  );
}
