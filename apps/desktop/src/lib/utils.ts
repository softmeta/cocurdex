import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Project-named font sizes live under `text-*` (text-body, text-meta, …) just
 * like colors (text-sidebar-fg-secondary). Default tailwind-merge treats any
 * unknown `text-*` as text-color, so `text-body` + `text-sidebar-fg-*` would
 * wipe each other. Register the named sizes as font-size so they coexist.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["2xs", "meta", "body", "display", "title"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
