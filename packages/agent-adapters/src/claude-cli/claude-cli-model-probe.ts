import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { buildClaudeCliEnv } from "./claude-cli-process";

const PROBE_TIMEOUT_MS = 15_000;
const STOP_TIMEOUT_MS = 1_000;

export interface ClaudeCliModelInfo {
  value: string;
  displayName: string;
  description: string;
  supportsEffort?: boolean;
  supportedEffortLevels?: string[];
  supportsAdaptiveThinking?: boolean;
  supportsFastMode?: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function isClaudeCliModelInfo(value: unknown): value is ClaudeCliModelInfo {
  const model = asRecord(value);
  return Boolean(
    model &&
      typeof model.value === "string" &&
      typeof model.displayName === "string" &&
      typeof model.description === "string",
  );
}

function getInitializeModels(line: string, requestId: string) {
  let message: unknown;
  try {
    message = JSON.parse(line);
  } catch {
    return undefined;
  }

  const envelope = asRecord(message);
  const response = asRecord(envelope?.response);
  if (
    envelope?.type !== "control_response" ||
    response?.request_id !== requestId
  ) {
    return undefined;
  }
  if (response.subtype !== "success") {
    throw new Error(
      typeof response.error === "string"
        ? response.error
        : "Claude Agent model initialization failed",
    );
  }
  const result = asRecord(response.response);
  if (!result || !Array.isArray(result.models)) {
    throw new Error("Claude Agent model initialization returned no model list");
  }
  return result.models.filter(isClaudeCliModelInfo);
}

function readModelResponse(
  child: ChildProcessWithoutNullStreams,
): Promise<ClaudeCliModelInfo[] | null> {
  const requestId = randomUUID();
  const lines = createInterface({ input: child.stdout });
  child.stderr.resume();

  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (
      error: Error | null,
      models: ClaudeCliModelInfo[] | null = null,
    ) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      lines.close();
      if (error) {
        reject(error);
        return;
      }
      resolve(models);
    };
    const timer = setTimeout(() => settle(null), PROBE_TIMEOUT_MS);

    lines.on("line", (line) => {
      try {
        const models = getInitializeModels(line, requestId);
        if (models) settle(null, models);
      } catch (error) {
        settle(error instanceof Error ? error : new Error(String(error)));
      }
    });
    child.once("error", (error) => settle(error));
    child.once("exit", (code, signal) => {
      if (settled) return;
      if (code === 0) {
        settle(null);
        return;
      }
      settle(
        new Error(
          `Claude Agent model probe exited before initialization (${signal ?? code ?? "unknown"})`,
        ),
      );
    });
    child.stdin.once("error", (error) => settle(error));
    child.stdin.write(
      `${JSON.stringify({
        type: "control_request",
        request_id: requestId,
        request: { subtype: "initialize" },
      })}\n`,
    );
  });
}

async function stopProbe(
  child: ChildProcessWithoutNullStreams,
  closed: Promise<void>,
) {
  if (!child.stdin.destroyed) child.stdin.end();
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGTERM");
  }
  const timer = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
    }
  }, STOP_TIMEOUT_MS);
  try {
    await closed;
  } finally {
    clearTimeout(timer);
  }
}

async function runModelProbe(executablePath: string, cwd: string) {
  const child = spawn(
    executablePath,
    [
      "-p",
      "--input-format",
      "stream-json",
      "--output-format",
      "stream-json",
      "--verbose",
      "--safe-mode",
      "--setting-sources=user",
      "--strict-mcp-config",
      "--mcp-config",
      JSON.stringify({ mcpServers: {} }),
      "--settings",
      JSON.stringify({ disableAllHooks: true }),
      "--disable-slash-commands",
      "--tools",
      "",
      "--no-session-persistence",
    ],
    {
      cwd,
      env: buildClaudeCliEnv(),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  const closed = new Promise<void>((resolve) => {
    child.once("close", () => resolve());
  });
  try {
    return await readModelResponse(child);
  } finally {
    await stopProbe(child, closed);
  }
}

export async function readClaudeCliModels(
  executablePath: string,
): Promise<ClaudeCliModelInfo[] | null> {
  const cwd = await mkdtemp(path.join(tmpdir(), "cocurdex-claude-models-"));
  try {
    return await runModelProbe(executablePath, cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}
