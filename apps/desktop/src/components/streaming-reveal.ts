const MIN_CHARS_PER_SECOND = 90;
const COMFORTABLE_CHARS_PER_SECOND = 250;
const CATCH_UP_MS = 600;
const MAX_LAG_MS = 3_000;

function isHighSurrogate(code: number) {
  return code >= 0xd800 && code <= 0xdbff;
}

function getCharsPerSecond(backlog: number) {
  const comfortable = Math.min(
    COMFORTABLE_CHARS_PER_SECOND,
    (backlog * 1000) / CATCH_UP_MS,
  );
  const bounded = (backlog * 1000) / MAX_LAG_MS;
  return Math.max(MIN_CHARS_PER_SECOND, comfortable, bounded);
}

export function getNextRevealLength(
  content: string,
  revealed: number,
  elapsedMs: number,
) {
  const backlog = content.length - revealed;
  if (backlog <= 0) {
    return content.length;
  }
  const step = Math.max(
    1,
    Math.round((getCharsPerSecond(backlog) * elapsedMs) / 1000),
  );
  let next = Math.min(content.length, revealed + step);
  if (next < content.length && isHighSurrogate(content.charCodeAt(next - 1))) {
    next += 1;
  }
  return next;
}
