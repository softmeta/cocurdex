import type {
  AgentEvent,
  AgentPermissionRequestRecord,
} from "@cocurdex/shared";
import { atom } from "jotai";

type PermissionsBySession = Record<string, AgentPermissionRequestRecord[]>;

function upsertPermission(
  permissions: AgentPermissionRequestRecord[],
  nextPermission: AgentPermissionRequestRecord,
) {
  const index = permissions.findIndex(
    (permission) => permission.id === nextPermission.id,
  );

  if (index === -1) {
    return [...permissions, nextPermission];
  }

  return permissions.map((permission, permissionIndex) =>
    permissionIndex === index ? nextPermission : permission,
  );
}

export const permissionsBySessionAtom = atom<PermissionsBySession>({});

export const clearPermissionsForSessionAtom = atom(
  null,
  (get, set, sessionId: string) => {
    const current = get(permissionsBySessionAtom);
    const { [sessionId]: _removed, ...next } = current;

    set(permissionsBySessionAtom, next);
  },
);

// Reconciles with the daemon's authoritative pending list after an event
// replay gap: pending records are upserted, locally-pending records the
// daemon no longer holds were resolved during the gap and are dropped, and
// resolved records are preserved for transcript history.
export const hydratePendingPermissionsAtom = atom(
  null,
  (get, set, pending: AgentPermissionRequestRecord[]) => {
    const pendingIds = new Set(pending.map((record) => record.id));
    const next: PermissionsBySession = {};
    for (const [sessionId, records] of Object.entries(
      get(permissionsBySessionAtom),
    )) {
      const kept = records.filter(
        (record) => record.status !== "pending" || pendingIds.has(record.id),
      );
      if (kept.length > 0) {
        next[sessionId] = kept;
      }
    }
    for (const record of pending) {
      next[record.sessionId] = upsertPermission(
        next[record.sessionId] ?? [],
        record,
      );
    }
    set(permissionsBySessionAtom, next);
  },
);

export const applyPermissionEventAtom = atom(
  null,
  (get, set, event: AgentEvent) => {
    if (
      event.type !== "permission.requested" &&
      event.type !== "permission.resolved"
    ) {
      return;
    }

    const permissionsBySession = get(permissionsBySessionAtom);
    const sessionPermissions = permissionsBySession[event.sessionId] ?? [];

    set(permissionsBySessionAtom, {
      ...permissionsBySession,
      [event.sessionId]: upsertPermission(sessionPermissions, event.request),
    });
  },
);
