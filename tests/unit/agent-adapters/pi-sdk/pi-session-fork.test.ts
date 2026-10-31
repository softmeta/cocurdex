import path from "node:path";
import { forkPiProviderSession } from "@cocurdex/agent-adapters/internal/pi-sdk/pi-session-fork";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { afterAll, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();
afterAll(() => tempDirs.cleanup());

function assistant(text: string) {
  return {
    role: "assistant" as const,
    content: [{ type: "text" as const, text }],
    api: "openai-completions" as const,
    provider: "stub",
    model: "stub",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop" as const,
    timestamp: Date.now(),
  };
}

async function sourceSession() {
  const userDataPath = await tempDirs.create("cocurdex-pi-fork-");
  const workspaceRootPath = path.join(userDataPath, "workspace");
  const sessionDir = path.join(userDataPath, "pi-agent", "sessions");
  const manager = SessionManager.create(workspaceRootPath, sessionDir);
  for (const turn of ["first", "second"]) {
    manager.appendMessage({ role: "user", content: turn, timestamp: 0 });
    manager.appendMessage(assistant(`${turn} answer`));
  }
  const sessionFile = manager.getSessionFile() ?? "";
  return {
    userDataPath,
    workspaceRootPath,
    sessionFile,
    source: {
      sessionId: "source",
      providerSessionId: manager.getSessionId(),
      providerStateJson: JSON.stringify({ adapter: "pi", sessionFile }),
      providerVersion: "pi-sdk",
      resumable: true,
      updatedAt: new Date().toISOString(),
    },
  };
}

function messageText(content: unknown) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part: { type?: string; text?: string }) =>
      part.type === "text" ? (part.text ?? "") : "",
    )
    .join("");
}

function transcript(sessionFile: string) {
  return SessionManager.open(sessionFile)
    .getBranch()
    .flatMap((entry) => (entry.type === "message" ? [entry.message] : []))
    .map((message) => messageText("content" in message ? message.content : ""));
}

function forkedFile(providerStateJson: string) {
  return (JSON.parse(providerStateJson) as { sessionFile: string }).sessionFile;
}

describe("forkPiProviderSession", () => {
  it("copies the whole transcript into a new session file", async () => {
    const { source, sessionFile, ...paths } = await sourceSession();
    const fork = forkPiProviderSession(
      { source, targetSessionId: "fork", userTurnCount: null, ...paths },
      SessionManager,
      "pi-sdk",
    );
    expect(fork?.sessionId).toBe("fork");
    expect(fork?.providerSessionId).not.toBe(source.providerSessionId);
    const file = forkedFile(fork?.providerStateJson ?? "{}");
    expect(file).not.toBe(sessionFile);
    expect(transcript(file)).toEqual([
      "first",
      "first answer",
      "second",
      "second answer",
    ]);
    expect(transcript(sessionFile)).toHaveLength(4);
  });

  it("keeps only the requested turns", async () => {
    const { source, ...paths } = await sourceSession();
    const fork = forkPiProviderSession(
      { source, targetSessionId: "fork", userTurnCount: 1, ...paths },
      SessionManager,
      "pi-sdk",
    );
    expect(transcript(forkedFile(fork?.providerStateJson ?? "{}"))).toEqual([
      "first",
      "first answer",
    ]);
  });

  it("declines a fork point before the first turn", async () => {
    const { source, ...paths } = await sourceSession();
    expect(
      forkPiProviderSession(
        { source, targetSessionId: "fork", userTurnCount: 0, ...paths },
        SessionManager,
        "pi-sdk",
      ),
    ).toBeNull();
  });
});
