import { mkdir, realpath } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export async function acquireDaemonOwnership(userDataPath: string) {
  await mkdir(userDataPath, { recursive: true });
  const directory = await realpath(userDataPath);
  const database = new DatabaseSync(
    path.join(directory, "daemon-owner.sqlite"),
  );
  try {
    database.exec("PRAGMA busy_timeout = 0");
    database.exec("BEGIN EXCLUSIVE");
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
