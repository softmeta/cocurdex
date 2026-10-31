import type {
  ProviderConfigRecord,
  ProviderModelRecord,
} from "@cocurdex/shared";
import { generatePiText } from "./pi-title";

const MEMORY_DIGEST_MAX_TOKENS = 1_200;

const MEMORY_DIGEST_PROMPT = `You maintain a local, long-term memory for a desktop AI workspace.
Summarize the conversation into exactly one memory entry.

Return strict JSON with these keys:
{"title": string, "importance": "important" | "trivial", "body": string}

body must contain exactly three lines:
【前因】why the conversation happened
【行为】what was discussed or done
【后果】the outcome, open questions, and any reusable conclusion

Rules:
- important only when a future session must reuse the decision, lesson, or procedure; otherwise trivial.
- Keep facts, decisions, file paths, commands, and outcomes; drop pleasantries and repetition.
- Do not invent facts. If the conversation was casual or inconclusive, say so.
- Never include passwords, API tokens, private keys, or personal identifiers.
- Write in the user's language.
- Reply with JSON only, no markdown fences.`;

function parseJsonObject(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function compact(value: unknown, maxChars: number) {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}

function compactBody(value: unknown, maxChars: number) {
  if (typeof value !== "string") return null;
  const text = value
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  if (!text) return null;
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}

export interface PiMemoryDigest {
  title: string;
  importance: "important" | "trivial";
  body: string;
}

export function parsePiMemoryDigest(raw: string | null): PiMemoryDigest | null {
  if (!raw) return null;
  const parsed = parseJsonObject(raw);
  if (!parsed) return null;
  const title = compact(parsed.title, 64);
  const body = compactBody(parsed.body, 1_600);
  const importance =
    parsed.importance === "important" ? "important" : "trivial";
  if (!title || !body) return null;
  if (!body.includes("【前因】") || !body.includes("【后果】")) return null;
  return { title, importance, body };
}

export async function generatePiMemoryDigest(params: {
  provider: ProviderConfigRecord;
  model: ProviderModelRecord;
  apiKey: string | null;
  sessionTitle: string;
  transcript: string;
  sessionId?: string;
  signal?: AbortSignal;
}): Promise<PiMemoryDigest | null> {
  const text = await generatePiText({
    provider: params.provider,
    model: params.model,
    apiKey: params.apiKey,
    systemPrompt: MEMORY_DIGEST_PROMPT,
    message: `Session title: ${params.sessionTitle}\n\n${params.transcript}`,
    maxTokens: MEMORY_DIGEST_MAX_TOKENS,
    sessionId: params.sessionId,
    signal: params.signal,
  });
  return parsePiMemoryDigest(text);
}
