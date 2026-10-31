import { createContext, use } from "react";

export type Surface = "page" | "sheet";

export const SurfaceContext = createContext<Surface>("page");

export function useSurface(): Surface {
  return use(SurfaceContext);
}
