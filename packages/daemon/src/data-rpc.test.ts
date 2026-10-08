import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  applyMarkdownToNoteDoc,
  decodeNoteDocBytes,
  encodeNoteDocBytes,
  noteDocStateVector,
} from "@cocurdex/note-doc";
import type { DaemonRequest } from "@cocurdex/rpc";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { handleDaemonRequest } from "./handler";
import { CocurdexDaemonService } from "./service";

describe("daemon data RPC", () => {
  it("owns note mutations and emits database change events", async () => {
    const service = new CocurdexDaemonService({
      runtimeFingerprint: "test-runtime",
      userDataPath: mkdtempSync(path.join(tmpdir(), "cocurdex-daemon-data-")),
    });
    const events: unknown[] = [];
    service.events.on("daemon.event", (event) => events.push(event));

    const createRequest = {
      id: "1",
      method: "note.create",
      params: { title: "Runtime owned" },
      token: "test",
    } satisfies DaemonRequest<"note.create">;
    const created = await handleDaemonRequest<"note.create">(
      service,
      createRequest,
    );
    const listRequest = {
      id: "2",
      method: "note.list",
      token: "test",
    } satisfies DaemonRequest<"note.list">;
    const listed = await handleDaemonRequest<"note.list">(service, listRequest);

    expect(listed).toEqual([
      expect.objectContaining({ id: created.id, title: "Runtime owned" }),
    ]);
    expect(events).toContainEqual({
      type: "data.changed",
      areas: ["notes"],
    });
  });

  it("syncs note docs over the wire and only signals real changes", async () => {
    const service = new CocurdexDaemonService({
      runtimeFingerprint: "test-runtime",
      userDataPath: mkdtempSync(path.join(tmpdir(), "cocurdex-daemon-doc-")),
    });
    const note = await handleDaemonRequest<"note.create">(service, {
      id: "1",
      method: "note.create",
      params: { title: "Live", bodyMarkdown: "Hello" },
      token: "test",
    });
    const snapshot = await handleDaemonRequest<"note.getDoc">(service, {
      id: "2",
      method: "note.getDoc",
      params: { id: note.id },
      token: "test",
    });
    const state = decodeNoteDocBytes(snapshot?.update ?? "");
    const update = Y.diffUpdate(
      applyMarkdownToNoteDoc(state, "Hello, editor").state,
      noteDocStateVector(state),
    );
    const events: unknown[] = [];
    service.events.on("daemon.event", (event) => events.push(event));

    for (const id of ["3", "4"]) {
      await handleDaemonRequest<"note.applyDocUpdate">(service, {
        id,
        method: "note.applyDocUpdate",
        params: { id: note.id, update: encodeNoteDocBytes(update) },
        token: "test",
      });
    }

    const saved = await handleDaemonRequest<"note.get">(service, {
      id: "5",
      method: "note.get",
      params: { id: note.id },
      token: "test",
    });
    expect(saved?.bodyMarkdown).toBe("Hello, editor");
    expect(events).toEqual([{ type: "data.changed", areas: ["notes"] }]);
  });

  it("serves issue detail by identifier and ignores unknown attached issues", async () => {
    const service = new CocurdexDaemonService({
      runtimeFingerprint: "test-runtime",
      userDataPath: mkdtempSync(path.join(tmpdir(), "cocurdex-daemon-issue-")),
    });
    const events: unknown[] = [];
    await handleDaemonRequest<"issue.create">(service, {
      id: "1",
      method: "issue.create",
      params: { viewId: "project", title: "Agent first" },
      token: "test",
    });
    service.events.on("daemon.event", (event) => events.push(event));

    const commented = await handleDaemonRequest<"issue.comment">(service, {
      id: "2",
      method: "issue.comment",
      params: { id: "COC-1", body: "Started", actor: { kind: "cli" } },
      token: "test",
    });
    await service.dataService.linkAttachedIssues("missing-session", [
      {
        kind: "context-item",
        itemKind: "issue",
        id: "missing-issue",
        title: "Gone",
        body: "",
      },
    ]);

    expect(commented.issue.identifier).toBe("COC-1");
    expect(commented.events.at(-1)).toMatchObject({
      kind: "commented",
      body: "Started",
      actor: { kind: "cli" },
    });
    expect(events).toEqual([{ type: "data.changed", areas: ["issues"] }]);
  });
});
