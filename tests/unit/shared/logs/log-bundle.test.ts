import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  copyLogDirectory,
  redactFilesInPlace,
  summarizeLogFiles,
} from "@cocurdex/shared/node";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();
afterAll(() => tempDirs.cleanup());

describe("log bundles", () => {
  it("copies logs with session files, redacts them, and summarizes problems", async () => {
    const source = await tempDirs.create("cocu-bundle-src-");
    const target = path.join(await tempDirs.create("cocu-bundle-dst-"), "out");
    const home = os.homedir();
    await fs.mkdir(path.join(source, "sessions"));
    await fs.writeFile(
      path.join(source, "main.log"),
      [
        `stale line ${home}/secret-project token sk-abcdefghijklmnop1234`,
        JSON.stringify({
          event: "app.warning",
          level: "warn",
          scope: "app",
          timestamp: "2026-01-01T00:00:00.000Z",
        }),
        "",
      ].join("\r\n"),
    );
    await fs.writeFile(path.join(source, "notes.txt"), "ignored");
    await fs.writeFile(
      path.join(source, "sessions", "2026-s-1.log"),
      `${JSON.stringify({ event: "turn", level: "info" })}\n`,
    );

    const { copied, omitted } = await copyLogDirectory(source, target, 1024);
    const { kept, dropped } = await redactFilesInPlace(copied);
    expect(omitted).toBe(0);
    const summary = await summarizeLogFiles(target, kept);

    expect(dropped).toEqual([]);
    expect(kept.map((file) => path.relative(target, file)).sort()).toEqual([
      "main.log",
      path.join("sessions", "2026-s-1.log"),
    ]);
    const exported = await fs.readFile(path.join(target, "main.log"), "utf8");
    expect(exported).not.toContain(home);
    expect(exported).not.toContain("sk-abcdefghijklmnop1234");
    expect(summary.levelCounts).toEqual({ info: 1, warn: 1 });
    expect(summary.recentProblems[0]?.event).toBe("app.warning");
    expect(summary.sessions).toEqual(["sessions/2026-s-1.log"]);
  });

  it("returns nothing for a missing source directory", async () => {
    const target = path.join(await tempDirs.create("cocu-bundle-dst-"), "out");
    expect(
      await copyLogDirectory(path.join(target, "missing"), target, 1024),
    ).toEqual({ copied: [], omitted: 0 });
  });

  it("keeps the newest logs that fit the byte budget", async () => {
    const source = await tempDirs.create("cocu-bundle-src-");
    const target = path.join(await tempDirs.create("cocu-bundle-dst-"), "out");
    const files = [
      { name: "main-old.log", bytes: 600, ageSeconds: 300 },
      { name: "main-mid.log", bytes: 600, ageSeconds: 200 },
      { name: "main-small.log", bytes: 100, ageSeconds: 100 },
      { name: "main.log", bytes: 300, ageSeconds: 0 },
    ];
    const now = Date.now() / 1000;
    for (const file of files) {
      const filePath = path.join(source, file.name);
      await fs.writeFile(filePath, "x".repeat(file.bytes));
      await fs.utimes(filePath, now - file.ageSeconds, now - file.ageSeconds);
    }

    const { copied, omitted } = await copyLogDirectory(source, target, 1000);

    expect(copied.map((file) => path.basename(file))).toEqual([
      "main.log",
      "main-small.log",
      "main-mid.log",
    ]);
    expect(omitted).toBe(1);
  });
});
