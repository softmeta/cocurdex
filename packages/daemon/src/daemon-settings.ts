import type {
  AgentRunLimits,
  CocurdexDaemonEvent,
  CommitMessageModelSelection,
  MemorySettings,
  NetworkProxySettings,
  WorkspaceWorktreeEnvironment,
} from "@cocurdex/shared";
import {
  AGENT_RUN_LIMITS_SETTING_KEY,
  getNetworkProxySettings,
  MEMORY_SETTINGS_KEY,
  parseAgentRunLimits,
  resolveStoredAgentRunLimits,
} from "@cocurdex/shared";
import { requireCatalogEntry, WORKTREE_ENVIRONMENT_KEY } from "./agent-tools";
import type { DaemonCommitMessageService } from "./commit-message";
import type { MemoryService } from "./memory";
import { probeNetworkProxy } from "./network-proxy-probe";
import {
  assertTestableNetworkProxySettings,
  readNetworkProxySettings,
  saveNetworkProxySettings,
} from "./network-proxy-settings";
import type { DaemonState } from "./state";

const REPORTED_SETTING_VALUES_KEY = "settings.reportedValues";
const COMMIT_MESSAGE_MODEL_KEY = "git.commitMessageModel";

export interface DaemonSettingsDeps {
  state: DaemonState;
  memory: MemoryService;
  commitMessages: DaemonCommitMessageService;
  getWorktreeEnvironment(
    workspaceId: string,
  ): Promise<WorkspaceWorktreeEnvironment>;
  emit: (event: CocurdexDaemonEvent) => void;
}

export class DaemonSettingsService {
  private readonly deps: DaemonSettingsDeps;

  constructor(deps: DaemonSettingsDeps) {
    this.deps = deps;
  }

  announceChanged() {
    this.deps.emit({ type: "data.changed", areas: ["settings"] });
  }

  async getValue(key: string, workspaceId: string) {
    const entry = requireCatalogEntry(key);
    if (entry.key === WORKTREE_ENVIRONMENT_KEY) {
      const environment = await this.deps.getWorktreeEnvironment(workspaceId);
      return {
        value: {
          setupScript: environment.setupScript,
          cleanupScript: environment.cleanupScript,
        },
        pending: environment.proposal,
      };
    }
    if (entry.storage === "daemon") {
      return { value: await this.readDaemonSetting(entry.key), pending: null };
    }
    const mirror = await this.readReportedValues();
    return { value: mirror[entry.key] ?? null, pending: null };
  }

  async setValue(input: {
    key: string;
    value: unknown;
    workspaceId: string;
  }): Promise<{ status: "applied" | "queued" }> {
    const entry = requireCatalogEntry(input.key);
    if (entry.tier !== "write") {
      throw new Error(
        `Settings key '${entry.key}' cannot be set directly (tier=${entry.tier}); use settings_propose`,
      );
    }
    const value = entry.validate ? entry.validate(input.value) : input.value;
    if (entry.storage === "daemon") {
      await this.writeDaemonSetting(entry.key, value);
      this.announceChanged();
      return { status: "applied" };
    }
    await this.deps.state.addPendingSettingsChange({
      id: crypto.randomUUID(),
      key: entry.key,
      value,
      createdAt: new Date().toISOString(),
    });
    this.announceChanged();
    return { status: "queued" };
  }

  async reportValues(values: Record<string, unknown>) {
    const mirror = await this.readReportedValues();
    await this.deps.state.setAppSetting(
      REPORTED_SETTING_VALUES_KEY,
      JSON.stringify({ ...mirror, ...values }),
    );
  }

  listPendingChanges() {
    return this.deps.state.listPendingSettingsChanges();
  }

  async acknowledgeChange(id: string) {
    await this.deps.state.deletePendingSettingsChange(id);
  }

  async readAgentRunLimits() {
    return resolveStoredAgentRunLimits(
      await this.deps.state.getAppSetting(AGENT_RUN_LIMITS_SETTING_KEY),
    );
  }

  async setAgentRunLimits(value: AgentRunLimits) {
    const limits = parseAgentRunLimits(value);
    if (!limits) throw new Error("Agent run limits are out of range");
    await this.deps.state.setAppSetting(
      AGENT_RUN_LIMITS_SETTING_KEY,
      JSON.stringify(limits),
    );
    this.announceChanged();
    return limits;
  }

  getNetworkProxy() {
    return readNetworkProxySettings(this.deps.state);
  }

  async setNetworkProxy(settings: NetworkProxySettings) {
    const saved = await saveNetworkProxySettings(this.deps.state, settings);
    this.announceChanged();
    return saved;
  }

  async testNetworkProxy(settings?: NetworkProxySettings) {
    if (settings) {
      assertTestableNetworkProxySettings(settings);
      await saveNetworkProxySettings(this.deps.state, settings);
      this.announceChanged();
    }
    return probeNetworkProxy(getNetworkProxySettings());
  }

  private async readDaemonSetting(key: string): Promise<unknown> {
    if (key === AGENT_RUN_LIMITS_SETTING_KEY) return this.readAgentRunLimits();
    if (key === MEMORY_SETTINGS_KEY) return this.deps.memory.getSettings();
    if (key === COMMIT_MESSAGE_MODEL_KEY) {
      return this.deps.commitMessages.getModelSetting();
    }
    throw new Error(`Settings key '${key}' is not readable yet`);
  }

  private async writeDaemonSetting(key: string, value: unknown): Promise<void> {
    if (key === AGENT_RUN_LIMITS_SETTING_KEY) {
      await this.setAgentRunLimits(value as AgentRunLimits);
      return;
    }
    if (key === MEMORY_SETTINGS_KEY) {
      await this.deps.memory.setSettings(value as MemorySettings);
      return;
    }
    if (key === COMMIT_MESSAGE_MODEL_KEY) {
      await this.deps.commitMessages.setModelSetting(
        value as CommitMessageModelSelection | null,
      );
      return;
    }
    throw new Error(`Settings key '${key}' is not writable yet`);
  }

  private async readReportedValues(): Promise<Record<string, unknown>> {
    try {
      const raw = await this.deps.state.getAppSetting(
        REPORTED_SETTING_VALUES_KEY,
      );
      const parsed = raw ? (JSON.parse(raw) as unknown) : null;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
}
