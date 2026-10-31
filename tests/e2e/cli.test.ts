import { existsSync, readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { requestDaemon } from "@cocurdex/daemon/client";
import { getDaemonMetadataPath } from "@cocurdex/daemon/paths";
import type { DaemonMetadata } from "@cocurdex/rpc";
import { DAEMON_PROTOCOL_VERSION } from "@cocurdex/rpc";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import {
  type DaemonProcess,
  requestDaemonShutdown,
  spawnDaemon,
  waitFor,
} from "@cocurdex/test-harness/helpers/daemon-process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCli } from "./helpers/cli";

const tempDirs = createTempDirs();
afterAll(() => tempDirs.cleanup());

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

  it("creates a session the daemon configures from CLI flags", async () => {
    const options = { userDataPath: daemon.userDataPath };
    const workspacePath = tempDirs.createSync("cli-session-");
    const now = new Date().toISOString();
    await requestDaemon(
      "provider.config.save",
      {
        config: {
          id: "cli-stub",
          name: "CLI Stub",
          baseUrl: "http://127.0.0.1:9/v1",
          enabled: true,
          apiKeySecretId: null,
          headersJson: null,
          createdAt: now,
          updatedAt: now,
        },
      },
      daemon.options,
    );
    await requestDaemon(
      "provider.model.save",
      {
        model: {
          providerId: "cli-stub",
          modelId: "cli-agent-model",
          name: "CLI Agent Model",
          api: "openai-completions",
          enabled: true,
          source: "manual",
          capabilities: ["agent"],
          createdAt: now,
          updatedAt: now,
        },
      },
      daemon.options,
    );

    const created = await runCli(
      [
        "session",
        "create",
        "--workspace",
        workspacePath,
        "--agent",
        "pi",
        "--provider",
        "cli-stub",
        "--model",
        "cli-agent-model",
        "--title",
        "CLI task",
        "--json",
      ],
      options,
    );
    expect(created.code).toBe(0);
    expect(JSON.parse(created.stdout)).toMatchObject({
      title: "CLI task",
      agentType: "pi",
      sessionKind: "main",
      providerSnapshot: { providerId: "cli-stub", modelId: "cli-agent-model" },
    });

    const halfModel = await runCli(
      [
        "session",
        "create",
        "--workspace",
        workspacePath,
        "--provider",
        "cli-stub",
      ],
      options,
    );
    expect(halfModel.code).not.toBe(0);
    expect(halfModel.stderr).toContain("--provider and --model");

    const unknownModel = await runCli(
      [
        "session",
        "create",
        "--workspace",
        workspacePath,
        "--agent",
        "pi",
        "--provider",
        "cli-stub",
        "--model",
        "missing",
      ],
      options,
    );
    expect(unknownModel.code).not.toBe(0);
    expect(unknownModel.stderr).toContain(
      "cli-stub/missing is not available for pi",
    );

    const role = await requestDaemon(
      "agentRole.save",
      {
        name: "CLI Reviewer",
        agentId: "pi",
        providerId: "cli-stub",
        modelId: "cli-agent-model",
        modelName: "CLI Agent Model",
        permissionMode: null,
        sessionModeId: null,
        reasoningEffort: null,
        serviceTier: null,
        fastMode: null,
        thinkingLevel: null,
        openCodeAgent: null,
        openCodeVariant: null,
      },
      daemon.options,
    );
    const withRole = await runCli(
      [
        "session",
        "create",
        "--workspace",
        workspacePath,
        "--role",
        role.id,
        "--json",
      ],
      options,
    );
    expect(withRole.code).toBe(0);
    expect(JSON.parse(withRole.stdout)).toMatchObject({
      agentType: "pi",
      agentRoleId: role.id,
      providerSnapshot: { providerId: "cli-stub", modelId: "cli-agent-model" },
    });

    const unknownRole = await runCli(
      ["session", "create", "--workspace", workspacePath, "--role", "missing"],
      options,
    );
    expect(unknownRole.code).not.toBe(0);
    expect(unknownRole.stderr).toContain("Agent role missing was not found");
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

  it("renames a label without detaching its issues", async () => {
    const options = { userDataPath: daemon.userDataPath };
    const label = JSON.parse(
      (
        await runCli(
          ["issue", "label", "create", "--name", "old-name", "--json"],
          options,
        )
      ).stdout,
    ) as { id: string };
    const issue = JSON.parse(
      (
        await runCli(
          [
            "issue",
            "create",
            "--title",
            "Labeled issue",
            "--labels",
            "old-name",
            "--json",
          ],
          options,
        )
      ).stdout,
    ) as { id: string };

    const renamed = await runCli(
      [
        "issue",
        "label",
        "update",
        "old-name",
        "--name",
        "new-name",
        "--color",
        "teal",
        "--json",
      ],
      options,
    );
    expect(renamed.code).toBe(0);
    expect(JSON.parse(renamed.stdout)).toEqual({
      id: label.id,
      name: "new-name",
      color: "teal",
    });

    const listed = await runCli(
      ["issue", "list", "--label", "new-name", "--json"],
      options,
    );
    expect(
      (JSON.parse(listed.stdout) as { id: string }[]).map((entry) => entry.id),
    ).toEqual([issue.id]);
  });

  it("links a note and an issue through CLI commands", async () => {
    const options = { userDataPath: daemon.userDataPath };
    const note = JSON.parse(
      (
        await runCli(
          ["note", "create", "--title", "Linked note", "--json"],
          options,
        )
      ).stdout,
    ) as NoteJson;
    const issue = JSON.parse(
      (
        await runCli(
          ["issue", "create", "--title", "Linked issue", "--json"],
          options,
        )
      ).stdout,
    ) as { id: string; identifier: string };

    const added = await runCli(
      ["link", "add", `note:${note.id}`, `issue:${issue.identifier}`, "--json"],
      options,
    );
    expect(added.code).toBe(0);
    expect(JSON.parse(added.stdout)).toEqual({ changed: true });

    const listed = await runCli(
      ["link", "list", `cocurdex://issue/${issue.id}`, "--json"],
      options,
    );
    expect(JSON.parse(listed.stdout)).toEqual([
      expect.objectContaining({
        relation: "related",
        kind: "note",
        id: note.id,
        title: "Linked note",
        uri: `cocurdex://note/${note.id}`,
        removable: true,
      }),
    ]);

    const selfLink = await runCli(
      ["link", "add", `note:${note.id}`, `note:${note.id}`],
      options,
    );
    expect(selfLink.code).toBe(1);

    const removed = await runCli(
      ["link", "remove", `issue:${issue.id}`, `note:${note.id}`, "--json"],
      options,
    );
    expect(JSON.parse(removed.stdout)).toEqual({ changed: true });
    const empty = await requestDaemon(
      "link.list",
      { ref: { kind: "note", id: note.id } },
      daemon.options,
    );
    expect(empty).toEqual([]);
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
    const userDataPath = tempDirs.createSync("cocurdex-e2e-autostart-");
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
      expect(await requestDaemonShutdown(metadata)).toBe(true);
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
