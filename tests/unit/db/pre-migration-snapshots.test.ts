import { selectExpiredSnapshots } from "@cocurdex/db/internal/pre-migration-snapshots";
import { describe, expect, it } from "vitest";

const database = "cocurdex.sqlite";
const now = new Date("2026-10-20T12:00:00.000Z");

function snapshot(isoTime: string, id = "a1b2c3") {
  return `${database}.pre-migration-${isoTime.replace(/[:.]/g, "-")}-${id}`;
}

describe("selectExpiredSnapshots", () => {
  it("keeps the newest snapshot no matter how old it is", () => {
    const newest = snapshot("2026-01-01T00:00:00.000Z");

    expect(selectExpiredSnapshots([newest], database, now)).toEqual([]);
  });

  it("expires older snapshots after fourteen days", () => {
    const newest = snapshot("2026-10-19T00:00:00.000Z");
    const recent = snapshot("2026-10-10T00:00:00.000Z");
    const old = snapshot("2026-10-01T00:00:00.000Z");

    expect(
      selectExpiredSnapshots([old, newest, recent], database, now),
    ).toEqual([old]);
  });

  it("keeps at most three snapshots even when all are recent", () => {
    const names = [
      snapshot("2026-10-20T01:00:00.000Z"),
      snapshot("2026-10-20T02:00:00.000Z"),
      snapshot("2026-10-20T03:00:00.000Z"),
      snapshot("2026-10-20T04:00:00.000Z"),
    ];

    expect(selectExpiredSnapshots(names, database, now)).toEqual([names[0]]);
  });

  it("ignores unrelated files and expires unreadable snapshot names", () => {
    const newest = snapshot("2026-10-19T00:00:00.000Z");
    const unreadable = `${database}.pre-migration-garbage`;

    expect(
      selectExpiredSnapshots(
        [
          newest,
          unreadable,
          `${database}-wal`,
          `${database}.bak-2026-01-01T00-00-00-000Z-abcdef`,
          "other.sqlite.pre-migration-2026-01-01T00-00-00-000Z-abcdef",
        ],
        database,
        now,
      ),
    ).toEqual([unreadable]);
  });
});
