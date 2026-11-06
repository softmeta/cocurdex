import {
  isChatSession,
  isPersonalSession,
  type SessionRecord,
} from "@cocurdex/shared";
import { atom } from "jotai";
import {
  activeSessionIdAtom,
  selectSessionAtom,
  sessionsAtom,
} from "@/features/sessions";
import { selectWorkspaceAtom } from "@/features/workspaces";

/**
 * Which sidebar list is showing. The center panel reads it so its empty state
 * answers the tab the user is actually looking at: the workspaces tab must not
 * offer a chat composer.
 */
export type SidebarTab = "workspaces" | "chat" | "personal";

export const sidebarTabAtom = atom<SidebarTab>("workspaces");

export function sidebarTabOf(session: SessionRecord): SidebarTab {
  if (isChatSession(session)) return "chat";
  if (isPersonalSession(session)) return "personal";
  return "workspaces";
}

const lastSessionByTabAtom = atom<Partial<Record<SidebarTab, string>>>({});

export const switchSidebarTabAtom = atom(null, (get, set, next: SidebarTab) => {
  if (next === get(sidebarTabAtom)) return;
  const sessions = get(sessionsAtom);
  const activeId = get(activeSessionIdAtom);
  const active = sessions.find((session) => session.id === activeId);
  const remembered = active
    ? { ...get(lastSessionByTabAtom), [sidebarTabOf(active)]: active.id }
    : get(lastSessionByTabAtom);
  set(lastSessionByTabAtom, remembered);
  set(sidebarTabAtom, next);
  if (active && sidebarTabOf(active) === next) return;
  const restored = sessions.find(
    (session) =>
      session.id === remembered[next] &&
      !session.archivedAt &&
      sidebarTabOf(session) === next,
  );
  if (restored && next === "workspaces") {
    set(selectWorkspaceAtom, restored.workspaceId);
  }
  set(selectSessionAtom, restored?.id ?? null);
});
