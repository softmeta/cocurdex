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
