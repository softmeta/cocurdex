import { createContext, useContext } from "react";

export const TabBarInsetContext = createContext(0);

export function useTabBarInset() {
  return useContext(TabBarInsetContext);
}
