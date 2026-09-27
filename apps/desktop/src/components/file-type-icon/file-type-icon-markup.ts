import {
  createFileTreeIconResolver,
  getBuiltInFileIconColor,
} from "@pierre/trees";

// Match the tree's configuration (see `features/editor/file-tree.tsx`).
const ICON_SET = { set: "complete", colored: true } as const;

const { resolveIcon } = createFileTreeIconResolver(ICON_SET);

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
    color: resolved.token ? getBuiltInFileIconColor(resolved.token) : undefined,
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
