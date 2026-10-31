import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SAMPLE_PDF_PATH = fileURLToPath(
  new URL("./sample.pdf", import.meta.url),
);
export const SAMPLE_PDF_PAGES = 120;
export const SAMPLE_PDF_KEYWORD = "lighthouse";

const LINES_PER_PAGE = 44;
const WORDS = [
  "river",
  "stone",
  "harbor",
  "signal",
  "window",
  "garden",
  "thread",
  "copper",
  "meadow",
  "lantern",
  "orbit",
  "canvas",
  "pillar",
  "summit",
  "ember",
  "glacier",
];

function createRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

function pageLines(pageNumber, random) {
  const keywordLine = Math.floor(random() * (LINES_PER_PAGE - 2)) + 2;
  return Array.from({ length: LINES_PER_PAGE }, (_, index) => {
    if (index === 0) return `Sample page ${pageNumber}`;
    const words = Array.from(
      { length: 9 },
      () => WORDS[Math.floor(random() * WORDS.length)],
    );
    if (index === keywordLine) words[4] = SAMPLE_PDF_KEYWORD;
    return words.join(" ");
  });
}

function contentStream(lines) {
  const body = lines
    .map((line, index) => `${index === 0 ? "" : "T* "}(${line}) Tj`)
    .join("\n");
  return `BT\n/F1 11 Tf\n14 TL\n56 790 Td\n${body}\nET`;
}

export function buildSamplePdf() {
  const random = createRandom(20_261_012);
  const objects = [];
  const pageIds = [];
  const fontId = 3;
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[fontId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  for (let page = 1; page <= SAMPLE_PDF_PAGES; page += 1) {
    const pageId = objects.length;
    const contentId = pageId + 1;
    const stream = contentStream(pageLines(page, random));
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ` +
      `/Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] =
      `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\n` +
      `stream\n${stream}\nendstream`;
    pageIds.push(pageId);
  }
  objects[2] =
    `<< /Type /Pages /Count ${pageIds.length} ` +
    `/Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`;

  let output = "%PDF-1.7\n";
  const offsets = [];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(output, "latin1");
    output += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(output, "latin1");
  output += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) {
    output += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  output +=
    `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(output, "latin1");
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  writeFileSync(SAMPLE_PDF_PATH, buildSamplePdf());
}
