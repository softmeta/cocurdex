import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { createInterface } from "node:readline";
import { lookupExecutable } from "@cocurdex/agent-core";
import type { CompatibleProviderModel } from "@cocurdex/shared";
import { isReasoningEffort } from "@cocurdex/shared";
import {
  T3_CLAUDE_MODEL_CATALOG,
  type T3ClaudeModelCatalogEntry,
} from "./claude-cli-model-catalog";
import { buildClaudeCliEnv } from "./claude-cli-process";

export const CLAUDE_CLI_PROVIDER_ID = "claude-agent";

const PROBE_TIMEOUT_MS = 15_000;
interface ClaudeCliModelInfo {
  value: string;
  displayName: string;
  description: string;
  supportsEffort?: boolean;
  supportedEffortLevels?: string[];
  supportsAdaptiveThinking?: boolean;
  supportsFastMode?: boolean;
}

type LookupExecutable = typeof lookupExecutable;
type ReadClaudeCliModels = (
  executablePath: string,
) => Promise<ClaudeCliModelInfo[] | null>;

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

function getVersionedModelDisplayName(model: ClaudeCliModelInfo): string {
  const qualifierStart = model.displayName.indexOf(" (");
  const hasQualifier = qualifierStart > 0 && model.displayName.endsWith(")");
  const baseName = hasQualifier
    ? model.displayName.slice(0, qualifierStart)
    : model.displayName;
  if (/\d/.test(baseName)) {
    return model.displayName;
  }

  // Claude reports compact picker names such as "Opus" while the first
  // description segment carries the user-facing generation, such as "Opus 5".
  const descriptionHeading = model.description.split(" · ", 1)[0]?.trim();
  const headingPrefix = `${baseName} `;
  if (
    !descriptionHeading
      ?.toLocaleLowerCase()
      .startsWith(headingPrefix.toLocaleLowerCase())
  ) {
    return model.displayName;
  }

  const version = descriptionHeading
    .slice(headingPrefix.length)
    .match(/^\d+(?:\.\d+)?/)?.[0];
  if (!version) {
    return model.displayName;
  }

  const qualifier = hasQualifier ? model.displayName.slice(qualifierStart) : "";
  return `${baseName} ${version}${qualifier}`;
}

function getCatalogEntry(
  model: ClaudeCliModelInfo,
): T3ClaudeModelCatalogEntry | undefined {
  if (model.value === "default") {
    return undefined;
  }

  const normalizedModelId = model.value.replace(/\[1m\]$/, "");
  const exactMatch = T3_CLAUDE_MODEL_CATALOG.find(
    (entry) => entry.modelId === normalizedModelId,
  );
  if (exactMatch) {
    return exactMatch;
  }

  const reportedModel =
    `${model.displayName} ${model.description}`.toLowerCase();
  return T3_CLAUDE_MODEL_CATALOG.find((entry) => {
    const catalogName = entry.name.replace(/^Claude /, "").toLowerCase();
    return reportedModel.includes(catalogName);
  });
}

function toCompatibleModel(
  model: ClaudeCliModelInfo,
  now: string,
): CompatibleProviderModel {
  const catalogEntry = getCatalogEntry(model);
  // Claude Code owns this ladder: forward whatever levels the picker reports
  // instead of pinning the menu to a snapshot of today's vocabulary.
  const supportedReasoningEfforts = (model.supportedEffortLevels ?? []).flatMap(
    (effort) =>
      isReasoningEffort(effort)
        ? [{ reasoningEffort: effort, description: effort }]
        : [],
  );

  return {
    provider: {
      id: CLAUDE_CLI_PROVIDER_ID,
      name: "Claude Agent",
      baseUrl: "",
      enabled: true,
      apiKeySecretId: null,
      headersJson: null,
      createdAt: now,
      updatedAt: now,
    },
    model: {
      providerId: CLAUDE_CLI_PROVIDER_ID,
      modelId: model.value === "default" ? "" : model.value,
      name: getVersionedModelDisplayName(model),
      // This is UI metadata only. Claude Agent owns transport and auth.
      api: "anthropic-messages",
      enabled: true,
      source: "api",
      contextLimit: null,
      outputLimit: null,
      capabilities: ["agent", "chat"],
      reasoning:
        model.supportsEffort === true ||
        model.supportsAdaptiveThinking === true,
      supportedReasoningEfforts,
      ...(model.supportsFastMode !== undefined ||
      catalogEntry?.supportsFastMode !== undefined
        ? {
            supportsFastMode:
              model.supportsFastMode ?? catalogEntry?.supportsFastMode,
          }
        : {}),
      isDefault: model.value === "default",
      createdAt: now,
      updatedAt: now,
    },
  };
}

function toStaticCompatibleModel(
  model: (typeof T3_CLAUDE_MODEL_CATALOG)[number],
  now: string,
): CompatibleProviderModel {
  const supportedReasoningEfforts = model.supportedReasoningEfforts.map(
    (reasoningEffort) => ({
      reasoningEffort,
      description: reasoningEffort,
    }),
  );

  return {
    provider: {
      id: CLAUDE_CLI_PROVIDER_ID,
      name: "Claude Agent",
      baseUrl: "",
      enabled: true,
      apiKeySecretId: null,
      headersJson: null,
      createdAt: now,
      updatedAt: now,
    },
    model: {
      providerId: CLAUDE_CLI_PROVIDER_ID,
      modelId: model.modelId,
      name: model.name,
      api: "anthropic-messages",
      enabled: true,
      source: "manual",
      contextLimit: null,
      outputLimit: null,
      capabilities: ["agent", "chat"],
      reasoning: supportedReasoningEfforts.length > 0,
      supportedReasoningEfforts,
      ...(model.supportsFastMode !== undefined
        ? { supportsFastMode: model.supportsFastMode }
        : {}),
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    },
  };
}

function mergeDynamicAndStaticModels(
  dynamicModels: CompatibleProviderModel[],
  now: string,
  dynamicCatalogModelIds: ReadonlySet<string>,
): CompatibleProviderModel[] {
  const dynamicModelIds = new Set([
    ...dynamicModels.map(({ model }) => model.modelId),
    ...dynamicCatalogModelIds,
  ]);
  const staticModels = T3_CLAUDE_MODEL_CATALOG.filter(
    (model) => !dynamicModelIds.has(model.modelId),
  ).map((model) => toStaticCompatibleModel(model, now));

  return [...dynamicModels, ...staticModels];
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

function stopProbe(child: ChildProcessWithoutNullStreams) {
  if (!child.stdin.destroyed) {
    child.stdin.end();
  }
  if (child.exitCode === null && !child.killed) {
    child.kill("SIGTERM");
  }
}

async function readClaudeCliModels(
  executablePath: string,
): Promise<ClaudeCliModelInfo[] | null> {
  // Claude Agent has no public list-models command. Its account-aware picker is
  // exposed by the initialize control request used over bidirectional
  // stream-json. Keep this probe isolated so CLI protocol drift fails without
  // affecting normal turns.
  const child = spawn(
    executablePath,
    [
      "-p",
      "--input-format",
      "stream-json",
      "--output-format",
      "stream-json",
      "--verbose",
      "--setting-sources=user",
    ],
    {
      cwd: homedir(),
      env: buildClaudeCliEnv(),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    },
  );
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
      stopProbe(child);

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
        if (models) {
          settle(null, models);
        }
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

async function probeClaudeCliModels(
  lookupClaudeExecutable: LookupExecutable,
  readModels: ReadClaudeCliModels,
): Promise<CompatibleProviderModel[] | null> {
  const executablePath = await lookupClaudeExecutable("claude");
  if (!executablePath) {
    return null;
  }

  const now = new Date().toISOString();
  const models = await readModels(executablePath);
  // Claude's account-default alias is not a pickable model. The picker only
  // lists concrete ids (sonnet, opus, …) so new sessions and settings stay
  // on an explicit model.
  const reportedModels = (models ?? []).filter(
    (model) => model.value !== "default",
  );
  const dynamicModels = reportedModels.map((model) =>
    toCompatibleModel(model, now),
  );
  const dynamicCatalogModelIds = new Set(
    reportedModels.flatMap((model) => {
      const catalogEntry = getCatalogEntry(model);
      return catalogEntry ? [catalogEntry.modelId] : [];
    }),
  );
  return mergeDynamicAndStaticModels(
    dynamicModels,
    now,
    dynamicCatalogModelIds,
  );
}

let cachedCatalog: CompatibleProviderModel[] | null = null;
let inFlightProbe: Promise<CompatibleProviderModel[] | null> | null = null;

export async function listClaudeCliProviderModels(
  lookupClaudeExecutable: LookupExecutable = lookupExecutable,
  readModels: ReadClaudeCliModels = readClaudeCliModels,
  options: { forceRefresh?: boolean } = {},
): Promise<CompatibleProviderModel[]> {
  if (cachedCatalog && !options.forceRefresh) {
    return cachedCatalog;
  }

  inFlightProbe ??= probeClaudeCliModels(lookupClaudeExecutable, readModels);

  let probed: CompatibleProviderModel[] | null;
  try {
    probed = await inFlightProbe;
  } finally {
    inFlightProbe = null;
  }
  if (probed) {
    cachedCatalog = probed;
    return probed;
  }

  if (options.forceRefresh && cachedCatalog) {
    throw new Error("Claude Agent model catalog refresh returned no models");
  }

  return [];
}

export function resetClaudeCliProviderModelsCache() {
  cachedCatalog = null;
  inFlightProbe = null;
}
