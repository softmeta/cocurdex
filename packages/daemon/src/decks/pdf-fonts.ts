import path from "node:path";
import type { PdfFontSet, PdfFontSource } from "@cocurdex/deck/pdf";

export interface PdfFontCandidates {
  regular: PdfFontSource[];
  bold: PdfFontSource[];
  mono: PdfFontSource[];
  serif: PdfFontSource[];
  serifBold: PdfFontSource[];
}

type FontEnv = Partial<Record<"WINDIR" | "SystemRoot", string>>;

const MAC_FONTS = "/System/Library/Fonts";
const MAC_SUPPLEMENTAL = "/System/Library/Fonts/Supplemental";
const LINUX_CJK_DIRS = [
  "/usr/share/fonts/opentype/noto",
  "/usr/share/fonts/noto-cjk",
  "/usr/share/fonts/google-noto-cjk",
  "/usr/share/fonts/google-noto-sans-cjk-fonts",
];
const LINUX_DEJAVU_DIRS = [
  "/usr/share/fonts/truetype/dejavu",
  "/usr/share/fonts/dejavu",
  "/usr/share/fonts/TTF",
  "/usr/share/fonts/dejavu-sans-fonts",
  "/usr/share/fonts/dejavu-sans-mono-fonts",
  "/usr/share/fonts/dejavu-serif-fonts",
];
const LINUX_LIBERATION_DIRS = [
  "/usr/share/fonts/truetype/liberation",
  "/usr/share/fonts/liberation",
  "/usr/share/fonts/liberation-sans",
  "/usr/share/fonts/liberation-mono",
  "/usr/share/fonts/liberation-serif",
];

function inDirs(dirs: string[], file: string, face?: string): PdfFontSource[] {
  return dirs.map((dir) => ({ path: path.posix.join(dir, file), face }));
}

function macCandidates(): PdfFontCandidates {
  const hiragino = path.posix.join(MAC_FONTS, "Hiragino Sans GB.ttc");
  return {
    regular: [
      { path: hiragino, face: "HiraginoSansGB-W3" },
      { path: path.posix.join(MAC_SUPPLEMENTAL, "Arial Unicode.ttf") },
      { path: path.posix.join(MAC_SUPPLEMENTAL, "Arial.ttf") },
    ],
    bold: [
      { path: hiragino, face: "HiraginoSansGB-W6" },
      { path: path.posix.join(MAC_SUPPLEMENTAL, "Arial Bold.ttf") },
    ],
    mono: [
      { path: path.posix.join(MAC_FONTS, "Menlo.ttc"), face: "Menlo-Regular" },
      { path: path.posix.join(MAC_SUPPLEMENTAL, "Courier New.ttf") },
    ],
    serif: [
      { path: path.posix.join(MAC_SUPPLEMENTAL, "Georgia.ttf") },
      { path: path.posix.join(MAC_SUPPLEMENTAL, "Times New Roman.ttf") },
    ],
    serifBold: [
      { path: path.posix.join(MAC_SUPPLEMENTAL, "Georgia Bold.ttf") },
      { path: path.posix.join(MAC_SUPPLEMENTAL, "Times New Roman Bold.ttf") },
    ],
  };
}

function windowsCandidates(env: FontEnv): PdfFontCandidates {
  const fonts = path.win32.join(
    env.WINDIR ?? env.SystemRoot ?? "C:\\Windows",
    "Fonts",
  );
  const at = (file: string, face?: string) => ({
    path: path.win32.join(fonts, file),
    face,
  });
  return {
    regular: [
      at("msyh.ttc", "MicrosoftYaHei"),
      at("simsun.ttc", "SimSun"),
      at("arial.ttf"),
    ],
    bold: [at("msyhbd.ttc", "MicrosoftYaHei-Bold"), at("arialbd.ttf")],
    mono: [at("consola.ttf"), at("cour.ttf")],
    serif: [at("georgia.ttf"), at("times.ttf")],
    serifBold: [at("georgiab.ttf"), at("timesbd.ttf")],
  };
}

function linuxCandidates(): PdfFontCandidates {
  return {
    regular: [
      ...inDirs(
        LINUX_CJK_DIRS,
        "NotoSansCJK-Regular.ttc",
        "NotoSansCJKsc-Regular",
      ),
      ...inDirs(LINUX_DEJAVU_DIRS, "DejaVuSans.ttf"),
      ...inDirs(LINUX_LIBERATION_DIRS, "LiberationSans-Regular.ttf"),
    ],
    bold: [
      ...inDirs(LINUX_CJK_DIRS, "NotoSansCJK-Bold.ttc", "NotoSansCJKsc-Bold"),
      ...inDirs(LINUX_DEJAVU_DIRS, "DejaVuSans-Bold.ttf"),
      ...inDirs(LINUX_LIBERATION_DIRS, "LiberationSans-Bold.ttf"),
    ],
    mono: [
      ...inDirs(LINUX_DEJAVU_DIRS, "DejaVuSansMono.ttf"),
      ...inDirs(LINUX_LIBERATION_DIRS, "LiberationMono-Regular.ttf"),
    ],
    serif: [
      ...inDirs(LINUX_DEJAVU_DIRS, "DejaVuSerif.ttf"),
      ...inDirs(LINUX_LIBERATION_DIRS, "LiberationSerif-Regular.ttf"),
    ],
    serifBold: [
      ...inDirs(LINUX_DEJAVU_DIRS, "DejaVuSerif-Bold.ttf"),
      ...inDirs(LINUX_LIBERATION_DIRS, "LiberationSerif-Bold.ttf"),
    ],
  };
}

export function pdfFontCandidates(
  platform: NodeJS.Platform,
  env: FontEnv,
): PdfFontCandidates {
  if (platform === "darwin") return macCandidates();
  if (platform === "win32") return windowsCandidates(env);
  return linuxCandidates();
}

export function choosePdfFonts(
  candidates: PdfFontCandidates,
  usable: (source: PdfFontSource) => boolean,
): PdfFontSet | null {
  const regular = candidates.regular.find(usable);
  if (!regular) return null;
  const bold = candidates.bold.find(usable);
  const mono = candidates.mono.find(usable);
  const serif = candidates.serif.find(usable);
  const serifBold = serif ? candidates.serifBold.find(usable) : undefined;
  return {
    regular,
    ...(bold ? { bold } : {}),
    ...(mono ? { mono } : {}),
    ...(serif ? { serif } : {}),
    ...(serifBold ? { serifBold } : {}),
  };
}
