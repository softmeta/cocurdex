import { ReasonError } from "@cocurdex/shared";
import { logDaemonDiagnostic } from "../diagnostics";

// Releases up to v0.1.104-beta.18 kept a per-assistant "already told the
// user" list as one memory record per assistant and pointed at it from this
// setting: { [personaId]: { provider, memoryId, cursors } }.
const TOLD_LEDGER_KEY = "memory.toldLedgers";

interface ToldLedgerCleanupState {
  getAppSetting(key: string): Promise<string | null>;
  setAppSetting(key: string, valueJson: string): Promise<void>;
}

interface ToldLedgerCleanupMemory {
  providerId(): string;
  forget(id: string): Promise<void>;
}

type LeftoverRef = { provider: string; memoryId: string };

function parseLeftovers(raw: string | null): Record<string, LeftoverRef> {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const refs: Record<string, LeftoverRef> = {};
  for (const [personaId, value] of Object.entries(parsed)) {
    if (!value || typeof value !== "object") continue;
    const { provider, memoryId } = value as Record<string, unknown>;
    if (typeof provider === "string" && typeof memoryId === "string") {
      refs[personaId] = { provider, memoryId };
    }
  }
  return refs;
}

// Deletes those records from the current memory provider. A record whose
// delete fails, for example while memory is off, stays listed so the next
// start retries it; one already gone or kept by another provider is dropped.
export async function cleanUpToldLedgers(
  state: ToldLedgerCleanupState,
  memory: ToldLedgerCleanupMemory,
) {
  const raw = await state.getAppSetting(TOLD_LEDGER_KEY);
  if (raw === null || raw === "{}") return;
  const leftovers = parseLeftovers(raw);
  const remaining: Record<string, LeftoverRef> = {};
  for (const [personaId, ref] of Object.entries(leftovers)) {
    if (ref.provider !== memory.providerId()) continue;
    try {
      await memory.forget(ref.memoryId);
    } catch (error) {
      if (error instanceof ReasonError && error.reason === "memory.notFound") {
        continue;
      }
      remaining[personaId] = ref;
      logDaemonDiagnostic("info", "memory.toldLedgerForgetFailed", {
        personaId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  await state.setAppSetting(TOLD_LEDGER_KEY, JSON.stringify(remaining));
}
