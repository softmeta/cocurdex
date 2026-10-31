import {
  MEMORY_SETTINGS_KEY,
  type MemoryDoctorReport,
  type MemorySettings,
  normalizeMemorySettings,
  parseMemorySettings,
  serializeMemorySettings,
} from "@cocurdex/shared";

export const MEMORY_INSTALL_STATE_KEY = "memory.installState";
export const MEMORY_CAPTURES_KEY = "memory.captures";

export interface MemoryCaptureRecord {
  memoryId: string | null;
  savedAt: string;
  lastAssistantMessageId: string | null;
  kind: "turn" | "session";
}

export type MemoryCaptureMap = Record<string, MemoryCaptureRecord>;

export function parseMemoryCaptures(raw: string | null): MemoryCaptureMap {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const result: MemoryCaptureMap = {};
    for (const [sessionId, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const record = value as Partial<MemoryCaptureRecord>;
      if (typeof record.savedAt !== "string") continue;
      result[sessionId] = {
        memoryId: typeof record.memoryId === "string" ? record.memoryId : null,
        savedAt: record.savedAt,
        lastAssistantMessageId:
          typeof record.lastAssistantMessageId === "string"
            ? record.lastAssistantMessageId
            : null,
        kind: record.kind === "session" ? "session" : "turn",
      };
    }
    return result;
  } catch {
    return {};
  }
}

export function trimMemoryCaptures(captures: MemoryCaptureMap) {
  const entries = Object.entries(captures).sort((left, right) =>
    right[1].savedAt.localeCompare(left[1].savedAt),
  );
  return Object.fromEntries(entries.slice(0, 500));
}

export async function readMemoryCaptures(
  store: MemorySettingsStore,
): Promise<MemoryCaptureMap> {
  return parseMemoryCaptures(await store.getAppSetting(MEMORY_CAPTURES_KEY));
}

export async function writeMemoryCapture(
  store: MemorySettingsStore,
  sessionId: string,
  record: MemoryCaptureRecord,
) {
  const captures = await readMemoryCaptures(store);
  captures[sessionId] = record;
  await store.setAppSetting(
    MEMORY_CAPTURES_KEY,
    JSON.stringify(trimMemoryCaptures(captures)),
  );
}

export interface MemoryInstallState {
  attemptedAt: string | null;
  status: "idle" | "installing" | "ready" | "failed";
  version: string | null;
  executable: string | null;
  error: string | null;
  doctor: MemoryDoctorReport | null;
}

export interface MemorySettingsStore {
  getAppSetting(key: string): Promise<string | null>;
  setAppSetting(key: string, valueJson: string): Promise<unknown>;
}

export async function readMemorySettings(
  store: MemorySettingsStore,
): Promise<MemorySettings> {
  return parseMemorySettings(await store.getAppSetting(MEMORY_SETTINGS_KEY));
}

export async function writeMemorySettings(
  store: MemorySettingsStore,
  settings: MemorySettings,
): Promise<MemorySettings> {
  const normalized = normalizeMemorySettings(settings);
  await store.setAppSetting(
    MEMORY_SETTINGS_KEY,
    serializeMemorySettings(normalized),
  );
  return normalized;
}

function parseInstallState(raw: string | null): MemoryInstallState {
  if (!raw) {
    return {
      attemptedAt: null,
      status: "idle",
      version: null,
      executable: null,
      error: null,
      doctor: null,
    };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<MemoryInstallState>;
    return {
      attemptedAt:
        typeof parsed.attemptedAt === "string" ? parsed.attemptedAt : null,
      status:
        parsed.status === "installing" ||
        parsed.status === "ready" ||
        parsed.status === "failed"
          ? parsed.status
          : "idle",
      version: typeof parsed.version === "string" ? parsed.version : null,
      executable:
        typeof parsed.executable === "string" ? parsed.executable : null,
      error: typeof parsed.error === "string" ? parsed.error : null,
      doctor: parsed.doctor ?? null,
    };
  } catch {
    return {
      attemptedAt: null,
      status: "idle",
      version: null,
      executable: null,
      error: null,
      doctor: null,
    };
  }
}

export async function readMemoryInstallState(
  store: MemorySettingsStore,
): Promise<MemoryInstallState> {
  return parseInstallState(await store.getAppSetting(MEMORY_INSTALL_STATE_KEY));
}

export async function writeMemoryInstallState(
  store: MemorySettingsStore,
  state: MemoryInstallState,
) {
  await store.setAppSetting(MEMORY_INSTALL_STATE_KEY, JSON.stringify(state));
}
