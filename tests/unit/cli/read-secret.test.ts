import { PassThrough } from "node:stream";
import { createCredentialReader } from "@cocurdex/cli/internal/read-secret";
import { describe, expect, it, vi } from "vitest";

class TerminalInput extends PassThrough {
  isTTY = true;
  rawModes: boolean[] = [];

  setRawMode(mode: boolean) {
    this.rawModes.push(mode);
    return this;
  }
}

describe("createCredentialReader", () => {
  it("disables terminal echo when stdin is a TTY", async () => {
    const input = new TerminalInput();
    const prompts = new PassThrough();
    let written = "";
    prompts.on("data", (chunk) => {
      written += String(chunk);
    });
    const reader = createCredentialReader({ input, prompts });
    const pending = reader.read("Login password: ");
    input.write("secret\n");
    expect(await pending).toBe("secret");
    reader.close();
    expect(input.rawModes).toContain(true);
    expect(written).not.toContain("secret");
  });

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
