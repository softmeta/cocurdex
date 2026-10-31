import type { DeckThemeId } from "@cocurdex/shared";
import type { DeckTheme } from "../theme";
import { BAUHAUS_THEME } from "./bauhaus";
import { BLUEPRINT_THEME } from "./blueprint";
import { BOARDROOM_THEME, POP_THEME } from "./bold";
import { BOTANICAL_THEME } from "./botanical";
import { CLASSIC_THEMES } from "./classic";
import { CLINIC_THEME } from "./clinic";
import { ACADEMIC_THEME, EDITORIAL_THEME } from "./editorial";
import { EMBER_THEME, NEBULA_THEME } from "./gradient";
import { TECH_THEME } from "./minimal";
import { NOIR_THEME } from "./noir";
import { PLAYFUL_THEME } from "./playful";
import { RETRO_THEME } from "./retro";
import { SWISS_THEME } from "./swiss";
import { TERMINAL_THEME } from "./terminal";
import { ZEN_THEME } from "./zen";

export const DECK_THEMES: Record<DeckThemeId, DeckTheme> = {
  ...CLASSIC_THEMES,
  tech: TECH_THEME,
  editorial: EDITORIAL_THEME,
  academic: ACADEMIC_THEME,
  pop: POP_THEME,
  boardroom: BOARDROOM_THEME,
  nebula: NEBULA_THEME,
  ember: EMBER_THEME,
  swiss: SWISS_THEME,
  playful: PLAYFUL_THEME,
  noir: NOIR_THEME,
  botanical: BOTANICAL_THEME,
  blueprint: BLUEPRINT_THEME,
  zen: ZEN_THEME,
  retro: RETRO_THEME,
  terminal: TERMINAL_THEME,
  bauhaus: BAUHAUS_THEME,
  clinic: CLINIC_THEME,
};

export function deckTheme(themeId: DeckThemeId): DeckTheme {
  return DECK_THEMES[themeId];
}
