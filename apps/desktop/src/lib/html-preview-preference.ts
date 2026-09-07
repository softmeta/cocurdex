import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

export type HtmlPreviewLocation = "chat" | "browser";

const storedLocationAtom = atomWithStorage<HtmlPreviewLocation>(
  "agents.desktop.html-preview-location",
  "chat",
  undefined,
  { getOnInit: true },
);

export const htmlPreviewLocationAtom = atom(
  (get) => (get(storedLocationAtom) === "browser" ? "browser" : "chat"),
  (_get, set, location: HtmlPreviewLocation) =>
    set(storedLocationAtom, location),
);
