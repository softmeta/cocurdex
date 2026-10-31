import { randomBytes } from "node:crypto";
import { readdirSync, rmSync } from "node:fs";
import path from "node:path";

const PRE_MIGRATION_SNAPSHOT_PREFIX = ".pre-migration-";
const MAX_RETAINED_SNAPSHOTS = 3;
const SNAPSHOT_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const SNAPSHOT_TIMESTAMP =
  /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z(?:-|$)/;

export function snapshotSuffix(date = new Date()) {
  const timestamp = date.toISOString().replace(/[:.]/g, "-");
  return `${timestamp}-${randomBytes(3).toString("hex")}`;
}

export function preMigrationSnapshotPath(databasePath: string) {
  return `${databasePath}${PRE_MIGRATION_SNAPSHOT_PREFIX}${snapshotSuffix()}`;
}

function snapshotTakenAt(suffix: string): number | null {
  const match = SNAPSHOT_TIMESTAMP.exec(suffix);
  if (!match) {
    return null;
  }
  const [, day, hours, minutes, seconds, millis] = match;
  const takenAt = Date.parse(
    `${day}T${hours}:${minutes}:${seconds}.${millis}Z`,
  );
  return Number.isNaN(takenAt) ? null : takenAt;
}

export function selectExpiredSnapshots(
  fileNames: string[],
  databaseFileName: string,
  now: Date,
): string[] {
  const prefix = `${databaseFileName}${PRE_MIGRATION_SNAPSHOT_PREFIX}`;
  const newestFirst = fileNames
    .filter((name) => name.startsWith(prefix))
    .map((name) => ({
      name,
      takenAt: snapshotTakenAt(name.slice(prefix.length)),
    }))
    .sort(
      (left, right) =>
        (right.takenAt ?? Number.NEGATIVE_INFINITY) -
          (left.takenAt ?? Number.NEGATIVE_INFINITY) ||
        right.name.localeCompare(left.name),
    );
  return newestFirst
    .filter(({ takenAt }, index) => {
      if (index === 0 && takenAt !== null) {
        return false;
      }
      if (takenAt === null || index >= MAX_RETAINED_SNAPSHOTS) {
        return true;
      }
      return now.getTime() - takenAt > SNAPSHOT_RETENTION_MS;
    })
    .map(({ name }) => name);
}

export function prunePreMigrationSnapshots(
  databasePath: string,
  now = new Date(),
): void {
  const directory = path.dirname(databasePath);
  const expired = selectExpiredSnapshots(
    readdirSync(directory),
    path.basename(databasePath),
    now,
  );
  for (const name of expired) {
    rmSync(path.join(directory, name), { force: true });
  }
}
