import { mkdir, realpath } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const SQLITE_BUSY = 5;
const INCUMBENT_TEARDOWN_GRACE_MS = 3000;

export interface AcquireDaemonOwnershipOptions {
  isIncumbentServing?: (userDataPath: string) => Promise<boolean>;
}

function tryBeginExclusive(database: DatabaseSync) {
  try {
    database.exec("BEGIN EXCLUSIVE");
    return true;
  } catch (error) {
    if ((error as { errcode?: number }).errcode === SQLITE_BUSY) return false;
    throw error;
  }
}

export async function acquireDaemonOwnership(
  userDataPath: string,
  options: AcquireDaemonOwnershipOptions = {},
) {
  await mkdir(userDataPath, { recursive: true });
  const directory = await realpath(userDataPath);
  const database = new DatabaseSync(
    path.join(directory, "daemon-owner.sqlite"),
  );
  try {
    if (!tryBeginExclusive(database)) {
      if (await options.isIncumbentServing?.(directory)) {
        throw new Error("The incumbent daemon is still serving");
      }
      database.exec(`PRAGMA busy_timeout = ${INCUMBENT_TEARDOWN_GRACE_MS}`);
      database.exec("BEGIN EXCLUSIVE");
    }
  } catch (cause) {
    database.close();
    throw new Error(`Cannot acquire daemon ownership for ${directory}`, {
      cause,
    });
  }
  let released = false;
  return {
    userDataPath: directory,
    release() {
      if (released) return;
      database.close();
      released = true;
    },
  };
}
