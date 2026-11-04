import { atom } from "jotai";
import type { AppScreen, SettingsSectionId } from "./app-shell-types";

export const appScreenAtom = atom<AppScreen>("app");
export const settingsSectionAtom = atom<SettingsSectionId>("general");
