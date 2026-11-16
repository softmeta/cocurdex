import { existsSync, renameSync } from "node:fs";
import path from "node:path";
import { ReasonError } from "@cocurdex/shared";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { Storage } from "@earendil-works/pi-durable";
import {
  type SqliteDatabase,
  SqliteStorage,
} from "@earendil-works/pi-durable/storage/sqlite";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { logAdapterDiagnostic } from "../diagnostics";

/** Where pi-durable kept its storage before it moved into cocurdex.sqlite. */
export const LEGACY_DURABLE_DATABASE_FILENAME = "pi-durable.sqlite";
export const DURABLE_TABLE_PREFIX = "pi_durable_";
const METADATA_TABLE = `${DURABLE_TABLE_PREFIX}durable_metadata`;

/** The daemon's database, holding pi-durable's tables under `DURABLE_TABLE_PREFIX`. */
export interface DurableStoreSource {
  open(): SqliteDatabase;
  hasTable(name: string): boolean;
  importTables(sourcePath: string, prefix: string): void;
}

const sources = new Map<string, DurableStoreSource>();

export function useDurableStore(
  userDataPath: string,
  source: DurableStoreSource,
) {
  sources.set(userDataPath, source);
}

function sourceFor(userDataPath: string) {
  const source = sources.get(userDataPath);
  if (!source) {
    throw new ReasonError(
      "durable.storeMissing",
      "No durable store is configured for this user data path",
    );
  }
  return source;
}

function legacyPath(userDataPath: string) {
  return path.join(userDataPath, LEGACY_DURABLE_DATABASE_FILENAME);
}

/** Whether durable storage was ever created, without opening it. */
export function hasDurableStorage(userDataPath: string) {
  return (
    existsSync(legacyPath(userDataPath)) ||
    sourceFor(userDataPath).hasTable(METADATA_TABLE)
  );
}

async function hasConversations(source: DurableStoreSource) {
  const storage = await SqliteStorage.open(source.open(), {
    prefix: DURABLE_TABLE_PREFIX,
  });
  try {
    const page = await storage.scanConversations(
      {},
      1,
      undefined,
      BACKGROUND_CONTEXT,
    );
    return page.items.length > 0;
  } finally {
    await storage.close(BACKGROUND_CONTEXT);
  }
}

async function importLegacyStorage(
  userDataPath: string,
  source: DurableStoreSource,
) {
  const legacy = legacyPath(userDataPath);
  if (!existsSync(legacy)) return;
  if (await hasConversations(source)) {
    logAdapterDiagnostic("warn", "pi-durable: legacy store left in place", {
      reason: "target has conversations",
    });
    return;
  }
  const migrated = await openNodeSqliteStorage(legacy);
  await migrated.close(BACKGROUND_CONTEXT);
  source.importTables(legacy, DURABLE_TABLE_PREFIX);
  const suffix = `.migrated-${new Date().toISOString().replaceAll(":", "-")}`;
  for (const file of [legacy, `${legacy}-wal`, `${legacy}-shm`]) {
    if (existsSync(file)) renameSync(file, `${file}${suffix}`);
  }
  logAdapterDiagnostic("info", "pi-durable: legacy store imported", {});
}

export async function openDurableStorage(
  userDataPath: string | undefined,
): Promise<Storage> {
  if (!userDataPath) return openNodeSqliteStorage(":memory:");
  const source = sourceFor(userDataPath);
  await importLegacyStorage(userDataPath, source);
  return SqliteStorage.open(source.open(), { prefix: DURABLE_TABLE_PREFIX });
}
