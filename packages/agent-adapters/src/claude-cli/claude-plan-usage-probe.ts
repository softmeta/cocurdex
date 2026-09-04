import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  type AccountInfo,
  type Query as ClaudeQuery,
  type Options as ClaudeQueryOptions,
  query as claudeQuery,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { lookupExecutable } from "@cocurdex/agent-core";
import type { AgentRateLimitsRecord } from "@cocurdex/shared";
import { AdapterRateLimitsProbeError } from "../adapter-rate-limits-error";
import { logAdapterDiagnostic } from "../diagnostics";
import { buildClaudeCliEnv } from "./claude-cli-process";
import { resolveClaudeSdkExecutablePath } from "./claude-executable";
import {
  CLAUDE_USAGE_METHOD,
  type ClaudePlanUsageResponse,
  mapClaudePlanUsage,
} from "./claude-plan-usage";
import { ClaudeQueryPromptQueue } from "./claude-query-queue";

const PROBE_TIMEOUT_MS = 20_000;

type CreateClaudeQuery = (input: {
  prompt: AsyncIterable<SDKUserMessage>;
  options: ClaudeQueryOptions;
}) => ClaudeQuery;

export interface ReadClaudePlanUsageDependencies {
  createQuery?: CreateClaudeQuery;
  lookupExecutable?: typeof lookupExecutable;
  now?: () => string;
  timeoutMs?: number;
}

async function closeClaudeQuery(
  query: ClaudeQuery,
  abortController: AbortController,
  promptQueue: ClaudeQueryPromptQueue,
) {
  promptQueue.close();
  abortController.abort();
  try {
    await query.interrupt();
  } catch {}
}

async function readPlanUsage(query: ClaudeQuery) {
  const getPlanUsage = (query as unknown as Record<string, unknown>)[
    CLAUDE_USAGE_METHOD
  ];
  if (typeof getPlanUsage !== "function") {
    throw new AdapterRateLimitsProbeError(
      "probe-failed",
      "Installed Claude Agent SDK does not support plan usage.",
    );
  }
  return (getPlanUsage as () => Promise<ClaudePlanUsageResponse>).call(query);
}

function hasClaudeAuthentication(account: AccountInfo | undefined) {
  if (!account) {
    return false;
  }
  if (account.apiProvider && account.apiProvider !== "firstParty") {
    return true;
  }
  const hasTokenSource =
    account.tokenSource !== undefined && account.tokenSource !== "none";
  const hasApiKeySource =
    account.apiKeySource !== undefined && account.apiKeySource !== "none";
  return Boolean(
    account.email ||
      account.organization ||
      account.subscriptionType ||
      hasTokenSource ||
      hasApiKeySource,
  );
}

export async function readClaudePlanUsage(
  dependencies: ReadClaudePlanUsageDependencies = {},
): Promise<AgentRateLimitsRecord | null> {
  const lookupClaudeExecutable =
    dependencies.lookupExecutable ?? lookupExecutable;
  const createQuery =
    dependencies.createQuery ?? ((input) => claudeQuery(input));
  const now = dependencies.now ?? (() => new Date().toISOString());
  const timeoutMs = dependencies.timeoutMs ?? PROBE_TIMEOUT_MS;

  const discoveredPath = await lookupClaudeExecutable("claude");
  if (!discoveredPath) {
    return null;
  }

  const abortController = new AbortController();
  const promptQueue = new ClaudeQueryPromptQueue();
  const probeCwd = await mkdtemp(path.join(tmpdir(), "cocurdex-claude-usage-"));
  let query: ClaudeQuery | null = null;
  let drain: Promise<void> | null = null;
  let timer: NodeJS.Timeout | undefined;

  try {
    query = createQuery({
      prompt: promptQueue,
      options: {
        abortController,
        canUseTool: async () => ({
          behavior: "deny",
          message: "Plan usage probe",
        }),
        cwd: probeCwd,
        env: buildClaudeCliEnv(),
        includePartialMessages: true,
        mcpServers: {},
        pathToClaudeCodeExecutable:
          resolveClaudeSdkExecutablePath(discoveredPath),
        permissionMode: "default",
        settingSources: ["user", "project", "local"],
        strictMcpConfig: true,
        systemPrompt: { preset: "claude_code", type: "preset" },
      },
    });
    const activeQuery = query;

    drain = (async () => {
      try {
        for await (const _message of activeQuery) {
        }
      } catch {
        return;
      }
    })();

    const usage = await Promise.race([
      (async () => {
        const initialization = await activeQuery.initializationResult();
        if (!hasClaudeAuthentication(initialization.account)) {
          throw new AdapterRateLimitsProbeError(
            "authentication-required",
            "Claude Code is not signed in.",
          );
        }
        const planUsage = await readPlanUsage(activeQuery);
        if (!planUsage.rate_limits_available) {
          logAdapterDiagnostic("debug", "[ClaudePlanUsage] no plan limits", {
            subscriptionType: planUsage.subscription_type ?? null,
          });
        }
        return planUsage;
      })(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          abortController.abort();
          reject(
            new AdapterRateLimitsProbeError(
              "timed-out",
              "Claude plan usage request timed out.",
            ),
          );
        }, timeoutMs);
      }),
    ]);

    return mapClaudePlanUsage(usage, now());
  } catch (error) {
    logAdapterDiagnostic("debug", "[ClaudePlanUsage] unavailable", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    clearTimeout(timer);
    if (query) {
      await closeClaudeQuery(query, abortController, promptQueue);
    } else {
      promptQueue.close();
      abortController.abort();
    }
    if (drain) {
      await drain;
    }
    await rm(probeCwd, { force: true, recursive: true }).catch(() => {});
  }
}
