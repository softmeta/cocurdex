import fs from "node:fs";
import path from "node:path";
import {
  createSavedHostStore,
  type KeyValueStorage,
} from "@cocurdex/client-runtime";
import { writePrivateFile } from "../host-access/host-key-store";

export const REMOTE_HOSTS_FILENAME = "remote-hosts.json";

function privateFileStorage(filePath: string): KeyValueStorage {
  return {
    getItem() {
      try {
        return fs.readFileSync(filePath, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    setItem(_key, value) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      writePrivateFile(filePath, `${value}\n`);
    },
  };
}

export function createRemoteHostStore(userDataPath: string) {
  return createSavedHostStore(
    privateFileStorage(path.join(userDataPath, REMOTE_HOSTS_FILENAME)),
  );
}
