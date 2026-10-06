import { tmpdir } from "node:os";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCredentialVault,
  credentialStoreUnavailableMessage,
} from "./vault";

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
