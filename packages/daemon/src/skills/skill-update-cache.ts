import type { SkillRef, SkillUpdateInfo } from "@cocurdex/shared";
import { type SettingsStore, skillKey } from "./skill-context";

export const SKILL_UPDATES_SETTING_KEY = "skills.updates";

export interface SkillUpdateRecord {
  latestCommit: string;
  latestHash: string;
  installedHash: string | null;
}

export interface SkillUpdateCacheState {
  checkedAt: string | null;
  latest: Record<string, SkillUpdateRecord>;
  skipped: Record<string, string>;
}

function emptyState(): SkillUpdateCacheState {
  return { checkedAt: null, latest: {}, skipped: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseSkillUpdateCache(
  raw: string | null,
): SkillUpdateCacheState {
  if (!raw) {
    return emptyState();
  }
  try {
    const value = JSON.parse(raw);
    if (!isRecord(value)) {
      return emptyState();
    }
    return {
      checkedAt: typeof value.checkedAt === "string" ? value.checkedAt : null,
      latest: isRecord(value.latest)
        ? (value.latest as Record<string, SkillUpdateRecord>)
        : {},
      skipped: isRecord(value.skipped)
        ? (value.skipped as Record<string, string>)
        : {},
    };
  } catch {
    return emptyState();
  }
}

export class SkillUpdateCache {
  constructor(private readonly settings: SettingsStore) {}

  async read() {
    return parseSkillUpdateCache(
      await this.settings.get(SKILL_UPDATES_SETTING_KEY),
    );
  }

  private async write(state: SkillUpdateCacheState) {
    await this.settings.set(SKILL_UPDATES_SETTING_KEY, JSON.stringify(state));
  }

  infoFor(
    state: SkillUpdateCacheState,
    ref: SkillRef,
    installedHash: string | null,
  ): SkillUpdateInfo | null {
    const record = state.latest[skillKey(ref)];
    if (
      !record ||
      !state.checkedAt ||
      record.installedHash !== installedHash ||
      record.latestHash === installedHash
    ) {
      return null;
    }
    return {
      latestCommit: record.latestCommit,
      checkedAt: state.checkedAt,
      skipped: state.skipped[skillKey(ref)] === record.latestCommit,
    };
  }

  async record(
    checkedAt: string,
    entries: Array<{ ref: SkillRef; record: SkillUpdateRecord }>,
    checkedKeys: string[],
  ) {
    const state = await this.read();
    const latest = Object.fromEntries(
      Object.entries(state.latest).filter(
        ([key]) => !checkedKeys.includes(key),
      ),
    );
    for (const entry of entries) {
      latest[skillKey(entry.ref)] = entry.record;
    }
    await this.write({ ...state, checkedAt, latest });
  }

  async skip(ref: SkillRef, commit: string) {
    const state = await this.read();
    await this.write({
      ...state,
      skipped: { ...state.skipped, [skillKey(ref)]: commit },
    });
  }

  async forget(ref: SkillRef) {
    const state = await this.read();
    const key = skillKey(ref);
    const { [key]: _latest, ...latest } = state.latest;
    const { [key]: _skipped, ...skipped } = state.skipped;
    await this.write({ ...state, latest, skipped });
  }
}
