import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { loadNativeKeyring } from "./native-module";

export interface CredentialVault {
  read(id: string): Promise<string | null>;
  write(id: string, value: string): Promise<void>;
  remove(id: string): Promise<void>;
}

export function createCredentialVault(userDataPath: string): CredentialVault {
  const scope = createHash("sha256")
    .update(realpathSync(userDataPath))
    .digest("hex");
  const service = `com.cocurdex.credentials.${scope}`;
  const entry = async (id: string) => {
    const { AsyncEntry } = await loadNativeKeyring();
    return new AsyncEntry(service, id);
  };
  return {
    async read(id) {
      try {
        return (await (await entry(id)).getPassword()) ?? null;
      } catch {
        throw new Error("System credential store is unavailable");
      }
    },
    async write(id, value) {
      try {
        await (await entry(id)).setPassword(value);
      } catch {
        throw new Error("System credential store is unavailable");
      }
    },
    async remove(id) {
      try {
        await (await entry(id)).deleteCredential();
      } catch {
        throw new Error("System credential store is unavailable");
      }
    },
  };
}
