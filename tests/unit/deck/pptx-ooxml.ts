import JSZip from "jszip";

const P_NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

export function xfrm(x: number, y: number, w: number, h: number) {
  return `<a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>`;
}

export function groupXfrm(
  outer: [number, number, number, number],
  child: [number, number, number, number],
) {
  const [x, y, w, h] = outer;
  const [cx, cy, cw, ch] = child;
  return `<a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/><a:chOff x="${cx}" y="${cy}"/><a:chExt cx="${cw}" cy="${ch}"/></a:xfrm>`;
}

export function placeholderShape(
  type: string,
  idx: string | null,
  body: string,
  frame = "",
) {
  const idxAttr = idx ? ` idx="${idx}"` : "";
  return `<p:sp><p:nvSpPr><p:cNvPr id="2" name="${type}"/><p:cNvSpPr/><p:nvPr><p:ph type="${type}"${idxAttr}/></p:nvPr></p:nvSpPr><p:spPr>${frame}</p:spPr><p:txBody><a:bodyPr/>${body}</p:txBody></p:sp>`;
}

export function textBox(frame: string, body: string) {
  return `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Box"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${frame}</p:spPr><p:txBody><a:bodyPr/>${body}</p:txBody></p:sp>`;
}

export function picture(rId: string, frame: string, alt: string) {
  return `<p:pic><p:nvPicPr><p:cNvPr id="4" name="Picture" descr="${alt}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rId}"/></p:blipFill><p:spPr>${frame}</p:spPr></p:pic>`;
}

export function group(outer: string, children: string) {
  return `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="5" name="Group"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr>${outer}</p:grpSpPr>${children}</p:grpSp>`;
}

export function paragraph(text: string, pPr = "", rPr = "") {
  return `<a:p>${pPr}<a:r>${rPr || "<a:rPr/>"}<a:t>${text}</a:t></a:r></a:p>`;
}

function spTree(rootName: string, shapes: string) {
  return `<?xml version="1.0" encoding="UTF-8"?><${rootName} ${P_NS}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${shapes}</p:spTree></p:cSld></${rootName}>`;
}

function rels(entries: { id: string; type: string; target: string }[]) {
  const items = entries
    .map(
      (entry) =>
        `<Relationship Id="${entry.id}" Type="${REL}/${entry.type}" Target="${entry.target}"/>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items}</Relationships>`;
}

export interface FixtureSlide {
  shapes: string;
  notes?: string;
  media?: { id: string; name: string; bytes: Buffer }[];
}

export interface FixtureOptions {
  size: { cx: number; cy: number };
  title?: string;
  masterShapes: string;
  layoutShapes: string;
  slides: FixtureSlide[];
}

export async function buildPptx(options: FixtureOptions): Promise<Buffer> {
  const zip = new JSZip();
  const slideIds = options.slides
    .map((_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 1}"/>`)
    .join("");
  zip.file(
    "ppt/presentation.xml",
    `<?xml version="1.0" encoding="UTF-8"?><p:presentation ${P_NS}><p:sldIdLst>${slideIds}</p:sldIdLst><p:sldSz cx="${options.size.cx}" cy="${options.size.cy}"/></p:presentation>`,
  );
  zip.file(
    "ppt/_rels/presentation.xml.rels",
    rels(
      options.slides.map((_, index) => ({
        id: `rId${index + 1}`,
        type: "slide",
        target: `slides/slide${index + 1}.xml`,
      })),
    ),
  );
  zip.file(
    "ppt/slideMasters/slideMaster1.xml",
    spTree("p:sldMaster", options.masterShapes),
  );
  zip.file(
    "ppt/slideLayouts/slideLayout1.xml",
    spTree("p:sldLayout", options.layoutShapes),
  );
  zip.file(
    "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
    rels([
      {
        id: "rId1",
        type: "slideMaster",
        target: "../slideMasters/slideMaster1.xml",
      },
    ]),
  );
  for (const [index, slide] of options.slides.entries()) {
    const number = index + 1;
    const slideRels = [
      {
        id: "rLayout",
        type: "slideLayout",
        target: "../slideLayouts/slideLayout1.xml",
      },
    ];
    for (const media of slide.media ?? []) {
      zip.file(`ppt/media/${media.name}`, media.bytes);
      slideRels.push({
        id: media.id,
        type: "image",
        target: `../media/${media.name}`,
      });
    }
    if (slide.notes !== undefined) {
      zip.file(
        `ppt/notesSlides/notesSlide${number}.xml`,
        spTree(
          "p:notes",
          placeholderShape("body", "1", paragraph(slide.notes)),
        ),
      );
      slideRels.push({
        id: "rNotes",
        type: "notesSlide",
        target: `../notesSlides/notesSlide${number}.xml`,
      });
    }
    zip.file(`ppt/slides/slide${number}.xml`, spTree("p:sld", slide.shapes));
    zip.file(`ppt/slides/_rels/slide${number}.xml.rels`, rels(slideRels));
  }
  if (options.title) {
    zip.file(
      "docProps/core.xml",
      `<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${options.title}</dc:title></cp:coreProperties>`,
    );
  }
  return zip.generateAsync({ type: "nodebuffer" });
}
