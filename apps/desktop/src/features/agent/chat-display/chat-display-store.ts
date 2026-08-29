import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

import {
  type ChatDisplaySettings,
  defaultChatDisplaySettings,
  normalizeChatDisplaySettings,
} from "./chat-display-types";

export const CHAT_DISPLAY_SETTINGS_STORAGE_KEY =
  "agents.desktop.chat-display-settings";

const storedChatDisplaySettingsAtom = atomWithStorage<
  Partial<ChatDisplaySettings>
>(CHAT_DISPLAY_SETTINGS_STORAGE_KEY, defaultChatDisplaySettings);

// Reads always resolve through normalization so consumers never see partial or
// invalid payloads; writes persist the full normalized object.
export const chatDisplaySettingsAtom = atom(
  (get) => normalizeChatDisplaySettings(get(storedChatDisplaySettingsAtom)),
  (_get, set, next: ChatDisplaySettings) => {
    set(storedChatDisplaySettingsAtom, normalizeChatDisplaySettings(next));
  },
);
