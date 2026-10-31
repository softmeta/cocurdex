import { createFileTreeIconResolver } from "@pierre/trees";

// Match the tree's configuration (see `features/editor/file-tree.tsx`).
const ICON_SET = { set: "complete", colored: true } as const;

const { resolveIcon } = createFileTreeIconResolver(ICON_SET);

const FILE_ICON_HUE_COLORS = {
  blue: "light-dark(#1a85d4, #69b1ff)",
  cyan: "light-dark(#1ca1c7, #68cdf2)",
  gray: "light-dark(#84848a, #adadb1)",
  green: "light-dark(#199f43, #5ecc71)",
  indigo: "light-dark(#693acf, #9d6afb)",
  mauve: "light-dark(#594c5b, #79697b)",
  orange: "light-dark(#d47628, #ffa359)",
  pink: "light-dark(#d32a61, #ff678d)",
  purple: "light-dark(#a631be, #d568ea)",
  red: "light-dark(#d52c36, #ff6762)",
  teal: "light-dark(#17a5af, #64d1db)",
  vermilion: "light-dark(#ff8c5b, #d5512f)",
  yellow: "light-dark(#d5a910, #ffd452)",
} as const;

type FileIconHue = keyof typeof FILE_ICON_HUE_COLORS;

const FILE_ICON_TOKEN_HUES: Readonly<Record<string, FileIconHue>> = {
  astro: "purple",
  babel: "yellow",
  bash: "green",
  biome: "blue",
  bootstrap: "indigo",
  browserslist: "yellow",
  bun: "mauve",
  c: "blue",
  claude: "orange",
  cpp: "blue",
  css: "indigo",
  database: "purple",
  default: "gray",
  docker: "blue",
  eslint: "indigo",
  git: "vermilion",
  go: "cyan",
  graphql: "pink",
  html: "orange",
  image: "pink",
  javascript: "yellow",
  json: "orange",
  markdown: "green",
  mcp: "teal",
  npm: "red",
  oxc: "cyan",
  postcss: "red",
  prettier: "teal",
  python: "blue",
  react: "cyan",
  ruby: "red",
  rust: "orange",
  sass: "pink",
  svelte: "red",
  svg: "orange",
  svgo: "green",
  swift: "orange",
  table: "teal",
  tailwind: "cyan",
  terraform: "indigo",
  text: "gray",
  typescript: "blue",
  vite: "purple",
  vscode: "blue",
  vue: "green",
  wasm: "indigo",
  webpack: "blue",
  yml: "red",
  zig: "orange",
  zip: "orange",
};

function fileIconColor(token: string | undefined): string | undefined {
  const hue = token ? FILE_ICON_TOKEN_HUES[token] : undefined;
  if (!hue) return undefined;
  return `var(--trees-file-icon-color-${token}, var(--trees-file-icon-color, ${FILE_ICON_HUE_COLORS[hue]}))`;
}

// Pierre only performs per-file brand resolution when handed this internal slot
// name as the first argument; any other value resolves a fixed tree glyph
// (chevron, dot, lock). Keep in sync with `@pierre/trees`.
const FILE_ICON_SLOT = "file-tree-icon-file";

export interface FileTypeIconAttributes {
  // Sprite `<symbol>` id to reference via `<use>` (see `FileTypeIconSprite`).
  symbolId: string;
  // CSS color for the glyph's `currentColor` fills; undefined leaves it
  // inheriting the surrounding text color.
  color?: string;
}

export function getFileTypeIconAttributes(
  filePath: string,
): FileTypeIconAttributes {
  const resolved = resolveIcon(FILE_ICON_SLOT, filePath);
  return {
    symbolId: resolved.name,
    color: fileIconColor(resolved.token),
  };
}

/**
 * Imperative HTML-string variant — used for contenteditable mention pills that
 * are built with `document.createElement` rather than through React. Returns a
 * single inline `<svg>` referencing the shared sprite (files) or a Lucide
 * outline (folders). Relies on `FileTypeIconSprite` being mounted in the
 * document so the file `<use href="#…">` resolves.
 */
export function renderFileTypeIconHtml(
  path: string,
  options: { isFolder?: boolean; expanded?: boolean } = {},
): string {
  const { isFolder = false, expanded = false } = options;

  // `display:inline-block` overrides Tailwind preflight's `svg { display:block }`
  // — otherwise the glyph breaks mention pills onto a new line.
  // `vertical-align` keeps it on the text baseline.
  const inlineStyle = "display:inline-block;vertical-align:-0.125em";

  if (isFolder) {
    // Lucide's `folder` / `folder-open` outline paths, kept verbatim so the
    // imperative branch matches the React `<Folder />` rendering.
    const d = expanded
      ? '<path d="M6 14 2.973 7.151a.512.512 0 0 1 .473-.717h17.557a.512.512 0 0 1 .472.71L18.483 14"/><path d="M2 14h20"/><path d="M5.045 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-1.999"/>'
      : '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="${inlineStyle}">${d}</svg>`;
  }

  const { symbolId, color } = getFileTypeIconAttributes(path);
  // `color` is a library-provided CSS value (a `var()`/`light-dark()` literal)
  // and `symbolId` is a fixed sprite id — neither is user-controlled, so
  // inlining without escaping is safe.
  const style = color ? `${inlineStyle};color:${color}` : inlineStyle;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" aria-hidden="true" viewBox="0 0 16 16" style="${style}"><use href="#${symbolId}"></use></svg>`;
}
