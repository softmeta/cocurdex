import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      radius: ["micro", "dense", "control", "card", "panel", "overlay"],
    },
    classGroups: {
      "font-size": [
        {
          text: [
            "2xs",
            "meta",
            "body",
            "display",
            "title",
            "avatar-emoji-sm",
            "avatar-emoji-md",
            "avatar-emoji-lg",
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
