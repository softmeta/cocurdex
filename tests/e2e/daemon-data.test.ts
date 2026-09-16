import { requestDaemon } from "@cocurdex/daemon/client";
import { DEFAULT_VIEW_ID } from "@cocurdex/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type DaemonProcess, spawnDaemon } from "./helpers/daemon-process";

describe("daemon data RPCs over the wire", () => {
  let daemon: DaemonProcess;

  beforeAll(async () => {
    daemon = await spawnDaemon();
  });

  afterAll(async () => {
    await daemon.dispose();
  });

  it("runs the note lifecycle including revision conflicts", async () => {
    const created = await requestDaemon(
      "note.create",
      { title: "Release checklist" },
      daemon.options,
    );
    expect(created.title).toBe("Release checklist");
    expect(created.revision).toBeGreaterThan(0);

    const updated = await requestDaemon(
      "note.update",
      {
        id: created.id,
        bodyMarkdown: "- [ ] smoke\n",
        expectedRevision: created.revision,
      },
      daemon.options,
    );
    expect(updated.bodyMarkdown).toBe("- [ ] smoke\n");

    await expect(
      requestDaemon(
        "note.update",
        { id: created.id, title: "stale", expectedRevision: created.revision },
        daemon.options,
      ),
    ).rejects.toMatchObject({ code: "REQUEST_FAILED" });

    const fetched = await requestDaemon(
      "note.get",
      { id: created.id },
      daemon.options,
    );
    expect(fetched).toMatchObject({
      id: created.id,
      title: "Release checklist",
    });

    const listed = await requestDaemon("note.list", daemon.options);
    expect(listed.map((note) => note.id)).toContain(created.id);

    await requestDaemon(
      "note.delete",
      { id: created.id, expectedRevision: updated.revision },
      daemon.options,
    );
    expect(
      await requestDaemon("note.get", { id: created.id }, daemon.options),
    ).toBeNull();
  });

  it("runs the issue lifecycle on the default view", async () => {
    const view = await requestDaemon(
      "issue.loadView",
      { viewId: DEFAULT_VIEW_ID },
      daemon.options,
    );
    expect(view?.columns.map((column) => column.id)).toContain("backlog");

    const issue = await requestDaemon(
      "issue.create",
      { viewId: DEFAULT_VIEW_ID, columnId: "backlog", title: "Ship e2e" },
      daemon.options,
    );
    expect(issue.columnId).toBe("backlog");

    const moved = await requestDaemon(
      "issue.move",
      {
        viewId: DEFAULT_VIEW_ID,
        id: issue.id,
        columnId: "done",
        sortOrder: issue.sortOrder,
        expectedRevision: issue.revision,
      },
      daemon.options,
    );
    expect(moved.columnId).toBe("done");

    const reloaded = await requestDaemon(
      "issue.loadView",
      { viewId: DEFAULT_VIEW_ID },
      daemon.options,
    );
    expect(
      reloaded?.issues.find((entry) => entry.id === issue.id)?.columnId,
    ).toBe("done");

    await requestDaemon(
      "issue.delete",
      { id: issue.id, expectedRevision: moved.revision },
      daemon.options,
    );
    expect(
      await requestDaemon(
        "issue.get",
        { id: issue.id, viewId: DEFAULT_VIEW_ID },
        daemon.options,
      ),
    ).toBeNull();
  });

  it("replays idempotent requests instead of duplicating writes", async () => {
    const options = { ...daemon.options, idempotencyKey: "e2e-note-1" };
    const first = await requestDaemon(
      "note.create",
      { title: "Idempotent" },
      options,
    );
    const second = await requestDaemon(
      "note.create",
      { title: "Idempotent" },
      options,
    );
    expect(second.id).toBe(first.id);

    const notes = await requestDaemon("note.list", daemon.options);
    expect(notes.filter((note) => note.title === "Idempotent")).toHaveLength(1);
  });
});
