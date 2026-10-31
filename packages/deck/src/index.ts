export { checkDeck } from "./check";
export { type LayoutSpec, SLIDE_LAYOUTS, type SlotSpec } from "./layouts";
export { listMarkers } from "./list-markers";
export {
  containFrame,
  formatCounter,
  type ResolvedImage,
  type ResolvedItem,
  type ResolvedPattern,
  type ResolvedShape,
  type ResolvedSlide,
  type ResolvedSource,
  type ResolvedTable,
  type ResolvedText,
  resolveEmptySlots,
  resolveSlide,
} from "./resolve";
export {
  deckContentSchema,
  deckOpSchema,
  deckOpsSchema,
  parseDeckContent,
} from "./schema";
export {
  LIST_INDENT_EM,
  PARAGRAPH_GAP_EM,
  paragraphIndentEm,
  TABLE_CELL_PADDING,
  TEXT_INSET,
} from "./text-fit";
export {
  type DeckFont,
  type DeckGradient,
  type DeckPaint,
  type DeckPaintColor,
  type DeckTheme,
  type DecorationSpec,
  isGradient,
  paintHex,
} from "./theme";
export { DECK_THEMES, deckTheme } from "./themes";
