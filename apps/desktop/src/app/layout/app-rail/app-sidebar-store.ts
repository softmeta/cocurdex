import { atom, useAtomValue, useSetAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import type { AppView } from "../right-panel-tab-sets";

const appSidebarCollapsedAtom = atomWithStorage<
  Partial<Record<AppView, boolean>>
>("cocurdex.app-rail.sidebar-collapsed", {}, undefined, { getOnInit: true });

export const toggleAppSidebarAtom = atom(null, (get, set, app: AppView) => {
  const collapsed = get(appSidebarCollapsedAtom);
  set(appSidebarCollapsedAtom, { ...collapsed, [app]: !collapsed[app] });
});

export function useAppSidebarCollapsed(app: AppView | null): boolean {
  const collapsed = useAtomValue(appSidebarCollapsedAtom);
  return app ? (collapsed[app] ?? false) : false;
}

export function useToggleAppSidebar(): (app: AppView) => void {
  return useSetAtom(toggleAppSidebarAtom);
}
