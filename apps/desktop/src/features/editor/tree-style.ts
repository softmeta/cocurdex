import type { CSSProperties } from "react";

// Shared styling for `@pierre/trees` hosts in the editor feature (workspace
// explorer + git-changes tree). The library renders inside a shadow root, so
// theming is driven by `--trees-*` custom properties and an injected
// `unsafeCSS` block for the virtualized scrollbar.

type TreeStyle = CSSProperties & Record<`--${string}`, string | number>;

// Map Pierre's tokens onto the editor palette and tighten the default density
// so tree rows match the surrounding panels.
export const TREE_STYLE: TreeStyle = {
  // Inherit the host panel background instead of forcing a distinct surface,
  // so the tree blends with the surrounding container.
  "--trees-bg-override": "transparent",
  "--trees-bg-muted-override": "var(--editor-tab-hover-bg)",
  "--trees-border-color-override": "var(--editor-border)",
  "--trees-fg-muted-override": "var(--editor-text-muted)",
  "--trees-fg-override": "var(--editor-text)",
  // Remove the keyboard focus ring around the focused row; the background
  // highlight alone marks the active item, matching the borderless treatment.
  "--trees-focus-ring-color-override": "transparent",
  "--trees-focus-ring-width-override": "0px",
  "--trees-indent-guide-bg-override": "transparent",
  // Match FileTypeIcon / chrome glyphs at size-3.5 (14px); Pierre's default
  // is 16px which reads heavy next to 13px row labels.
  "--trees-icon-width-override": "14px",
  "--trees-item-padding-x-override": "2px",
  "--trees-item-row-gap-override": "2px",
  "--trees-level-gap-override": "2px",
  "--trees-padding-inline-override": "4px",
  "--trees-scrollbar-gutter-override": "6px",
  // Selected row reuses the hover background so selection and hover read as one
  // quiet treatment instead of two competing highlights.
  "--trees-selected-bg-override": "var(--editor-tab-hover-bg)",
  // Drop the focused-selection outline; the background alone marks the selected
  // row, matching the editor's borderless selection treatment.
  "--trees-selected-focused-border-color-override": "transparent",
  "--trees-selected-fg-override": "var(--editor-text)",
  // Built-in git status lane colors (explorer + git-changes tree). Map onto the
  // same editor tokens used by the git panel so badges stay theme-consistent.
  "--trees-status-added-override": "var(--editor-git-added)",
  "--trees-status-deleted-override": "var(--editor-git-deleted)",
  "--trees-status-ignored-override": "var(--editor-text-muted)",
  "--trees-status-modified-override": "var(--editor-git-modified)",
  "--trees-status-renamed-override": "var(--editor-git-modified)",
  "--trees-status-untracked-override": "var(--editor-git-added)",
  "--trees-git-added-color-override": "var(--editor-git-added)",
  "--trees-git-deleted-color-override": "var(--editor-git-deleted)",
  "--trees-git-ignored-color-override": "var(--editor-text-muted)",
  "--trees-git-modified-color-override": "var(--editor-git-modified)",
  "--trees-git-renamed-color-override": "var(--editor-git-modified)",
  "--trees-git-untracked-color-override": "var(--editor-git-added)",
  fontFamily: "var(--font-ui)",
  // Tracks Appearance → UI font size (never a fixed px).
  fontSize: "var(--app-ui-font-size)",
  height: "100%",
};

// Workspace explorer only: the host panel supplies horizontal inset (ps-2 pe-2)
// for search, the synthetic root row, and Pierre rows together. Zero Pierre list
// insets / item margins so root hover and file-row hover share the same edges.
// Keep scrollbar-gutter token at 6px for thumb drawing; INTERACTIVE_SCROLLBAR_CSS
// uses `scrollbar-gutter: auto` so layout does not reserve a stable column that
// would shrink only Pierre rows and break edge alignment with the root chip.
export const FILE_TREE_STYLE: TreeStyle = {
  ...TREE_STYLE,
  "--trees-item-margin-x-override": "0px",
  "--trees-padding-inline-override": "0px",
};

// Lucide Folder / FolderOpen paths as CSS masks so Pierre directory rows match
// the app's expand affordance (folder glyph instead of a rotating chevron).
// Paths stay in sync with lucide-react's `folder` / `folder-open` icons.
const LUCIDE_FOLDER_MASK =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>',
  );
const LUCIDE_FOLDER_OPEN_MASK =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/></svg>',
  );

// Directory rows: replace the rotating chevron with Folder (collapsed) /
// FolderOpen (expanded). Injected via unsafeCSS so it wins over Pierre base.
export const DIRECTORY_FOLDER_ICON_CSS = `
  [data-item-type='folder'] > [data-item-section='icon'] > [data-icon-name='file-tree-icon-chevron'] {
    /* Kill chevron rotate/nudge transforms so the folder glyph stays upright. */
    transform: none !important;
    color: var(--trees-fg-muted);
    background-color: currentColor;
    -webkit-mask-image: url("${LUCIDE_FOLDER_MASK}");
    -webkit-mask-size: contain;
    -webkit-mask-repeat: no-repeat;
    -webkit-mask-position: center;
    mask-image: url("${LUCIDE_FOLDER_MASK}");
    mask-size: contain;
    mask-repeat: no-repeat;
    mask-position: center;
  }

  [data-item-type='folder'] > [data-item-section='icon'] > [data-icon-name='file-tree-icon-chevron'] > * {
    display: none !important;
  }

  [aria-expanded='true'][data-item-type='folder']
    > [data-item-section='icon']
    > [data-icon-name='file-tree-icon-chevron'] {
    -webkit-mask-image: url("${LUCIDE_FOLDER_OPEN_MASK}");
    mask-image: url("${LUCIDE_FOLDER_OPEN_MASK}");
  }
`;

// Reveal the virtualized scrollbar only while the host is hovered / focused /
// scrolling, matching the editor's quiet-by-default scrollbar treatment.
export const INTERACTIVE_SCROLLBAR_CSS = `
  [data-file-tree-virtualized-scroll='true'] {
    overflow-y: scroll;
    /* Overlay-style: do not reserve a stable gutter that would misalign row
       hover chips with siblings outside the shadow tree (e.g. the workspace root). */
    scrollbar-gutter: auto;
    scrollbar-color: transparent transparent;
    scrollbar-width: thin;
  }

  [data-file-tree-virtualized-scroll='true']::-webkit-scrollbar {
    width: var(--trees-scrollbar-gutter) !important;
    max-width: var(--trees-scrollbar-gutter) !important;
  }

  [data-file-tree-virtualized-scroll='true']::-webkit-scrollbar-track {
    background: transparent !important;
  }

  [data-file-tree-virtualized-scroll='true']::-webkit-scrollbar-thumb {
    background-clip: padding-box !important;
    background-color: transparent !important;
    border: 0 !important;
    border-radius: calc(var(--trees-scrollbar-gutter) / 2) !important;
  }

  :host(:hover) [data-file-tree-virtualized-scroll='true'],
  :host(:focus-within) [data-file-tree-virtualized-scroll='true'],
  :host(:active) [data-file-tree-virtualized-scroll='true'] {
    scrollbar-color: var(--trees-scrollbar-thumb) transparent;
  }

  :host([data-scrollbar-visible='true']) [data-file-tree-virtualized-scroll='true'] {
    scrollbar-color: var(--trees-scrollbar-thumb) transparent;
  }

  :host(:hover) [data-file-tree-virtualized-scroll='true']::-webkit-scrollbar-thumb,
  :host(:focus-within) [data-file-tree-virtualized-scroll='true']::-webkit-scrollbar-thumb,
  :host(:active) [data-file-tree-virtualized-scroll='true']::-webkit-scrollbar-thumb,
  :host([data-scrollbar-visible='true'])
    [data-file-tree-virtualized-scroll='true']::-webkit-scrollbar-thumb,
  [data-file-tree-virtualized-root='true'][data-is-scrolling]
    [data-file-tree-virtualized-scroll='true']::-webkit-scrollbar-thumb {
    background-color: var(--trees-scrollbar-thumb) !important;
  }
`;

// Shared unsafeCSS for every Pierre tree host in the editor feature.
export const TREES_UNSAFE_CSS = `${INTERACTIVE_SCROLLBAR_CSS}
${DIRECTORY_FOLDER_ICON_CSS}`;
