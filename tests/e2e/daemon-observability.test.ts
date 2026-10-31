import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { requestDaemon } from "@cocurdex/daemon/client";
import {
  type DaemonProcess,
  spawnDaemon,
} from "@cocurdex/test-harness/helpers/daemon-process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCli } from "./helpers/cli";

interface LogLine {
  level: string;
  scope: string;
  event: string;
  details?: Record<string, unknown>;
}

function readDaemonLog(userDataPath: string) {
  const filePath = path.join(userDataPath, "logs", "daemon", "daemon.log");
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as LogLine);
}

describe("daemon observability", () => {
  let daemon: DaemonProcess;

  beforeAll(async () => {
    daemon = await spawnDaemon();
  });

  afterAll(async () => {
    await daemon.dispose();
  });

  it("writes structured startup records into its own log file", () => {
    const started = readDaemonLog(daemon.userDataPath).find(
      (line) => line.event === "daemon.started",
    );
    expect(started).toMatchObject({ level: "info", scope: "daemon" });
    expect(started?.details).toMatchObject({ platform: process.platform });
  });

  it("reports health through RPC and the CLI", async () => {
    const health = await requestDaemon("daemon.health", daemon.options);
    expect(health.pid).toBe(daemon.child.pid);
    expect(health.logs.directory).toBe(
      path.join(daemon.userDataPath, "logs", "daemon"),
    );
    expect(health.database.schemaVersion).toBeGreaterThan(0);

    const result = await runCli(["daemon", "health"], {
      userDataPath: daemon.userDataPath,
    });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`pid            ${daemon.child.pid}`);
  });

  it("logs failed requests and switches to debug on demand", async () => {
    await expect(
      requestDaemon("note.get", { id: 42 } as never, daemon.options),
    ).rejects.toThrow();

    const level = await runCli(["diagnostics", "level", "debug", "--json"], {
      userDataPath: daemon.userDataPath,
    });
    expect(JSON.parse(level.stdout)).toEqual({ level: "debug" });
    await requestDaemon("daemon.status", daemon.options);

    const lines = readDaemonLog(daemon.userDataPath);
    expect(lines).toContainEqual(
      expect.objectContaining({
        event: "rpc.failed",
        details: expect.objectContaining({ method: "note.get" }),
      }),
    );
    expect(lines).toContainEqual(
      expect.objectContaining({
        level: "debug",
        event: "rpc.completed",
        details: expect.objectContaining({ method: "daemon.status" }),
      }),
    );
  });

  it("exports a redacted diagnostics bundle from the CLI", async () => {
    const result = await runCli(["diagnostics", "export", "--json"], {
      userDataPath: daemon.userDataPath,
    });
    expect(result.code).toBe(0);
    const exported = JSON.parse(result.stdout) as {
      outputPath: string;
      fileCount: number;
    };
    expect(
      existsSync(
        path.join(
          daemon.userDataPath,
          "diagnostics",
          path.basename(exported.outputPath),
        ),
      ),
    ).toBe(true);
    expect(readdirSync(path.join(exported.outputPath, "daemon"))).toContain(
      "daemon.log",
    );
    const summary = JSON.parse(
      readFileSync(path.join(exported.outputPath, "summary.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(summary).toMatchObject({ droppedFiles: 0, omittedFiles: 0 });
    const metadata = readFileSync(
      path.join(exported.outputPath, "metadata.json"),
      "utf8",
    );
    expect(metadata).not.toContain(daemon.userDataPath);
  });
});
