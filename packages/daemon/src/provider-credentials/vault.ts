import { createHash, randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadNativeKeyring } from "../packaged-module";

export const CREDENTIAL_FILE_NAME = "credentials.json";

export type CredentialBackend = "keyring" | "file";

export interface CredentialVault {
  read(id: string): Promise<string | null>;
  write(id: string, value: string): Promise<void>;
  remove(id: string): Promise<void>;
  backend(): Promise<CredentialBackend>;
}

export type CredentialStore = "keyring" | "keyring-or-file" | "file";

export interface CredentialVaultOptions {
  store?: CredentialStore;
}

export function headlessCredentialStore(
  platform: NodeJS.Platform,
): CredentialStore {
  // Without a Secret Service, @napi-rs/keyring on Linux stores keys in the
  // kernel keyring (keyutils), which a reboot clears.
  return platform === "linux" ? "file" : "keyring-or-file";
}

export function credentialStoreUnavailableMessage(
  platform: NodeJS.Platform = process.platform,
): string {
  const base = "System credential store is unavailable";
  if (platform !== "linux") {
    return base;
  }
  return `${base}. Install and unlock a Secret Service provider such as GNOME Keyring or KWallet, then retry.`;
}

function keyringVault(userDataPath: string) {
  const scope = createHash("sha256")
    .update(realpathSync(userDataPath))
    .digest("hex");
  const service = `com.cocurdex.credentials.${scope}`;
  const entry = async (id: string) => {
    const { AsyncEntry } = await loadNativeKeyring();
    return new AsyncEntry(service, id);
  };
  return {
    async read(id: string) {
      try {
        return (await (await entry(id)).getPassword()) ?? null;
      } catch {
        throw new Error(credentialStoreUnavailableMessage());
      }
    },
    async write(id: string, value: string) {
      try {
        await (await entry(id)).setPassword(value);
      } catch {
        throw new Error(credentialStoreUnavailableMessage());
      }
    },
    async remove(id: string) {
      try {
        await (await entry(id)).deleteCredential();
      } catch {
        throw new Error(credentialStoreUnavailableMessage());
      }
    },
  };
}

function credentialFile(userDataPath: string) {
  const filePath = path.join(userDataPath, CREDENTIAL_FILE_NAME);

  async function load(): Promise<Record<string, string>> {
    let text: string;
    try {
      text = await readFile(filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw error;
    }
    const parsed = JSON.parse(text) as { entries?: unknown };
    const entries = parsed.entries;
    if (!entries || typeof entries !== "object") return {};
    return Object.fromEntries(
      Object.entries(entries).filter(
        (pair): pair is [string, string] => typeof pair[1] === "string",
      ),
    );
  }

  async function save(entries: Record<string, string>) {
    if (Object.keys(entries).length === 0) {
      await rm(filePath, { force: true });
      return;
    }
    await mkdir(userDataPath, { recursive: true });
    const tempPath = `${filePath}.${randomUUID()}.tmp`;
    await writeFile(tempPath, JSON.stringify({ version: 1, entries }), {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(tempPath, filePath);
  }

  return {
    async read(id: string) {
      return (await load())[id] ?? null;
    },
    async write(id: string, value: string) {
      await save({ ...(await load()), [id]: value });
    },
    async remove(id: string) {
      const entries = await load();
      if (!(id in entries)) return;
      const { [id]: _removed, ...rest } = entries;
      await save(rest);
    },
    async isEmpty() {
      return Object.keys(await load()).length === 0;
    },
  };
}

export function createCredentialVault(
  userDataPath: string,
  options: CredentialVaultOptions = {},
): CredentialVault {
  const store = options.store ?? "keyring";
  if (store === "file") {
    const { isEmpty: _isEmpty, ...file } = credentialFile(userDataPath);
    return { ...file, backend: async () => "file" };
  }
  const keyring = keyringVault(userDataPath);
  if (store === "keyring") {
    return { ...keyring, backend: async () => "keyring" };
  }
  const file = credentialFile(userDataPath);
  return {
    async read(id) {
      const stored = await keyring.read(id).catch(() => null);
      return stored ?? file.read(id);
    },
    async write(id, value) {
      try {
        await keyring.write(id, value);
      } catch {
        await file.write(id, value);
        return;
      }
      await file.remove(id);
    },
    async remove(id) {
      await keyring.remove(id).catch(() => undefined);
      await file.remove(id);
    },
    async backend() {
      return (await file.isEmpty()) ? "keyring" : "file";
    },
  };
}
