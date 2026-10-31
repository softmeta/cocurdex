import { createContext, type ReactNode, use } from "react";

export interface OptionSheetRoute {
  pathname: string;
  params?: Record<string, string>;
  depth: number;
}

const ROOT_ROUTE: OptionSheetRoute = { pathname: "/options/[id]", depth: 0 };

const OptionSheetRouteContext = createContext<OptionSheetRoute>(ROOT_ROUTE);

export function OptionSheetRouteProvider({
  pathname,
  params,
  children,
}: {
  pathname: string;
  params?: Record<string, string>;
  children: ReactNode;
}) {
  return (
    <OptionSheetRouteContext value={{ pathname, params, depth: 0 }}>
      {children}
    </OptionSheetRouteContext>
  );
}

export function useOptionSheetRoute() {
  return use(OptionSheetRouteContext);
}
