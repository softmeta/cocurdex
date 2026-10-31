import { chmod, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { installRsrs } from "@cocurdex/daemon/internal/memory/rsrs";
import { RSRS_CLI_PACKAGE, RSRS_CLI_VERSION } from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, describe, expect, it } from "vitest";

const temp = createTempDirs();

afterAll(() => temp.cleanup());

async function createFakeNpm(directory: string, logPath: string) {
  const scriptPath = path.join(directory, "fake-npm.mjs");
  await writeFile(
    scriptPath,
    `import { appendFileSync } from "node:fs";
appendFileSync(${JSON.stringify(logPath)}, JSON.stringify(process.argv.slice(2)) + "\\n");
`,
    "utf8",
  );
  const shimPath = path.join(
    directory,
    process.platform === "win32" ? "npm.cmd" : "npm",
  );
  await writeFile(
    shimPath,
    process.platform === "win32"
      ? `@echo off\r\n"${process.execPath}" "${scriptPath}" %*\r\n`
      : `#!/bin/sh\nexec "${process.execPath}" "${scriptPath}" "$@"\n`,
    "utf8",
  );
  if (process.platform !== "win32") {
    await chmod(shimPath, 0o755);
  }
  const inherited = process.env.PATH ?? process.env.Path ?? "";
  return {
    ...process.env,
    PATH: `${directory}${path.delimiter}${inherited}`,
  };
}

describe("installRsrs", () => {
  it("installs the pinned rsrs CLI version", async () => {
    const directory = await temp.create("cocurdex-rsrs-install-");
    const logPath = path.join(directory, "npm.log");
    const env = await createFakeNpm(directory, logPath);

    const result = await installRsrs({ env, timeoutMs: 30_000 });

    const pinned = `${RSRS_CLI_PACKAGE}@${RSRS_CLI_VERSION}`;
    expect(result.command).toBe(`npm install -g ${pinned}`);
    const calls = (await readFile(logPath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as string[]);
    expect(calls).toContainEqual(["install", "-g", pinned]);
    expect(calls.flat()).not.toContain(`${RSRS_CLI_PACKAGE}@latest`);
  });
});
