import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { requestDaemon, subscribeDaemonEvents } from "@cocurdex/daemon/client";
import type { CocurdexDaemonEvent } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { spawnDaemon, waitFor } from "./helpers/daemon-process";

describe("daemon event subscriptions", () => {
  it("streams data.changed events with sequence metadata", async () => {
    const daemon = await spawnDaemon();
    try {
      const events: { event: CocurdexDaemonEvent; seq: number | null }[] = [];
      const subscription = await subscribeDaemonEvents(
        (event, meta) => events.push({ event, seq: meta.seq }),
        daemon.options,
      );
      expect(subscription.epoch).toBe(daemon.metadata.startedAt);
      expect(subscription.replayGap).toBe(false);

      await requestDaemon("note.create", { title: "eventful" }, daemon.options);
      await waitFor(() => events.length > 0);

      expect(events[0]?.event).toEqual({
        type: "data.changed",
        areas: ["notes"],
      });
      expect(events[0]?.seq).toBeGreaterThan(0);
      subscription.close();
    } finally {
      await daemon.dispose();
    }
  });

  it("replays journaled events to a late subscriber", async () => {
    const daemon = await spawnDaemon();
    try {
      await requestDaemon(
        "note.create",
        { title: "before subscribe" },
        daemon.options,
      );

      const events: CocurdexDaemonEvent[] = [];
      const subscription = await subscribeDaemonEvents(
        (event) => events.push(event),
        { ...daemon.options, afterSeq: 0 },
      );
      expect(subscription.replayGap).toBe(false);
      expect(events).toContainEqual({
        type: "data.changed",
        areas: ["notes"],
      });
      subscription.close();
    } finally {
      await daemon.dispose();
    }
  });

  it("flags replayGap when resuming across a daemon restart", async () => {
    const userDataPath = mkdtempSync(
      path.join(tmpdir(), "cocurdex-e2e-epoch-"),
    );
    const first = await spawnDaemon({ userDataPath });
    const initial = await subscribeDaemonEvents(() => {}, {
      ...first.options,
      afterSeq: 0,
    });
    const epoch = initial.epoch;
    const lastSeq = initial.lastSeq;
    initial.close();
    expect(await first.stop()).toBe(0);

    const second = await spawnDaemon({ userDataPath });
    try {
      const resumed = await subscribeDaemonEvents(() => {}, {
        ...second.options,
        afterSeq: lastSeq ?? 0,
        epoch: epoch ?? undefined,
      });
      expect(resumed.epoch).toBe(second.metadata.startedAt);
      expect(resumed.replayGap).toBe(true);
      resumed.close();
    } finally {
      await second.dispose();
    }
  });
});
