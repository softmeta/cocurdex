import { posix } from "node:path";
import type { TableData, TextParagraph, TextRun } from "@cocurdex/shared";
import JSZip from "jszip";
import {
  child,
  childrenNamed,
  numberAttr,
  parseXml,
  path,
  type XmlNode,
} from "./ooxml";

export interface EmuFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PptxPlaceholder {
  type: string;
  idx: string | null;
}

export type PptxItem =
  | {
      kind: "text";
      placeholder: PptxPlaceholder | null;
      frame: EmuFrame | null;
      paragraphs: TextParagraph[];
    }
  | { kind: "table"; frame: EmuFrame | null; table: TableData }
  | { kind: "image"; frame: EmuFrame | null; mediaPath: string; alt: string };

export interface PptxLayout {
  type: string | null;
  name: string | null;
}

export interface PptxSlide {
  layout: PptxLayout;
  items: PptxItem[];
  notes: string;
  skippedShapes: number;
}

export interface PptxDocument {
  size: { cx: number; cy: number };
  title: string | null;
  slides: PptxSlide[];
  readMedia(mediaPath: string): Promise<Buffer | null>;
}

interface Relationship {
  type: string;
  target: string;
  external: boolean;
}

type Relationships = Map<string, Relationship>;

interface PlaceholderFrame extends PptxPlaceholder {
  frame: EmuFrame;
}

interface SlideContext {
  rels: Relationships;
  placeholders: PlaceholderFrame[];
  masterPlaceholders: PlaceholderFrame[];
}

type Transform = (frame: EmuFrame) => EmuFrame;

const DEFAULT_SIZE = { cx: 12_192_000, cy: 6_858_000 };
const MAX_LEVEL = 4;
const ALIGNMENTS: Record<string, TextParagraph["align"]> = {
  l: "left",
  ctr: "center",
  r: "right",
};
const BULLET_PLACEHOLDERS = new Set(["body", "obj"]);
const SKIPPED_PLACEHOLDERS = new Set(["dt", "ftr", "sldNum", "hdr"]);
const LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
const identity: Transform = (frame) => frame;

async function readPart(zip: JSZip, partPath: string) {
  const file = zip.file(partPath);
  return file ? parseXml(await file.async("string")) : null;
}

function relsPathOf(partPath: string) {
  return posix.join(
    posix.dirname(partPath),
    "_rels",
    `${posix.basename(partPath)}.rels`,
  );
}

async function readRels(zip: JSZip, partPath: string): Promise<Relationships> {
  const root = await readPart(zip, relsPathOf(partPath));
  const rels: Relationships = new Map();
  for (const rel of childrenNamed(root, "Relationship")) {
    const { Id: id, Type: type = "", Target: target = "" } = rel.attrs;
    if (!id) continue;
    const external = rel.attrs.TargetMode === "External";
    const resolved = external
      ? target
      : target.startsWith("/")
        ? target.slice(1)
        : posix.normalize(posix.join(posix.dirname(partPath), target));
    rels.set(id, { type, target: resolved, external });
  }
  return rels;
}

function relOfType(rels: Relationships, suffix: string) {
  return [...rels.values()].find((rel) => rel.type.endsWith(suffix)) ?? null;
}

function xfrmFrame(xfrm: XmlNode | null): EmuFrame | null {
  const off = child(xfrm, "a:off");
  const ext = child(xfrm, "a:ext");
  const x = numberAttr(off, "x");
  const y = numberAttr(off, "y");
  const w = numberAttr(ext, "cx");
  const h = numberAttr(ext, "cy");
  if (x === null || y === null || w === null || h === null) return null;
  return { x, y, w, h };
}

function groupTransform(group: XmlNode, outer: Transform): Transform {
  const xfrm = path(group, ["p:grpSpPr", "a:xfrm"]);
  const frame = xfrmFrame(xfrm);
  const chOff = child(xfrm, "a:chOff");
  const chExt = child(xfrm, "a:chExt");
  const cx = numberAttr(chOff, "x");
  const cy = numberAttr(chOff, "y");
  const cw = numberAttr(chExt, "cx");
  const ch = numberAttr(chExt, "cy");
  if (!frame || cx === null || cy === null || !cw || !ch) return outer;
  const sx = frame.w / cw;
  const sy = frame.h / ch;
  return (inner) =>
    outer({
      x: frame.x + (inner.x - cx) * sx,
      y: frame.y + (inner.y - cy) * sy,
      w: inner.w * sx,
      h: inner.h * sy,
    });
}

function placeholderOf(nvPr: XmlNode | null): PptxPlaceholder | null {
  const ph = child(nvPr, "p:ph");
  if (!ph) return null;
  return { type: ph.attrs.type ?? "obj", idx: ph.attrs.idx ?? null };
}

function masterType(type: string) {
  if (type === "ctrTitle") return "title";
  if (type === "subTitle" || type === "obj") return "body";
  return type;
}

function inheritedFrame(placeholder: PptxPlaceholder, context: SlideContext) {
  const byIdx = placeholder.idx
    ? context.placeholders.find((item) => item.idx === placeholder.idx)
    : undefined;
  const byType = context.placeholders.find(
    (item) => item.type === placeholder.type,
  );
  const fromMaster = context.masterPlaceholders.find(
    (item) => masterType(item.type) === masterType(placeholder.type),
  );
  return (byIdx ?? byType ?? fromMaster)?.frame ?? null;
}

function linkOf(rPr: XmlNode | null, rels: Relationships) {
  const id = child(rPr, "a:hlinkClick")?.attrs["r:id"];
  const target = id ? rels.get(id) : undefined;
  if (!target?.external) return undefined;
  try {
    return LINK_PROTOCOLS.has(new URL(target.target).protocol)
      ? target.target
      : undefined;
  } catch {
    return undefined;
  }
}

function isOn(value: string | undefined) {
  return value === "1" || value === "true";
}

function runOf(node: XmlNode, rels: Relationships): TextRun | null {
  const text = child(node, "a:t")?.text ?? "";
  if (!text) return null;
  const rPr = child(node, "a:rPr");
  const run: TextRun = { text };
  if (isOn(rPr?.attrs.b)) run.bold = true;
  if (isOn(rPr?.attrs.i)) run.italic = true;
  if (rPr?.attrs.u && rPr.attrs.u !== "none") run.underline = true;
  if (rPr?.attrs.strike && rPr.attrs.strike !== "noStrike") run.strike = true;
  const link = linkOf(rPr, rels);
  if (link) run.link = link;
  return run;
}

function listKind(pPr: XmlNode | null, defaultBullet: boolean) {
  if (child(pPr, "a:buNone")) return undefined;
  if (child(pPr, "a:buAutoNum")) return "number" as const;
  if (child(pPr, "a:buChar") || defaultBullet) return "bullet" as const;
  return undefined;
}

function paragraphsOf(
  txBody: XmlNode | null,
  defaultBullet: boolean,
  rels: Relationships,
): TextParagraph[] {
  const paragraphs: TextParagraph[] = [];
  for (const p of childrenNamed(txBody, "a:p")) {
    const pPr = child(p, "a:pPr");
    const level = Math.min(Math.max(numberAttr(pPr, "lvl") ?? 0, 0), MAX_LEVEL);
    const list = listKind(pPr, defaultBullet);
    const align = ALIGNMENTS[pPr?.attrs.algn ?? ""];
    const shape = {
      ...(list ? { list, level } : {}),
      ...(align ? { align } : {}),
    };
    let runs: TextRun[] = [];
    const flush = () => {
      if (runs.some((run) => run.text.trim()))
        paragraphs.push({ runs, ...shape });
      runs = [];
    };
    for (const node of p.children) {
      if (node.name === "a:br") flush();
      if (node.name !== "a:r" && node.name !== "a:fld") continue;
      const run = runOf(node, rels);
      if (run) runs.push(run);
    }
    flush();
  }
  return paragraphs;
}

function tableOf(tbl: XmlNode, rels: Relationships): TableData | null {
  const rows = childrenNamed(tbl, "a:tr").map((tr) =>
    childrenNamed(tr, "a:tc").map((tc) => ({
      paragraphs: paragraphsOf(child(tc, "a:txBody"), false, rels),
    })),
  );
  if (rows.length === 0 || rows.some((row) => row.length === 0)) return null;
  return {
    header: isOn(child(tbl, "a:tblPr")?.attrs.firstRow),
    rows,
  };
}

function shapeItem(
  sp: XmlNode,
  transform: Transform,
  context: SlideContext,
): PptxItem | null {
  const placeholder = placeholderOf(path(sp, ["p:nvSpPr", "p:nvPr"]));
  if (placeholder && SKIPPED_PLACEHOLDERS.has(placeholder.type)) return null;
  const paragraphs = paragraphsOf(
    child(sp, "p:txBody"),
    BULLET_PLACEHOLDERS.has(placeholder?.type ?? ""),
    context.rels,
  );
  if (paragraphs.length === 0) return null;
  const own = xfrmFrame(path(sp, ["p:spPr", "a:xfrm"]));
  const frame =
    own ?? (placeholder ? inheritedFrame(placeholder, context) : null);
  return {
    kind: "text",
    placeholder,
    frame: frame ? transform(frame) : null,
    paragraphs,
  };
}

function pictureItem(
  pic: XmlNode,
  transform: Transform,
  context: SlideContext,
): PptxItem | null {
  const embed = path(pic, ["p:blipFill", "a:blip"])?.attrs["r:embed"];
  const media = embed ? context.rels.get(embed) : undefined;
  if (!media || media.external) return null;
  const frame = xfrmFrame(path(pic, ["p:spPr", "a:xfrm"]));
  return {
    kind: "image",
    frame: frame ? transform(frame) : null,
    mediaPath: media.target,
    alt: path(pic, ["p:nvPicPr", "p:cNvPr"])?.attrs.descr ?? "",
  };
}

function graphicItem(
  frameNode: XmlNode,
  transform: Transform,
  context: SlideContext,
): PptxItem | null {
  const tbl = path(frameNode, ["a:graphic", "a:graphicData", "a:tbl"]);
  const table = tbl ? tableOf(tbl, context.rels) : null;
  if (!table) return null;
  const frame = xfrmFrame(child(frameNode, "p:xfrm"));
  return { kind: "table", frame: frame ? transform(frame) : null, table };
}

function collectItems(
  tree: XmlNode | null,
  transform: Transform,
  context: SlideContext,
  slide: PptxSlide,
) {
  for (const node of tree?.children ?? []) {
    let item: PptxItem | null = null;
    if (node.name === "p:grpSp") {
      collectItems(node, groupTransform(node, transform), context, slide);
      continue;
    }
    if (node.name === "p:sp") item = shapeItem(node, transform, context);
    else if (node.name === "p:pic")
      item = pictureItem(node, transform, context);
    else if (node.name === "p:graphicFrame") {
      item = graphicItem(node, transform, context);
    } else if (node.name.startsWith("p:nv") || node.name === "p:grpSpPr") {
      continue;
    }
    if (item) slide.items.push(item);
    else if (node.name !== "p:sp") slide.skippedShapes += 1;
  }
}

function placeholderFrames(root: XmlNode | null, rootName: string) {
  const tree =
    root?.name === rootName ? path(root, ["p:cSld", "p:spTree"]) : null;
  return childrenNamed(tree, "p:sp").flatMap((sp): PlaceholderFrame[] => {
    const placeholder = placeholderOf(path(sp, ["p:nvSpPr", "p:nvPr"]));
    const frame = xfrmFrame(path(sp, ["p:spPr", "a:xfrm"]));
    return placeholder && frame ? [{ ...placeholder, frame }] : [];
  });
}

async function readNotes(zip: JSZip, rels: Relationships) {
  const notesRel = relOfType(rels, "/notesSlide");
  if (!notesRel) return "";
  const root = await readPart(zip, notesRel.target);
  const tree = path(root, ["p:cSld", "p:spTree"]);
  const body = childrenNamed(tree, "p:sp").find(
    (sp) => placeholderOf(path(sp, ["p:nvSpPr", "p:nvPr"]))?.type === "body",
  );
  return paragraphsOf(child(body, "p:txBody"), false, rels)
    .map((paragraph) => paragraph.runs.map((run) => run.text).join(""))
    .join("\n");
}

async function readSlide(zip: JSZip, partPath: string): Promise<PptxSlide> {
  const rels = await readRels(zip, partPath);
  const layoutRel = relOfType(rels, "/slideLayout");
  const layoutRoot = layoutRel ? await readPart(zip, layoutRel.target) : null;
  const masterRel = layoutRel
    ? relOfType(await readRels(zip, layoutRel.target), "/slideMaster")
    : null;
  const masterRoot = masterRel ? await readPart(zip, masterRel.target) : null;
  const context: SlideContext = {
    rels,
    placeholders: placeholderFrames(layoutRoot, "p:sldLayout"),
    masterPlaceholders: placeholderFrames(masterRoot, "p:sldMaster"),
  };
  const root = await readPart(zip, partPath);
  const slide: PptxSlide = {
    layout: {
      type: layoutRoot?.attrs.type ?? null,
      name: child(layoutRoot, "p:cSld")?.attrs.name ?? null,
    },
    items: [],
    notes: "",
    skippedShapes: 0,
  };
  collectItems(path(root, ["p:cSld", "p:spTree"]), identity, context, slide);
  slide.notes = await readNotes(zip, rels);
  return slide;
}

async function readTitle(zip: JSZip) {
  const core = await readPart(zip, "docProps/core.xml");
  const title = child(core, "dc:title")?.text.trim();
  return title || null;
}

export async function readPptx(bytes: Buffer): Promise<PptxDocument> {
  const zip = await JSZip.loadAsync(bytes);
  const presentationPath = "ppt/presentation.xml";
  const presentation = await readPart(zip, presentationPath);
  if (presentation?.name !== "p:presentation")
    throw new Error("Not a PowerPoint (.pptx) file");
  const rels = await readRels(zip, presentationPath);
  const sldSz = child(presentation, "p:sldSz");
  const slideIds = childrenNamed(child(presentation, "p:sldIdLst"), "p:sldId");
  const slides: PptxSlide[] = [];
  for (const slideId of slideIds) {
    const rel = rels.get(slideId.attrs["r:id"] ?? "");
    if (rel) slides.push(await readSlide(zip, rel.target));
  }
  return {
    size: {
      cx: numberAttr(sldSz, "cx") ?? DEFAULT_SIZE.cx,
      cy: numberAttr(sldSz, "cy") ?? DEFAULT_SIZE.cy,
    },
    title: await readTitle(zip),
    slides,
    readMedia: async (mediaPath) =>
      (await zip.file(mediaPath)?.async("nodebuffer")) ?? null,
  };
}
