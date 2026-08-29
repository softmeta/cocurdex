import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { isSendShortcut, type SendShortcut } from "./send-shortcut-types";

export const SEND_SHORTCUT_STORAGE_KEY = "agents.desktop.send-shortcut";

const storedSendShortcutAtom = atomWithStorage<unknown>(
  SEND_SHORTCUT_STORAGE_KEY,
  "enter",
);

export const sendShortcutAtom = atom(
  (get): SendShortcut => {
    const stored = get(storedSendShortcutAtom);
    return isSendShortcut(stored) ? stored : "enter";
  },
  (_get, set, shortcut: SendShortcut) => {
    set(storedSendShortcutAtom, shortcut);
  },
);
