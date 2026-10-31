import { handleDaemonRequest } from "@cocurdex/daemon/internal/handler";
import { CocurdexDaemonService } from "@cocurdex/daemon/internal/service";
import {
  applyMarkdownToNoteDoc,
  decodeNoteDocBytes,
  encodeNoteDocBytes,
  noteDocStateVector,
} from "@cocurdex/note-doc";
import type { DaemonRequest } from "@cocurdex/rpc";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, describe, expect, it } from "vitest";
import * as Y from "yjs";

const tempDirs = createTempDirs();

afterAll(() => tempDirs.cleanup());

describe("daemon data RPC", () => {
  it("rejects malformed note payloads before touching storage", async () => {
    const service = new CocurdexDaemonService({
      runtimeFingerprint: "test-runtime",
      userDataPath: tempDirs.createSync("cocurdex-daemon-bad-"),
    });
    tempDirs.onCleanup(() => service.shutdown());
    const request = (params: unknown) =>
      handleDaemonRequest<"note.create">(service, {
        id: "1",
        method: "note.create",
        params: params as DaemonRequest<"note.create">["params"],
        token: "test",
      });

    await expect(request({ title: 7 })).rejects.toThrow(
      /Invalid note\.create payload/,
    );
    await expect(request({ parentId: "../escape" })).rejects.toThrow(
      /Invalid note\.create payload/,
    );
    await expect(
      handleDaemonRequest<"note.list">(service, {
        id: "2",
        method: "note.list",
        token: "test",
      }),
    ).resolves.toEqual([]);
  });

  it("owns note mutations and emits database change events", async () => {
    const service = new CocurdexDaemonService({
      runtimeFingerprint: "test-runtime",
      userDataPath: tempDirs.createSync("cocurdex-daemon-data-"),
    });
    tempDirs.onCleanup(() => service.shutdown());
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
      userDataPath: tempDirs.createSync("cocurdex-daemon-doc-"),
    });
    tempDirs.onCleanup(() => service.shutdown());
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
      userDataPath: tempDirs.createSync("cocurdex-daemon-issue-"),
    });
    tempDirs.onCleanup(() => service.shutdown());
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
