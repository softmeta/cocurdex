import crypto from "node:crypto";
import type { EventEmitter } from "node:events";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DecksRepository } from "@cocurdex/db";
import { checkDeck, parseDeckContent } from "@cocurdex/deck";
import { applyDeckOps } from "@cocurdex/deck/edit";
import { compileDeckMarkdown } from "@cocurdex/deck/markdown";
import {
  canLoadPdfFont,
  exportDeckToPdf,
  type PdfFontSet,
} from "@cocurdex/deck/pdf";
import { exportDeckToPptx } from "@cocurdex/deck/pptx";
import { pptxOutline, pptxToDeck, readPptx } from "@cocurdex/deck/pptx-import";
import {
  type CheckDeckPayload,
  type CreateDeckDownloadPayload,
  type CreateDeckPayload,
  DAEMON_DECK_DOWNLOAD_HTTP_PATH,
  DAEMON_DECK_DOWNLOAD_TICKET_QUERY,
  DECK_CONTENT_VERSION,
  DEFAULT_SLIDE_SIZE,
  type DeckCompileWarning,
  type DeckContent,
  type DeckDownload,
  type DeckExportFormat,
  type DeckRecord,
  type DeckSource,
  type DeckWriteResult,
  type DeleteDeckPayload,
  deckImageHashes,
  type EditDeckPayload,
  type ExportDeckFilePayload,
  type ExportDeckFileResult,
  type GetDeckPayload,
  type ImportDeckImagePayload,
  type ImportDeckPayload,
  type PptxOutline,
  type ReadPptxPayload,
  type UpdateDeckPayload,
} from "@cocurdex/shared";
import type { DeckAssetStore } from "./deck-assets";
import { choosePdfFonts, pdfFontCandidates } from "./pdf-fonts";

const DOWNLOAD_TICKET_TTL_MS = 60_000;
const MAX_PPTX_BYTES = 200 * 1024 * 1024;
const UNTITLED_DECK = "Untitled deck";
const UNSAFE_FILE_NAME_CHARS = new Set('<>:"/\\|?*');
const FIRST_PRINTABLE_CODE = 0x20;

function isSafeFileNameChar(char: string) {
  return (
    !UNSAFE_FILE_NAME_CHARS.has(char) &&
    (char.codePointAt(0) ?? 0) >= FIRST_PRINTABLE_CODE
  );
}

export interface DeckFile {
  fileName: string;
  contentType: string;
  bytes: Buffer;
}

interface DownloadTicket {
  deckId: string;
  format: DeckExportFormat;
  expiresAt: number;
}

interface ResolvedSource {
  content: DeckContent;
  title: string | null;
  warnings: DeckCompileWarning[];
}

const FORMAT_CONTENT_TYPES: Record<DeckExportFormat, string> = {
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  pdf: "application/pdf",
};

export type PdfFontResolver = () => PdfFontSet | null;

export function systemPdfFonts(): PdfFontSet | null {
  return choosePdfFonts(
    pdfFontCandidates(process.platform, process.env),
    canLoadPdfFont,
  );
}

function emptyDeck(): DeckContent {
  return {
    version: DECK_CONTENT_VERSION,
    size: { ...DEFAULT_SLIDE_SIZE },
    theme: "default",
    slides: [],
  };
}

async function readPptxFile(filePath: string) {
  if (!path.isAbsolute(filePath)) {
    throw new Error("Presentation path must be absolute");
  }
  const info = await stat(filePath).catch(() => null);
  if (!info?.isFile()) throw new Error(`Presentation not found: ${filePath}`);
  if (info.size > MAX_PPTX_BYTES) {
    throw new Error("Presentation is larger than 200 MB");
  }
  return readPptx(await readFile(filePath));
}

function fileTitle(filePath: string) {
  return path.basename(filePath, path.extname(filePath)).trim();
}

function resolveSource(source: DeckSource): ResolvedSource | null {
  if (source.content !== undefined && source.markdown !== undefined) {
    throw new Error("Pass either deck content or Markdown, not both");
  }
  if (source.markdown !== undefined) {
    const compiled = compileDeckMarkdown(source.markdown);
    return { ...compiled, content: parseDeckContent(compiled.content) };
  }
  if (source.content !== undefined) {
    return {
      content: parseDeckContent(source.content),
      title: null,
      warnings: [],
    };
  }
  return null;
}

export function deckFileName(title: string, format: DeckExportFormat): string {
  const base = Array.from(title, (char) =>
    isSafeFileNameChar(char) ? char : " ",
  )
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  return `${(base || UNTITLED_DECK).slice(0, 120)}.${format}`;
}

export class DaemonDeckService {
  private readonly tickets = new Map<string, DownloadTicket>();
  private cachedPdfFonts: PdfFontSet | null = null;

  constructor(
    private readonly decks: DecksRepository,
    private readonly events: EventEmitter,
    readonly assets: DeckAssetStore,
    private readonly now: () => number = Date.now,
    private readonly resolvePdfFonts: PdfFontResolver = systemPdfFonts,
  ) {}

  list() {
    return this.decks.list();
  }

  get(payload: GetDeckPayload) {
    return this.decks.get(payload.id);
  }

  async create(payload: CreateDeckPayload): Promise<DeckWriteResult> {
    const source = resolveSource(payload);
    if (source) await this.requireNewImages(source.content, null);
    const deck = await this.decks.create({
      title: payload.title ?? source?.title ?? UNTITLED_DECK,
      workspaceId: payload.workspaceId ?? null,
      content: source?.content ?? emptyDeck(),
    });
    this.emitChanged();
    return this.writeResult(deck, source?.warnings ?? []);
  }

  async update(payload: UpdateDeckPayload): Promise<DeckWriteResult> {
    const source = resolveSource(payload);
    if (source) {
      const current = await this.require(payload.id);
      await this.requireNewImages(source.content, current.content);
    }
    const deck = await this.decks.update({
      id: payload.id,
      title: payload.title,
      workspaceId: payload.workspaceId,
      content: source?.content,
      expectedRevision: payload.expectedRevision,
    });
    this.emitChanged();
    return this.writeResult(deck, source?.warnings ?? []);
  }

  async edit(payload: EditDeckPayload): Promise<DeckWriteResult> {
    const current = await this.require(payload.id);
    const { content, warnings } = applyDeckOps(current.content, payload.ops);
    await this.requireNewImages(content, current.content);
    const deck = await this.decks.update({
      id: current.id,
      content,
      expectedRevision: payload.expectedRevision ?? current.revision,
    });
    this.emitChanged();
    return this.writeResult(deck, warnings);
  }

  importImage(payload: ImportDeckImagePayload) {
    return this.assets.importFile(payload.path);
  }

  async importPptx(payload: ImportDeckPayload): Promise<DeckWriteResult> {
    const document = await readPptxFile(payload.path);
    const imported = await pptxToDeck(document, (bytes) =>
      this.assets.putImage(bytes),
    );
    const deck = await this.decks.create({
      title:
        payload.title ??
        imported.title ??
        (fileTitle(payload.path) || UNTITLED_DECK),
      workspaceId: payload.workspaceId ?? null,
      content: imported.content,
    });
    this.emitChanged();
    return this.writeResult(deck, imported.warnings);
  }

  async readPptx(payload: ReadPptxPayload): Promise<PptxOutline> {
    return pptxOutline(await readPptxFile(payload.path));
  }

  async collectUnusedImages() {
    const keep = new Set<string>();
    for (const summary of await this.decks.list()) {
      const deck = await this.decks.get(summary.id);
      for (const hash of deck ? deckImageHashes(deck.content) : []) {
        keep.add(hash);
      }
    }
    return this.assets.collectUnused(keep);
  }

  async delete(payload: DeleteDeckPayload) {
    await this.decks.delete(payload);
    this.emitChanged();
  }

  async check(payload: CheckDeckPayload) {
    return checkDeck((await this.require(payload.id)).content);
  }

  async createDownload(
    payload: CreateDeckDownloadPayload,
  ): Promise<DeckDownload> {
    const deck = await this.require(payload.id);
    this.pruneTickets();
    const ticket = crypto.randomBytes(32).toString("base64url");
    const expiresAt = this.now() + DOWNLOAD_TICKET_TTL_MS;
    this.tickets.set(ticket, {
      deckId: deck.id,
      format: payload.format,
      expiresAt,
    });
    const query = new URLSearchParams({
      [DAEMON_DECK_DOWNLOAD_TICKET_QUERY]: ticket,
    });
    return {
      path: `${DAEMON_DECK_DOWNLOAD_HTTP_PATH}?${query.toString()}`,
      fileName: deckFileName(deck.title, payload.format),
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  async redeemDownload(ticket: string): Promise<DeckFile | null> {
    const entry = this.tickets.get(ticket);
    this.tickets.delete(ticket);
    if (!entry || entry.expiresAt < this.now()) return null;
    const deck = await this.decks.get(entry.deckId);
    return deck ? this.render(deck, entry.format) : null;
  }

  async exportFile(
    payload: ExportDeckFilePayload,
  ): Promise<ExportDeckFileResult> {
    if (!path.isAbsolute(payload.outputPath)) {
      throw new Error("Deck export path must be absolute");
    }
    const file = await this.render(
      await this.require(payload.id),
      payload.format,
    );
    const outputPath = path.resolve(payload.outputPath);
    await mkdir(path.dirname(outputPath), { recursive: true });
    const partialPath = `${outputPath}.${crypto.randomUUID()}.partial`;
    await writeFile(partialPath, file.bytes);
    await rename(partialPath, outputPath);
    return { outputPath, sizeBytes: file.bytes.byteLength };
  }

  private async render(
    deck: DeckRecord,
    format: DeckExportFormat,
  ): Promise<DeckFile> {
    const meta = { title: deck.title };
    const loadImage = (hash: string) => this.assets.load(hash);
    const bytes =
      format === "pdf"
        ? await exportDeckToPdf(deck.content, meta, this.pdfFonts(), loadImage)
        : await exportDeckToPptx(deck.content, meta, loadImage);
    return {
      fileName: deckFileName(deck.title, format),
      contentType: FORMAT_CONTENT_TYPES[format],
      bytes,
    };
  }

  private pdfFonts(): PdfFontSet {
    this.cachedPdfFonts ??= this.resolvePdfFonts();
    if (!this.cachedPdfFonts) {
      throw new Error(
        "PDF export needs a TrueType font; none of the known system fonts were found",
      );
    }
    return this.cachedPdfFonts;
  }

  private async requireNewImages(
    next: DeckContent,
    previous: DeckContent | null,
  ) {
    const known = new Set(previous ? deckImageHashes(previous) : []);
    await this.assets.requireAll(
      deckImageHashes(next).filter((hash) => !known.has(hash)),
    );
  }

  private async require(id: string) {
    const deck = await this.decks.get(id);
    if (!deck) throw new Error(`Deck not found: ${id}`);
    return deck;
  }

  private writeResult(
    deck: DeckRecord,
    warnings: DeckCompileWarning[],
  ): DeckWriteResult {
    return { deck, warnings, issues: checkDeck(deck.content) };
  }

  private pruneTickets() {
    const now = this.now();
    for (const [ticket, entry] of this.tickets) {
      if (entry.expiresAt < now) this.tickets.delete(ticket);
    }
  }

  private emitChanged() {
    this.events.emit("daemon.event", {
      type: "data.changed",
      areas: ["decks"],
    });
  }
}
