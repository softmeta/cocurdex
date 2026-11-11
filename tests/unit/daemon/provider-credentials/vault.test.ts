import { readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  CREDENTIAL_FILE_NAME,
  createCredentialVault,
  credentialStoreUnavailableMessage,
} from "@cocurdex/daemon/internal/provider-credentials/vault";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const dirs = createTempDirs();
afterAll(() => dirs.cleanup());

const read = vi.hoisted(() => vi.fn());
const write = vi.hoisted(() => vi.fn());
const remove = vi.hoisted(() => vi.fn());
vi.mock("@napi-rs/keyring", () => ({
  AsyncEntry: class {
    getPassword = read;
    setPassword = write;
    deleteCredential = remove;
  },
}));

beforeEach(() => {
  read.mockReset();
  write.mockReset();
  remove.mockReset();
});

describe("system credential vault", () => {
  it("distinguishes a missing key from an inaccessible store", async () => {
    const vault = createCredentialVault(tmpdir());
    read
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Native error with sensitive details"));
    await expect(vault.read("test")).resolves.toBeNull();
    await expect(vault.read("test")).rejects.toThrow(
      credentialStoreUnavailableMessage(),
    );
  });

  it("reports failed mutations without a plaintext fallback or raw native error", async () => {
    const vault = createCredentialVault(tmpdir());
    write.mockRejectedValueOnce(new Error("sensitive details"));
    remove.mockRejectedValueOnce(new Error("sensitive details"));
    const unavailable = new Error(credentialStoreUnavailableMessage());
    await expect(vault.write("test", "test-value")).rejects.toThrow(
      unavailable,
    );
    await expect(vault.remove("test")).rejects.toThrow(unavailable);
  });

  it("tells Linux users which Secret Service providers can back the store", () => {
    expect(credentialStoreUnavailableMessage("linux")).toContain(
      "GNOME Keyring or KWallet",
    );
    expect(credentialStoreUnavailableMessage("darwin")).toBe(
      "System credential store is unavailable",
    );
  });
});

describe("headless credential vault", () => {
  const unavailable = () => Promise.reject(new Error("no Secret Service"));

  it("keeps keys in an owner-only file while the system keyring is unavailable", async () => {
    const userData = await dirs.create("vault-");
    const vault = createCredentialVault(userData, { fileFallback: true });
    read.mockImplementation(unavailable);
    write.mockImplementation(unavailable);
    remove.mockImplementation(unavailable);

    await vault.write("openai", "test-key");
    await expect(vault.read("openai")).resolves.toBe("test-key");
    await expect(vault.backend()).resolves.toBe("file");
    const file = path.join(userData, CREDENTIAL_FILE_NAME);
    if (process.platform !== "win32") {
      expect((await stat(file)).mode & 0o777).toBe(0o600);
    }

    await vault.remove("openai");
    await expect(vault.read("openai")).resolves.toBeNull();
    await expect(readFile(file)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(vault.backend()).resolves.toBe("keyring");
  });

  it("moves a key out of the file once the keyring accepts it", async () => {
    const userData = await dirs.create("vault-");
    const vault = createCredentialVault(userData, { fileFallback: true });
    write.mockImplementationOnce(unavailable);
    await vault.write("openai", "old-key");

    write.mockResolvedValueOnce(undefined);
    await vault.write("openai", "new-key");
    await expect(vault.backend()).resolves.toBe("keyring");
    read.mockResolvedValueOnce("new-key");
    await expect(vault.read("openai")).resolves.toBe("new-key");
  });
});
