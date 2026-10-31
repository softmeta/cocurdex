export const DECK_CONTENT_VERSION = 1;
export const DEFAULT_SLIDE_SIZE = { width: 1280, height: 720 } as const;

export const DECK_CONFLICT_MESSAGE = "Deck was modified";

export function isDeckConflictError(error: unknown): boolean {
  return (
    error instanceof Error && error.message.includes(DECK_CONFLICT_MESSAGE)
  );
}

export const DECK_THEME_IDS = [
  "default",
  "midnight",
  "sand",
  "forest",
  "tech",
  "editorial",
  "academic",
  "pop",
  "boardroom",
  "nebula",
  "ember",
  "swiss",
  "playful",
  "noir",
  "botanical",
  "blueprint",
  "zen",
  "retro",
  "terminal",
  "bauhaus",
  "clinic",
] as const;
export type DeckThemeId = (typeof DECK_THEME_IDS)[number];

export const DECK_COLORS = [
  "text",
  "muted",
  "accent",
  "page",
  "surface",
  "onAccent",
] as const;
export type DeckColor = (typeof DECK_COLORS)[number];

export const SLIDE_LAYOUT_IDS = [
  "cover",
  "section",
  "title-content",
  "two-content",
  "title-only",
  "closing",
  "blank",
] as const;
export type SlideLayoutId = (typeof SLIDE_LAYOUT_IDS)[number];

export const SLIDE_SLOT_IDS = [
  "title",
  "subtitle",
  "body",
  "left",
  "right",
] as const;
export type SlideSlotId = (typeof SLIDE_SLOT_IDS)[number];

export interface SlideFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  link?: string;
  color?: DeckColor;
}

export interface TextParagraph {
  runs: TextRun[];
  list?: "bullet" | "number";
  level?: number;
  align?: "left" | "center" | "right";
}

export interface TableCell {
  paragraphs: TextParagraph[];
}

export interface TableData {
  header: boolean;
  rows: TableCell[][];
}

export type SlotContent =
  | { kind: "text"; paragraphs: TextParagraph[] }
  | { kind: "table"; table: TableData };

export type TextRole = "title" | "subtitle" | "body" | "caption";

export interface FreeTextElement {
  id: string;
  kind: "text";
  frame: SlideFrame;
  role: TextRole;
  paragraphs: TextParagraph[];
}

export interface FreeShapeElement {
  id: string;
  kind: "shape";
  frame: SlideFrame;
  shape: "rect" | "ellipse";
  fill: DeckColor;
}

export interface FreeTableElement {
  id: string;
  kind: "table";
  frame: SlideFrame;
  table: TableData;
}

export const DECK_IMAGE_MIME_TYPES = ["image/png", "image/jpeg"] as const;
export type DeckImageMimeType = (typeof DECK_IMAGE_MIME_TYPES)[number];

export interface DeckImage {
  hash: string;
  mimeType: DeckImageMimeType;
  width: number;
  height: number;
}

export interface FreeImageElement {
  id: string;
  kind: "image";
  frame: SlideFrame;
  image: DeckImage;
  alt?: string;
}

export type FreeElement =
  | FreeTextElement
  | FreeShapeElement
  | FreeTableElement
  | FreeImageElement;

export interface Slide {
  id: string;
  layout: SlideLayoutId;
  slots: Partial<Record<SlideSlotId, SlotContent>>;
  slotFrames?: Partial<Record<SlideSlotId, SlideFrame>>;
  elements: FreeElement[];
  notes: string;
}

export interface DeckContent {
  version: typeof DECK_CONTENT_VERSION;
  size: { width: number; height: number };
  theme: DeckThemeId;
  slides: Slide[];
}

export interface DeckSummary {
  id: string;
  workspaceId: string | null;
  title: string;
  slideCount: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface DeckRecord extends DeckSummary {
  content: DeckContent;
}

export interface DeckSource {
  content?: DeckContent;
  markdown?: string;
}

export interface CreateDeckPayload extends DeckSource {
  title?: string;
  workspaceId?: string | null;
}

export interface UpdateDeckPayload extends DeckSource {
  id: string;
  title?: string;
  workspaceId?: string | null;
  expectedRevision?: number;
}

export interface GetDeckPayload {
  id: string;
}

export interface DeleteDeckPayload {
  id: string;
  expectedRevision?: number;
}

export type DeckIssueKind = "overflow" | "empty-slide" | "unknown-slot";

export interface DeckIssue {
  slideId: string;
  slideIndex: number;
  kind: DeckIssueKind;
  target: string;
  message: string;
}

export interface DeckCompileWarning {
  slideIndex: number;
  message: string;
}

export interface DeckWriteResult {
  deck: DeckRecord;
  warnings: DeckCompileWarning[];
  issues: DeckIssue[];
}

export type DeckTextTarget = `slot:${SlideSlotId}` | `element:${string}`;

export type DeckTextSource =
  | { paragraphs: TextParagraph[]; markdown?: never }
  | { markdown: string; paragraphs?: never };

export type DeckOp =
  | { op: "addSlide"; layout: SlideLayoutId; index?: number }
  | { op: "insertSlides"; markdown: string; index?: number }
  | { op: "duplicateSlide"; slideId: string }
  | { op: "deleteSlide"; slideId: string }
  | { op: "moveSlide"; slideId: string; index: number }
  | { op: "setLayout"; slideId: string; layout: SlideLayoutId }
  | ({
      op: "setText";
      slideId: string;
      target: DeckTextTarget;
    } & DeckTextSource)
  | { op: "setNotes"; slideId: string; notes: string }
  | {
      op: "addImage";
      slideId: string;
      image: DeckImage;
      frame?: SlideFrame;
      alt?: string;
    }
  | { op: "setImage"; slideId: string; elementId: string; image: DeckImage }
  | { op: "deleteElement"; slideId: string; elementId: string }
  | { op: "setTheme"; theme: DeckThemeId };

export interface EditDeckPayload {
  id: string;
  ops: DeckOp[];
  expectedRevision?: number;
}

export interface CheckDeckPayload {
  id: string;
}

export const DECK_EXPORT_FORMATS = ["pptx", "pdf"] as const;

export type DeckExportFormat = (typeof DECK_EXPORT_FORMATS)[number];

export interface CreateDeckDownloadPayload {
  id: string;
  format: DeckExportFormat;
}

export interface DeckDownload {
  path: string;
  fileName: string;
  expiresAt: string;
}

export interface ExportDeckFilePayload {
  id: string;
  format: DeckExportFormat;
  outputPath: string;
}

export interface ExportDeckFileResult {
  outputPath: string;
  sizeBytes: number;
}

export interface ImportDeckImagePayload {
  path: string;
}

export interface ImportDeckPayload {
  path: string;
  title?: string;
  workspaceId?: string | null;
}

export interface ReadPptxPayload {
  path: string;
}

export interface PptxSlideText {
  index: number;
  title: string;
  text: string[];
  notes: string;
}

export interface PptxOutline {
  title: string | null;
  slides: PptxSlideText[];
  markdown: string;
}

export const DAEMON_DECK_ASSET_HTTP_PATH = "/decks/assets";
export const DAEMON_DECK_ASSET_HASH_QUERY = "hash";

export function buildDaemonDeckAssetUrl(webSocketUrl: string, hash: string) {
  const url = new URL(DAEMON_DECK_ASSET_HTTP_PATH, webSocketUrl);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  url.searchParams.set(DAEMON_DECK_ASSET_HASH_QUERY, hash);
  return url.toString();
}

export function deckImageHashes(content: DeckContent): string[] {
  return content.slides.flatMap((slide) =>
    slide.elements.flatMap((element) =>
      element.kind === "image" ? [element.image.hash] : [],
    ),
  );
}

export const DAEMON_DECK_DOWNLOAD_HTTP_PATH = "/decks/download";
export const DAEMON_DECK_DOWNLOAD_TICKET_QUERY = "ticket";

export function buildDaemonDeckDownloadUrl(
  webSocketUrl: string,
  download: DeckDownload,
) {
  const url = new URL(download.path, webSocketUrl);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  return url.toString();
}
