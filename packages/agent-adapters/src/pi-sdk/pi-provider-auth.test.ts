import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  loginPiProvider,
  logoutPiProvider,
  readPiProviderAuthState,
  resolvePiProviderAuth,
} from "./pi-provider-auth";

const temporaryPaths: string[] = [];

afterEach(() => {
  for (const temporaryPath of temporaryPaths.splice(0)) {
    rmSync(temporaryPath, { force: true, recursive: true });
  }
});

describe("Pi provider auth", () => {
  it("uses one Pi credential store for API key login, resolution, and logout", async () => {
    const userDataPath = mkdtempSync(path.join(tmpdir(), "cocurdex-pi-auth-"));
    temporaryPaths.push(userDataPath);

    await loginPiProvider(userDataPath, "openai", "api_key", {
      prompt: async () => "sk-test",
      notify: () => {},
    });

    await expect(
      readPiProviderAuthState(userDataPath, "openai"),
    ).resolves.toEqual(
      expect.objectContaining({ providerId: "openai", type: "api_key" }),
    );
    await expect(
      resolvePiProviderAuth(userDataPath, "openai"),
    ).resolves.toEqual(
      expect.objectContaining({
        auth: expect.objectContaining({ apiKey: "sk-test" }),
      }),
    );

    await logoutPiProvider(userDataPath, "openai");
    await expect(
      readPiProviderAuthState(userDataPath, "openai"),
    ).resolves.toEqual(
      expect.objectContaining({ providerId: "openai", type: null }),
    );
  });
});
