import type { CommandReceiptRepository } from "@cocurdex/db";
import type { DaemonReceiptOutcome, DurableReceiptLog } from "./rpc-receipts";

export const COMMAND_RECEIPT_TTL_MS = 24 * 60 * 60 * 1000;

function parseOutcome(json: string): DaemonReceiptOutcome | null {
  try {
    const parsed = JSON.parse(json) as DaemonReceiptOutcome;
    return parsed?.ok === true ? { ok: true, result: parsed.result } : null;
  } catch {
    return null;
  }
}

export function createCommandReceiptLog(
  getRepository: () => Promise<Pick<CommandReceiptRepository, "get" | "save">>,
  now: () => Date = () => new Date(),
): DurableReceiptLog {
  return {
    async read(key) {
      const json = await (await getRepository()).get(key);
      return json === null ? null : parseOutcome(json);
    },
    async write(key, outcome) {
      await (await getRepository()).save(
        key,
        JSON.stringify({
          ok: outcome.ok,
          result: outcome.ok ? (outcome.result ?? null) : null,
        }),
        now().toISOString(),
      );
    },
  };
}
