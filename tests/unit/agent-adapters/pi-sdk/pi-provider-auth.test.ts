import { readFile } from "node:fs/promises";
import path from "node:path";
import { getPiAgentDir } from "@cocurdex/agent-adapters/internal/pi-sdk/pi-paths";
import {
  loginPiProvider,
  logoutPiProvider,
  readPiProviderAuthState,
} from "@cocurdex/agent-adapters/internal/pi-sdk/pi-provider-auth";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterEach, describe, expect, it, vi } from "vitest";

const tempDirs = createTempDirs();

afterEach(async () => {
  vi.unstubAllEnvs();
  await tempDirs.cleanup();
});

describe("Pi provider auth", () => {
  it("uses one Pi credential store for API key login, state, and logout", async () => {
    const userDataPath = tempDirs.createSync("cocurdex-pi-auth-");
    vi.stubEnv("PI_OFFLINE", "1");

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
    const authFile = path.join(getPiAgentDir(userDataPath), "auth.json");
    expect(JSON.parse(await readFile(authFile, "utf8"))).toEqual({
      openai: expect.objectContaining({ type: "api_key", key: "sk-test" }),
    });

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
