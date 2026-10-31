import { useAtom } from "jotai";
import { collapsedSessionGroupKeysAtom } from "@/features/sessions/session-list-view";

export type SidebarSection = "chat" | "chatPinned" | "pinned" | "sessions";

export function useSidebarSectionCollapse(section: SidebarSection) {
  const [collapsedKeys, setCollapsedKeys] = useAtom(
    collapsedSessionGroupKeysAtom,
  );
  const key = `section:${section}`;
  const collapsed = collapsedKeys.has(key);

  const toggle = () => {
    const next = new Set(collapsedKeys);
    if (!next.delete(key)) {
      next.add(key);
    }
    setCollapsedKeys(next);
  };

  return { collapsed, toggle };
}
