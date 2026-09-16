import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { requestDaemon } from "@cocurdex/daemon/client";
import { getDaemonMetadataPath } from "@cocurdex/daemon/paths";
import type { DaemonMetadata } from "@cocurdex/rpc";
import { DAEMON_PROTOCOL_VERSION } from "@cocurdex/rpc";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCli } from "./helpers/cli";
import {
  type DaemonProcess,
  spawnDaemon,
  waitFor,
} from "./helpers/daemon-process";

interface NoteJson {
  id: string;
  title: string;
  bodyMarkdown?: string;
  revision: number;
}

describe("cocurdex CLI against a running daemon", () => {
  let daemon: DaemonProcess;

  beforeAll(async () => {
    daemon = await spawnDaemon();
  });

  afterAll(async () => {
    await daemon.dispose();
  });

  it("reports daemon status as JSON", async () => {
    const result = await runCli(["daemon", "status", "--json"], {
      userDataPath: daemon.userDataPath,
    });
    expect(result.code).toBe(0);

    const status = JSON.parse(result.stdout) as {
      pid: number;
      protocolVersion: number;
      runtimeFingerprint: string;
    };
    expect(status).toMatchObject({
      pid: daemon.child.pid,
      protocolVersion: DAEMON_PROTOCOL_VERSION,
      runtimeFingerprint: "e2e-runtime",
    });
  });

  it("runs the note lifecycle through CLI commands", async () => {
    const options = { userDataPath: daemon.userDataPath };

    const created = await runCli(
      [
        "note",
        "create",
        "--title",
        "CLI note",
        "--body",
        "created from e2e",
        "--json",
      ],
      options,
    );
    expect(created.code).toBe(0);
    const note = JSON.parse(created.stdout) as NoteJson;
    expect(note.title).toBe("CLI note");
    expect(note.bodyMarkdown).toBe("created from e2e");

    const listed = await runCli(["note", "list", "--json"], options);
    expect(
      (JSON.parse(listed.stdout) as NoteJson[]).map((entry) => entry.id),
    ).toContain(note.id);

    const shown = await runCli(["note", "show", note.id, "--json"], options);
    expect((JSON.parse(shown.stdout) as NoteJson).title).toBe("CLI note");

    const updated = await runCli(
      ["note", "update", note.id, "--title", "Renamed", "--json"],
      options,
    );
    expect((JSON.parse(updated.stdout) as NoteJson).title).toBe("Renamed");

    const deleted = await runCli(
      ["note", "delete", note.id, "--json"],
      options,
    );
    expect(deleted.code).toBe(0);
    expect(JSON.parse(deleted.stdout)).toMatchObject({
      id: note.id,
      deleted: true,
    });

    const gone = await requestDaemon(
      "note.get",
      { id: note.id },
      daemon.options,
    );
    expect(gone).toBeNull();
  });

  it("creates and moves issues through CLI commands", async () => {
    const options = { userDataPath: daemon.userDataPath };

    const created = await runCli(
      [
        "issue",
        "create",
        "--title",
        "CLI issue",
        "--status",
        "backlog",
        "--json",
      ],
      options,
    );
    expect(created.code).toBe(0);
    const issue = JSON.parse(created.stdout) as { id: string; status: string };
    expect(issue.status).toBe("backlog");

    const moved = await runCli(
      ["issue", "move", issue.id, "done", "--json"],
      options,
    );
    expect(moved.code).toBe(0);
    expect((JSON.parse(moved.stdout) as { columnId: string }).columnId).toBe(
      "done",
    );

    const listed = await runCli(
      ["issue", "list", "--status", "done", "--json"],
      options,
    );
    expect(
      (JSON.parse(listed.stdout) as { id: string }[]).map((entry) => entry.id),
    ).toContain(issue.id);
  });

  it("exits non-zero for an incomplete command", async () => {
    const result = await runCli(["note"], {
      userDataPath: daemon.userDataPath,
    });
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("Usage:");
  });
});

describe("cocurdex CLI daemon auto-start", () => {
  it("starts the daemon itself when none is running", async () => {
    const userDataPath = mkdtempSync(
      path.join(tmpdir(), "cocurdex-e2e-autostart-"),
    );
    try {
      const result = await runCli(["daemon", "status", "--json"], {
        userDataPath,
      });
      expect(result.code).toBe(0);
      const status = JSON.parse(result.stdout) as {
        pid: number;
        runtimeFingerprint: string;
      };
      expect(status.pid).toBeGreaterThan(0);

      const metadata = JSON.parse(
        readFileSync(getDaemonMetadataPath(userDataPath), "utf8"),
      ) as DaemonMetadata;
      expect(metadata.pid).toBe(status.pid);
      process.kill(metadata.pid, "SIGTERM");
      await waitFor(
        () => !existsSync(getDaemonMetadataPath(userDataPath)),
        15_000,
      );
    } finally {
      await rm(userDataPath, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
    }
  });
});
