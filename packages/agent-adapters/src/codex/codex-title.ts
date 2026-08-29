import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildChildProcessEnv } from "../shared";

const TITLE_PROMPT = `Generate a concise title for the user's first message.

Rules:
- Maximum 6 words.
- No punctuation at the end.
- No quotes, no markdown, no emoji.
- Use the same language as the user's message.
- Return JSON with exactly one key: title.`;

const TITLE_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
  },
  required: ["title"],
  additionalProperties: false,
} as const;

export interface CodexTitleCommandRunner {
  run(params: {
    cwd: string;
    message: string;
    model?: string;
    signal?: AbortSignal;
  }): Promise<string>;
}

function normalizeTitle(raw: string): string | null {
  const normalized = raw
    .trim()
    .split(/\r?\n/g)[0]
    ?.trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim()
    .replace(/\s+/g, " ");

  if (!normalized) {
    return null;
  }

  const chars = [...normalized];
  return chars.length > 64 ? `${chars.slice(0, 60).join("")}…` : normalized;
}

function parseTitleOutput(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "title" in parsed &&
      typeof parsed.title === "string"
    ) {
      return normalizeTitle(parsed.title);
    }
  } catch {
    // Older Codex versions may ignore the output schema and return plain text.
  }

  return normalizeTitle(raw);
}

const defaultRunner: CodexTitleCommandRunner = {
  async run(params) {
    if (params.signal?.aborted) {
      throw new Error("Codex title generation was aborted");
    }

    const tempDirectory = await mkdtemp(join(tmpdir(), "cocurdex-title-"));
    const schemaPath = join(tempDirectory, "schema.json");
    const outputPath = join(tempDirectory, "output.json");
    await writeFile(schemaPath, JSON.stringify(TITLE_OUTPUT_SCHEMA), "utf8");

    try {
      const args = [
        "exec",
        "--ephemeral",
        "--skip-git-repo-check",
        "-s",
        "read-only",
        ...(params.model ? ["--model", params.model] : []),
        "--config",
        'model_reasoning_effort="low"',
        "--output-schema",
        schemaPath,
        "--output-last-message",
        outputPath,
        "-",
      ];
      const child = spawn("codex", args, {
        cwd: params.cwd,
        env: buildChildProcessEnv(process.env),
        stdio: ["pipe", "ignore", "pipe"],
      });
      let stderr = "";
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderr = `${stderr}${chunk}`.slice(-16_000);
      });
      child.stdin.on("error", () => undefined);

      const abort = () => child.kill();
      params.signal?.addEventListener("abort", abort, { once: true });
      child.stdin.end(`${TITLE_PROMPT}\n\nUser message:\n${params.message}`);

      try {
        const exitCode = await new Promise<number | null>((resolve, reject) => {
          child.once("error", reject);
          child.once("close", resolve);
        });
        if (params.signal?.aborted) {
          throw new Error("Codex title generation was aborted");
        }
        if (exitCode !== 0) {
          throw new Error(
            stderr.trim() ||
              `Codex title generation exited with code ${exitCode}`,
          );
        }
      } finally {
        params.signal?.removeEventListener("abort", abort);
      }

      return await readFile(outputPath, "utf8");
    } finally {
      await rm(tempDirectory, { force: true, recursive: true });
    }
  },
};

export function createCodexConversationTitleGenerator(
  runner: CodexTitleCommandRunner = defaultRunner,
) {
  return async function generateCodexConversationTitle(params: {
    message: string;
    model?: string;
    cwd?: string;
    signal?: AbortSignal;
  }): Promise<string | null> {
    const raw = await runner.run({
      cwd: params.cwd ?? process.cwd(),
      message: params.message,
      ...(params.model ? { model: params.model } : {}),
      ...(params.signal ? { signal: params.signal } : {}),
    });
    return parseTitleOutput(raw);
  };
}

export const generateCodexConversationTitle =
  createCodexConversationTitleGenerator();
