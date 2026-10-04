import { atom } from "jotai";

/**
 * Which sidebar list is showing. The center panel reads it so its empty state
 * answers the tab the user is actually looking at: the workspaces tab must not
 * offer a chat composer.
 */
export type SidebarTab = "workspaces" | "chat";

export const sidebarTabAtom = atom<SidebarTab>("workspaces");
