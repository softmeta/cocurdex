import { FollowUpService } from "@cocurdex/daemon/internal/personal/follow-up-service";
import type { FollowUpRepository } from "@cocurdex/db";
import type { FollowUpRecord } from "@cocurdex/shared";
import { afterEach, expect, it, vi } from "vitest";

function memoryRepository(rows: FollowUpRecord[]): FollowUpRepository {
  const pending = () =>
    rows
      .filter((row) => row.status === "pending")
      .sort((left, right) => left.dueAt.localeCompare(right.dueAt));
  const update = (id: string, patch: Partial<FollowUpRecord>) => {
    const index = rows.findIndex(
      (row) => row.id === id && row.status === "pending",
    );
    if (index < 0) return false;
    rows[index] = { ...rows[index], ...patch };
    return true;
  };
  return {
    listByAgent: (agentId) => rows.filter((row) => row.agentId === agentId),
    listPending: pending,
    getById: (id) => rows.find((row) => row.id === id) ?? null,
    insert: (row) => void rows.push(row),
    markFired: (id, firedAt) => update(id, { status: "fired", firedAt }),
    cancel: (id, canceledAt) => update(id, { status: "canceled", canceledAt }),
    deleteByAgent: () => {},
  };
}

function followUp(id: string, dueAt: string): FollowUpRecord {
  return {
    id,
    agentId: "persona-1",
    dueAt,
    note: id,
    status: "pending",
    createdAt: "2026-11-15T00:00:00.000Z",
    firedAt: null,
    canceledAt: null,
  };
}

let service: FollowUpService | null = null;

afterEach(async () => {
  await service?.stop();
  vi.useRealTimers();
});

it("delivers follow-ups that came due while the daemon was down once, and retries a failed delivery", async () => {
  vi.useFakeTimers({ now: new Date("2026-11-15T10:00:00.000Z") });
  const rows = [
    followUp("missed", "2026-11-15T08:00:00.000Z"),
    followUp("flaky", "2026-11-15T09:00:00.000Z"),
    followUp("later", "2026-11-15T12:00:00.000Z"),
  ];
  const delivered: string[] = [];
  let flakyFailures = 1;
  service = new FollowUpService({
    repository: memoryRepository(rows),
    personaExists: () => true,
    deliver: async (row) => {
      if (row.id === "flaky" && flakyFailures-- > 0) {
        throw new Error("session busy");
      }
      delivered.push(row.id);
    },
    announceChanged: () => {},
  });

  service.start();
  await vi.advanceTimersByTimeAsync(0);
  expect(delivered).toEqual(["missed"]);
  expect(rows.find((row) => row.id === "flaky")?.status).toBe("pending");

  await vi.advanceTimersByTimeAsync(60_000);
  expect(delivered).toEqual(["missed", "flaky"]);

  await vi.advanceTimersByTimeAsync(2 * 60 * 60_000);
  expect(delivered).toEqual(["missed", "flaky", "later"]);
  expect(rows.map((row) => row.status)).toEqual(["fired", "fired", "fired"]);
});
