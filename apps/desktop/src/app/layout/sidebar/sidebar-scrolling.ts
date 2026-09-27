import { createContext, useContext } from "react";

export const SidebarScrollingContext = createContext(false);

export function useSidebarScrolling() {
  return useContext(SidebarScrollingContext);
}
