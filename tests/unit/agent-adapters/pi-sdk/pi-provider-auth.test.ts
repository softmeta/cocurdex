import {
  loginPiProvider,
  logoutPiProvider,
  readPiProviderAuthState,
  resolvePiProviderAuth,
} from "@cocurdex/agent-adapters/internal/pi-sdk/pi-provider-auth";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterEach, describe, expect, it, vi } from "vitest";

const tempDirs = createTempDirs();

afterEach(async () => {
  await tempDirs.cleanup();
});

describe("Pi provider auth", () => {
  it("uses one Pi credential store for API key login, resolution, and logout", async () => {
    const userDataPath = tempDirs.createSync("cocurdex-pi-auth-");

    await loginPiProvider(userDataPath, "openai", "api_key", {
      prompt: async () => "sk-test",
      notify: () => {},
    });

    await expect(
      readPiProviderAuthState(userDataPath, "openai"),
    ).resolves.toEqual(
      expect.objectContaining({
        providerId: "openai",
        type: "api_key",
        origin: "stored",
        source: null,
      }),
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

  it("reports an environment API key as an ambient source", async () => {
    const userDataPath = tempDirs.createSync("cocurdex-pi-auth-");
    vi.stubEnv("OPENAI_API_KEY", "sk-env");

    try {
      await expect(
        readPiProviderAuthState(userDataPath, "openai"),
      ).resolves.toEqual({
        providerId: "openai",
        type: "api_key",
        origin: "ambient",
        source: "OPENAI_API_KEY",
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
