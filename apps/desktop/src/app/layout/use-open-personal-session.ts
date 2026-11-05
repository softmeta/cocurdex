import { useSetAtom } from "jotai";
import { startTransition } from "react";
import { selectSessionAtom } from "@/features/sessions";
import { sidebarTabAtom } from "./sidebar/sidebar-tab-store";

export function useOpenPersonalSession() {
  const selectSession = useSetAtom(selectSessionAtom);
  const setSidebarTab = useSetAtom(sidebarTabAtom);
  return (sessionId: string) => {
    startTransition(() => {
      setSidebarTab("personal");
      selectSession(sessionId);
    });
  };
}
