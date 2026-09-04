import type {
  Query as ClaudeQuery,
  Options as ClaudeQueryOptions,
  SDKMessage,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, it, vi } from "vitest";
import { CLAUDE_USAGE_METHOD } from "./claude-plan-usage";
import { readClaudePlanUsage } from "./claude-plan-usage-probe";

function createFakeQuery(
  usage: unknown,
  messages: SDKMessage[] = [
    {
      type: "system",
      subtype: "init",
      apiKeySource: "oauth",
      cwd: "/tmp",
      mcp_servers: [],
      model: "sonnet",
      permissionMode: "default",
      plugins: [],
      skills: [],
      slash_commands: [],
      tools: [],
      output_style: "default",
      claude_code_version: "test",
      session_id: "session-1",
      uuid: "00000000-0000-0000-0000-000000000001",
    } as SDKMessage,
  ],
) {
  const interrupt = vi.fn(async () => undefined);
  const initializationResult = vi.fn(async () => ({
    account: { subscriptionType: "pro", tokenSource: "oauth" },
  }));
  const getUsage = vi.fn(async () => usage);
  const query = Object.assign(
    (async function* () {
      for (const message of messages) {
        yield message;
      }
    })(),
    {
      interrupt,
      initializationResult,
      [CLAUDE_USAGE_METHOD]: getUsage,
    },
  ) as unknown as ClaudeQuery;

  return { getUsage, initializationResult, interrupt, query };
}

describe("readClaudePlanUsage", () => {
  it("returns null when Claude is not installed", async () => {
    const createQuery = vi.fn();

    await expect(
      readClaudePlanUsage({
        createQuery,
        lookupExecutable: async () => null,
      }),
    ).resolves.toBeNull();
    expect(createQuery).not.toHaveBeenCalled();
  });

  it("reads plan windows after SDK initialization, without sending a prompt", async () => {
    const { query, getUsage, interrupt } = createFakeQuery({
      subscription_type: "pro",
      rate_limits_available: true,
      rate_limits: {
        five_hour: {
          utilization: 41,
          resets_at: "2026-09-04T12:00:00.000Z",
        },
        seven_day: { utilization: 18, resets_at: null },
      },
    });
    const createQuery = vi.fn(
      (_input: {
        prompt: AsyncIterable<SDKUserMessage>;
        options: ClaudeQueryOptions;
      }) => query,
    );

    const record = await readClaudePlanUsage({
      createQuery,
      lookupExecutable: async () => "/usr/local/bin/claude",
    });

    expect(createQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          includePartialMessages: true,
          settingSources: ["user", "project", "local"],
          systemPrompt: { preset: "claude_code", type: "preset" },
          pathToClaudeCodeExecutable: "/usr/local/bin/claude",
        }),
      }),
    );
    expect(
      createQuery.mock.calls[0]?.[0].options.persistSession,
    ).toBeUndefined();
    expect(getUsage).toHaveBeenCalledOnce();
    expect(record).toEqual(
      expect.objectContaining({
        planLabel: "pro",
        windows: [
          expect.objectContaining({ kind: "five-hour", usedPercent: 41 }),
          expect.objectContaining({ kind: "weekly", usedPercent: 18 }),
        ],
      }),
    );
    expect(interrupt).toHaveBeenCalledOnce();
  });

  it("does not wait for a stream init message before reading plan usage", async () => {
    let closeStream: (() => void) | undefined;
    const streamClosed = new Promise<void>((resolve) => {
      closeStream = resolve;
    });
    const getUsage = vi.fn(async () => ({
      rate_limits_available: true,
      rate_limits: { five_hour: { utilization: 9 } },
    }));
    const messageStream = {
      async next(): Promise<IteratorResult<SDKMessage>> {
        await streamClosed;
        return { done: true, value: undefined };
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };
    const query = Object.assign(messageStream, {
      interrupt: vi.fn(async () => closeStream?.()),
      initializationResult: vi.fn(async () => ({
        account: { subscriptionType: "pro", tokenSource: "oauth" },
      })),
      [CLAUDE_USAGE_METHOD]: getUsage,
    }) as unknown as ClaudeQuery;

    const pending = readClaudePlanUsage({
      createQuery: () => query,
      lookupExecutable: async () => "/usr/local/bin/claude",
      timeoutMs: 50,
    });

    await expect(pending).resolves.toEqual(
      expect.objectContaining({
        windows: [
          expect.objectContaining({ kind: "five-hour", usedPercent: 9 }),
        ],
      }),
    );
    expect(getUsage).toHaveBeenCalledOnce();
  });

  it("reports when Claude Code is not signed in", async () => {
    const { query, initializationResult, getUsage } = createFakeQuery({
      rate_limits_available: false,
      rate_limits: null,
    });
    initializationResult.mockResolvedValueOnce({
      account: { subscriptionType: "", tokenSource: "none" },
    });

    await expect(
      readClaudePlanUsage({
        createQuery: () => query,
        lookupExecutable: async () => "/usr/local/bin/claude",
      }),
    ).rejects.toMatchObject({ code: "authentication-required" });
    expect(getUsage).not.toHaveBeenCalled();
  });

  it("returns null when plan limits are unavailable", async () => {
    const { query } = createFakeQuery({
      rate_limits_available: false,
      rate_limits: null,
    });

    await expect(
      readClaudePlanUsage({
        createQuery: () => query,
        lookupExecutable: async () => "/usr/local/bin/claude",
      }),
    ).resolves.toBeNull();
  });
});
