import { PassThrough } from "node:stream";
import { createCredentialReader } from "@cocurdex/cli/internal/read-secret";
import { describe, expect, it, vi } from "vitest";

describe("createCredentialReader", () => {
  it("keeps stdout parseable and preserves spaces in the secret", async () => {
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    try {
      const input = new PassThrough();
      const reader = createCredentialReader({ input, interactive: false });
      input.end("  spaced password  \nrecovery-key\n");
      expect(await reader.read("Login password: ")).toBe("  spaced password  ");
      expect(await reader.read("Recovery key: ")).toBe("recovery-key");
      reader.close();
      expect(stdout).not.toHaveBeenCalled();
      expect(
        stderr.mock.calls.map(([chunk]) => String(chunk)).join(""),
      ).toContain("Login password:");
    } finally {
      stdout.mockRestore();
      stderr.mockRestore();
    }
  });

  it("fails with the prompt label when stdin ends early", async () => {
    const input = new PassThrough();
    const prompts = new PassThrough();
    const reader = createCredentialReader({
      input,
      prompts,
      interactive: false,
    });
    input.end("");
    await expect(reader.read("Login password: ")).rejects.toThrow(
      /Login password/,
    );
    reader.close();
  });
});
