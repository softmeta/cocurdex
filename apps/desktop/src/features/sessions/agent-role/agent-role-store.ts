import type { AgentRoleRecord, SaveAgentRolePayload } from "@cocurdex/shared";
import { desktopApi } from "@/lib";

const listeners = new Set<() => void>();
let roles: AgentRoleRecord[] = [];
let loadPromise: Promise<void> | null = null;

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeAgentRoles(listener: () => void) {
  listeners.add(listener);
  void ensureAgentRolesLoaded();
  return () => {
    listeners.delete(listener);
  };
}

export function getAgentRoles() {
  return roles;
}

export function ensureAgentRolesLoaded() {
  if (!loadPromise) {
    loadPromise = desktopApi
      .listAgentRoles()
      .then((next) => {
        roles = next;
        notify();
      })
      .catch(() => {
        loadPromise = null;
      });
  }
  return loadPromise;
}

export async function saveAgentRoleRecord(payload: SaveAgentRolePayload) {
  await ensureAgentRolesLoaded();
  const saved = await desktopApi.saveAgentRole(payload);
  const index = roles.findIndex((role) => role.id === saved.id);
  roles =
    index >= 0
      ? roles.map((role) => (role.id === saved.id ? saved : role))
      : [saved, ...roles];
  notify();
  return saved;
}

export async function deleteAgentRoleRecord(id: string) {
  await ensureAgentRolesLoaded();
  await desktopApi.deleteAgentRole(id);
  roles = roles.filter((role) => role.id !== id);
  notify();
}
