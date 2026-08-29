import { atom } from "jotai";

/**
 * Which sidebar list is showing. The center panel reads it so its empty state
 * answers the tab the user is actually looking at: the projects tab must not
 * offer a chat composer.
 */
export type SidebarTab = "projects" | "chat";

export const sidebarTabAtom = atom<SidebarTab>("projects");
