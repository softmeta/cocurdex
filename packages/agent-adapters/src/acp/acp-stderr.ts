import { homedir } from "node:os";

const STDERR_TAIL_MAX_CHARS = 4_096;
const EXCERPT_MAX_LINES = 12;
const EXCERPT_MAX_CHARS = 1_500;

const SECRET_PATTERNS: [RegExp, string][] = [
  [/\bBearer\s+[A-Za-z0-9._\-+=/]+/gi, "Bearer [redacted]"],
  [/\bAuthorization:\s*Basic\s+\S+/gi, "Authorization: Basic [redacted]"],
  [/\b(x-api-key|api[_-]?key)(\s*[:=]\s*)\S+/gi, "$1$2[redacted]"],
  [
    /\b(?:sk-[A-Za-z0-9][A-Za-z0-9_-]{7,}|gh[pousr]_[A-Za-z0-9]{8,}|xox[a-zA-Z]-[A-Za-z0-9-]+|AIza[A-Za-z0-9_-]{20,})\b/g,
    "[redacted]",
  ],
  [/([?&](?:token|code|key|access_token)=)[^\s&]+/gi, "$1[redacted]"],
];

export function appendStderrTail(current: string, chunk: string) {
  const next = current + chunk;
  return next.length <= STDERR_TAIL_MAX_CHARS
    ? next
    : next.slice(-STDERR_TAIL_MAX_CHARS);
}

export function sanitizeStderrExcerpt(
  text: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  let result = text.replaceAll("\0", "");
  const homes = [env.HOME, env.USERPROFILE, homedir()].filter(
    (value): value is string => typeof value === "string" && value.length > 1,
  );
  for (const home of new Set(homes)) {
    result = result.split(home).join("~");
  }
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  const lines = result
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
  const excerpt = lines.slice(-EXCERPT_MAX_LINES).join("\n");
  return excerpt.length <= EXCERPT_MAX_CHARS
    ? excerpt
    : excerpt.slice(-EXCERPT_MAX_CHARS);
}
