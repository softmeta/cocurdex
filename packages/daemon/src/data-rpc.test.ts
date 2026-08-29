import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { DaemonRequest } from "@cocurdex/rpc";
import { describe, expect, it } from "vitest";
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
});
