import {
  AGENT_RUN_LIMIT_BOUNDS,
  AGENT_RUN_LIMITS_SETTING_KEY,
  type AgentToolCallerContext,
  MEMORY_SETTINGS_KEY,
  normalizeMemorySettings,
  parseAgentRunLimits,
  type WorkspaceWorktreeEnvironment,
} from "@cocurdex/shared";
import type { AgentToolRegistry } from "../tool-registry";

export const WORKTREE_ENVIRONMENT_KEY = "workspace.worktreeEnvironment";

export interface SettingsToolDependencies {
  getWorktreeEnvironment(
    workspaceId: string,
  ): Promise<WorkspaceWorktreeEnvironment>;
  proposeWorktreeEnvironment(input: {
    workspaceId: string;
    setupScript: string;
    cleanupScript: string;
    rationale?: string | null;
  }): Promise<WorkspaceWorktreeEnvironment>;
  getSettingValue(
    key: string,
    workspaceId: string,
  ): Promise<{ value: unknown; pending: unknown }>;
  setSettingValue(input: {
    key: string;
    value: unknown;
    workspaceId: string;
  }): Promise<{ status: "applied" | "queued" }>;
}

export type SettingsTier = "read" | "write" | "propose";
export type SettingsStorage = "daemon" | "renderer";

export interface SettingsCatalogEntry {
  key: string;
  scope: "global" | "workspace";
  tier: SettingsTier;
  // Where the value lives. "daemon" entries are read/written by the daemon
  // directly; "renderer" entries are applied by the desktop client via the
  // pending-settings-changes queue.
  storage: SettingsStorage;
  description: string;
  valueSchema: Record<string, unknown>;
  validate?(value: unknown): unknown;
}

function enumSetting(
  key: string,
  allowed: readonly string[],
): (value: unknown) => string {
  return (value: unknown) => {
    if (typeof value !== "string" || !allowed.includes(value)) {
      throw new Error(
        `Value for '${key}' must be one of: ${allowed.join(", ")}`,
      );
    }
    return value;
  };
}

function requireBooleanField(
  key: string,
  record: Record<string, unknown>,
  field: string,
) {
  if (typeof record[field] !== "boolean") {
    throw new Error(`Value for '${key}.${field}' must be a boolean`);
  }
}

function requireObjectValue(key: string, value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Value for '${key}' must be an object`);
  }
  return value as Record<string, unknown>;
}

const THEME_MODES = ["light", "dark", "system"] as const;
const LANGUAGE_MODES = ["system", "en-US", "zh-CN"] as const;
const FOLLOW_UP_BEHAVIORS = ["queue", "steer"] as const;
const ACTIVITY_DISPLAY_MODES = ["expanded", "condensed", "hidden"] as const;

export const SETTINGS_CATALOG: readonly SettingsCatalogEntry[] = [
  {
    key: MEMORY_SETTINGS_KEY,
    scope: "global",
    tier: "write",
    storage: "daemon",
    description:
      "Long-term memory through Respire (rsrs). enabled is the master switch; agent controls automatic recall and memory tools for agent sessions; chat controls recall and automatic capture for chat sessions; cliPath optionally points at the rsrs executable.",
    valueSchema: {
      type: "object",
      properties: {
        enabled: { type: "boolean" },
        agent: {
          type: "object",
          properties: {
            injectContext: { type: "boolean" },
            tools: { type: "boolean" },
          },
          additionalProperties: false,
        },
        chat: {
          type: "object",
          properties: {
            recall: { type: "boolean" },
            saveTurns: { type: "boolean" },
            saveOnEnd: { type: "boolean" },
          },
          additionalProperties: false,
        },
        cliPath: { type: ["string", "null"] },
      },
      additionalProperties: false,
    },
    validate: (value) => normalizeMemorySettings(value),
  },
  {
    key: WORKTREE_ENVIRONMENT_KEY,
    scope: "workspace",
    tier: "propose",
    storage: "daemon",
    description:
      "Shell scripts that run inside every worktree Cocurdex creates for this workspace. setupScript runs in the worktree directory right after creation (dependency installs, codegen, env file links). cleanupScript runs in the worktree directory before Cocurdex recycles it.",
    valueSchema: {
      type: "object",
      properties: {
        setupScript: {
          type: "string",
          description:
            "Shell commands run after worktree creation, in the worktree root via a login shell",
        },
        cleanupScript: {
          type: "string",
          description:
            "Shell commands run before the worktree is recycled, in the worktree root via a login shell. Always propose a concrete cleanup command that is safe to run unattended — build caches, temp directories, or processes the setup script starts. Do not leave it empty.",
        },
      },
      required: ["setupScript", "cleanupScript"],
      additionalProperties: false,
    },
  },
  {
    key: "app.theme",
    scope: "global",
    tier: "write",
    storage: "renderer",
    description: "Application color theme.",
    valueSchema: { type: "string", enum: [...THEME_MODES] },
    validate: enumSetting("app.theme", THEME_MODES),
  },
  {
    key: "app.appearance",
    scope: "global",
    tier: "write",
    storage: "renderer",
    description:
      "Appearance settings: themePreset (named color preset id such as 'default'), uiFontFamily and codeFontFamily (empty string = system default), uiFontSize (12-16), codeFontSize (11-18).",
    valueSchema: {
      type: "object",
      properties: {
        themePreset: { type: "string" },
        uiFontFamily: { type: "string" },
        codeFontFamily: { type: "string" },
        uiFontSize: { type: "number" },
        codeFontSize: { type: "number" },
      },
      required: [
        "themePreset",
        "uiFontFamily",
        "codeFontFamily",
        "uiFontSize",
        "codeFontSize",
      ],
      additionalProperties: false,
    },
    validate: (value) => {
      const record = requireObjectValue("app.appearance", value);
      for (const field of ["themePreset", "uiFontFamily", "codeFontFamily"]) {
        if (typeof record[field] !== "string") {
          throw new Error(
            `Value for 'app.appearance.${field}' must be a string`,
          );
        }
      }
      for (const field of ["uiFontSize", "codeFontSize"]) {
        if (typeof record[field] !== "number") {
          throw new Error(
            `Value for 'app.appearance.${field}' must be a number`,
          );
        }
      }
      return record;
    },
  },
  {
    key: "app.language",
    scope: "global",
    tier: "write",
    storage: "renderer",
    description:
      "Interface language. 'system' follows the OS; 'en-US' and 'zh-CN' pin a locale.",
    valueSchema: { type: "string", enum: [...LANGUAGE_MODES] },
    validate: enumSetting("app.language", LANGUAGE_MODES),
  },
  {
    key: "app.notifications",
    scope: "global",
    tier: "write",
    storage: "renderer",
    description:
      "Notification preferences: OS notifications when a session needs attention, and the completion sound.",
    valueSchema: {
      type: "object",
      properties: {
        systemNotifications: { type: "boolean" },
        completionSound: { type: "boolean" },
      },
      required: ["systemNotifications", "completionSound"],
      additionalProperties: false,
    },
    validate: (value) => {
      const record = requireObjectValue("app.notifications", value);
      requireBooleanField("app.notifications", record, "systemNotifications");
      requireBooleanField("app.notifications", record, "completionSound");
      return {
        systemNotifications: record.systemNotifications,
        completionSound: record.completionSound,
      };
    },
  },
  {
    key: "agent.followUpBehavior",
    scope: "global",
    tier: "write",
    storage: "renderer",
    description:
      "What sending a message while an agent run is in progress does: 'queue' delivers it after the run finishes, 'steer' injects it into the active run.",
    valueSchema: { type: "string", enum: [...FOLLOW_UP_BEHAVIORS] },
    validate: enumSetting("agent.followUpBehavior", FOLLOW_UP_BEHAVIORS),
  },
  {
    key: "chat.display",
    scope: "global",
    tier: "write",
    storage: "renderer",
    description:
      "Transcript view: how reasoning, tool calls, and interim replies render in chat. 'hidden' (Concise) shows final replies only, 'condensed' (Standard) folds each finished turn's process into one collapsible block, 'expanded' (Verbose) shows everything inline.",
    valueSchema: {
      type: "object",
      properties: {
        activityDisplay: {
          type: "string",
          enum: [...ACTIVITY_DISPLAY_MODES],
        },
      },
      required: ["activityDisplay"],
      additionalProperties: false,
    },
    validate: (value) => {
      const record = requireObjectValue("chat.display", value);
      enumSetting(
        "chat.display.activityDisplay",
        ACTIVITY_DISPLAY_MODES,
      )(record.activityDisplay);
      return { activityDisplay: record.activityDisplay };
    },
  },
  {
    key: AGENT_RUN_LIMITS_SETTING_KEY,
    scope: "global",
    tier: "write",
    storage: "daemon",
    description:
      "Limits for runs that agents start on behalf of a session (teammates and script agents). Delegated runs wait in order once the host-wide or per-agent concurrency limit is reached; runs the user starts are never held but count toward the limits. A delegated run that exceeds delegatedRunTimeoutMinutes fails with a timeout; null disables the timeout.",
    valueSchema: {
      type: "object",
      properties: {
        maxConcurrentRuns: {
          type: "integer",
          minimum: AGENT_RUN_LIMIT_BOUNDS.maxConcurrentRuns.min,
          maximum: AGENT_RUN_LIMIT_BOUNDS.maxConcurrentRuns.max,
        },
        maxConcurrentRunsPerAgent: {
          type: "integer",
          minimum: AGENT_RUN_LIMIT_BOUNDS.maxConcurrentRunsPerAgent.min,
          maximum: AGENT_RUN_LIMIT_BOUNDS.maxConcurrentRunsPerAgent.max,
        },
        delegatedRunTimeoutMinutes: {
          type: ["integer", "null"],
          minimum: AGENT_RUN_LIMIT_BOUNDS.delegatedRunTimeoutMinutes.min,
          maximum: AGENT_RUN_LIMIT_BOUNDS.delegatedRunTimeoutMinutes.max,
        },
      },
      required: [
        "maxConcurrentRuns",
        "maxConcurrentRunsPerAgent",
        "delegatedRunTimeoutMinutes",
      ],
    },
    validate(value) {
      const limits = parseAgentRunLimits(value);
      if (!limits) {
        throw new Error(
          `Value for '${AGENT_RUN_LIMITS_SETTING_KEY}' must be integers within the documented bounds; delegatedRunTimeoutMinutes may be null`,
        );
      }
      return limits;
    },
  },
  {
    key: "git.commitMessageModel",
    scope: "global",
    tier: "write",
    storage: "daemon",
    description:
      "Dedicated agent + model used to generate git commit messages. Object with agentId, providerId, modelId and optional runtime fields (reasoningEffort, thinkingLevel, serviceTier, fastMode, openCodeAgent, openCodeVariant); null clears the selection.",
    valueSchema: {
      type: ["object", "null"],
      properties: {
        agentId: { type: "string" },
        providerId: { type: "string" },
        modelId: { type: "string" },
      },
      required: ["agentId", "providerId", "modelId"],
    },
  },
];

const isMainSession = (caller: AgentToolCallerContext) =>
  caller.sessionKind === "main";

export function requireCatalogEntry(key: string): SettingsCatalogEntry {
  const entry = SETTINGS_CATALOG.find((item) => item.key === key);
  if (!entry) {
    throw new Error(
      `Unknown settings key '${key}'. Call settings_list for valid keys.`,
    );
  }
  return entry;
}

function requireScript(value: unknown, name: string) {
  if (typeof value !== "string" || value.length > 100_000) {
    throw new Error(`settings_propose value.${name} must be a string`);
  }
  return value;
}

export function registerSettingsTools(
  registry: AgentToolRegistry,
  deps: SettingsToolDependencies,
) {
  registry.register({
    descriptor: {
      group: "settings",
      name: "list",
      description:
        "List the Cocurdex settings that can be inspected or changed from chat, with their scope, tier, storage, and value schema.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    isAvailable: isMainSession,
    execute: async () => ({
      settings: SETTINGS_CATALOG.map((entry) => ({
        key: entry.key,
        scope: entry.scope,
        tier: entry.tier,
        storage: entry.storage,
        description: entry.description,
        valueSchema: entry.valueSchema,
      })),
    }),
  });

  registry.register({
    descriptor: {
      group: "settings",
      name: "get",
      description:
        "Read the current value of a Cocurdex setting for this session's workspace, plus any pending proposal awaiting user confirmation.",
      inputSchema: {
        type: "object",
        properties: {
          key: {
            type: "string",
            description: "Settings key from settings_list",
          },
        },
        required: ["key"],
        additionalProperties: false,
      },
    },
    isAvailable: isMainSession,
    execute: async (caller, input) => {
      const entry = requireCatalogEntry(String(input.key));
      const result = await deps.getSettingValue(entry.key, caller.workspaceId);
      return {
        key: entry.key,
        scope: entry.scope,
        tier: entry.tier,
        value: result.value,
        pending: result.pending,
      };
    },
  });

  registry.register({
    descriptor: {
      group: "settings",
      name: "set",
      description:
        "Change a write-tier Cocurdex setting immediately. Daemon-owned values apply now; app-UI values are queued and applied by the desktop client. Only keys with tier 'write' accept this tool — use settings_propose for propose-tier keys.",
      inputSchema: {
        type: "object",
        properties: {
          key: {
            type: "string",
            description: "Settings key from settings_list",
          },
          value: {
            description:
              "New value matching the entry's valueSchema from settings_list",
          },
        },
        required: ["key", "value"],
        additionalProperties: false,
      },
    },
    isAvailable: isMainSession,
    execute: async (caller, input) => {
      const entry = requireCatalogEntry(String(input.key));
      const result = await deps.setSettingValue({
        key: entry.key,
        value: input.value,
        workspaceId: caller.workspaceId,
      });
      return result.status === "applied"
        ? { status: "applied" }
        : {
            status: "queued",
            note: "Change queued; the desktop app applies it shortly.",
          };
    },
  });

  registry.register({
    descriptor: {
      group: "settings",
      name: "propose",
      description:
        "Propose a new value for a propose-tier Cocurdex setting. The proposal is recorded as pending and only takes effect after the user confirms it in the app; it never applies silently. Do not poll for the outcome — tell the user to review it in Settings.",
      inputSchema: {
        type: "object",
        properties: {
          key: {
            type: "string",
            description: "Settings key from settings_list",
          },
          value: {
            type: "object",
            description:
              "New value matching the entry's valueSchema from settings_list",
          },
          rationale: {
            type: "string",
            description:
              "Short user-facing explanation of why this value fits the workspace",
          },
        },
        required: ["key", "value"],
        additionalProperties: false,
      },
    },
    isAvailable: isMainSession,
    execute: async (caller, input) => {
      const entry = requireCatalogEntry(String(input.key));
      if (entry.tier !== "propose") {
        throw new Error(
          `Settings key '${entry.key}' does not accept proposals (tier=${entry.tier})`,
        );
      }
      const value = input.value;
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("settings_propose value must be an object");
      }
      if (entry.key === WORKTREE_ENVIRONMENT_KEY) {
        const record = value as Record<string, unknown>;
        const setupScript = requireScript(record.setupScript, "setupScript");
        const cleanupScript = requireScript(
          record.cleanupScript,
          "cleanupScript",
        );
        if (!cleanupScript.trim()) {
          throw new Error(
            "settings_propose value.cleanupScript must not be empty. Propose a concrete cleanup command that only touches the worktree (build caches, temp directories, or processes the setup script starts); never touch shared caches outside it.",
          );
        }
        await deps.proposeWorktreeEnvironment({
          workspaceId: caller.workspaceId,
          setupScript,
          cleanupScript,
          rationale:
            typeof input.rationale === "string" ? input.rationale : null,
        });
        return {
          status: "pending",
          note: "Proposal recorded. It stays pending until the user confirms it in Settings; do not treat it as applied.",
        };
      }
      throw new Error(`Settings key '${entry.key}' is not supported`);
    },
  });
}
