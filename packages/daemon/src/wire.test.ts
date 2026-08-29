import { access, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getDaemonMetadataPath, getDaemonSocketPath } from "./paths";
import { startDaemonServer } from "./wire";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("startDaemonServer", () => {
  it("closes owned resources and can be started again", async () => {
    const userDataPath = await mkdtemp(
      path.join(os.tmpdir(), "cocurdex-daemon-"),
    );
    temporaryDirectories.push(userDataPath);
    const first = await startDaemonServer({
      runtimeFingerprint: "first-runtime",
      token: "test-token",
      userDataPath,
    });

    try {
      await access(getDaemonMetadataPath(userDataPath));
      expect(first.service.status().runtimeFingerprint).toBe("first-runtime");
      const close = (first as typeof first & { close?: () => Promise<void> })
        .close;

      expect(close).toBeTypeOf("function");
      await close?.();
      await close?.();

      await expect(
        access(getDaemonMetadataPath(userDataPath)),
      ).rejects.toThrow();
      if (process.platform !== "win32") {
        await expect(
          access(getDaemonSocketPath(userDataPath)),
        ).rejects.toThrow();
      }

      const second = await startDaemonServer({
        runtimeFingerprint: "second-runtime",
        token: "test-token",
        userDataPath,
      });
      expect(second.service.status().runtimeFingerprint).toBe("second-runtime");
      await (
        second as typeof second & { close?: () => Promise<void> }
      ).close?.();
    } finally {
      if (first.server.listening) {
        await new Promise<void>((resolve, reject) => {
          first.server.close((error) => {
            if (error) reject(error);
            else resolve();
          });
        });
      }
    }
  });
});
