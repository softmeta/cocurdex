import type { CSSProperties } from "react";

type TreeStyle = CSSProperties & Record<`--${string}`, string | number>;

export const TREE_STYLE: TreeStyle = {
  "--trees-bg-override": "transparent",
  "--trees-bg-muted-override": "var(--editor-tab-hover-bg)",
  "--trees-border-color-override": "var(--editor-border)",
  "--trees-fg-muted-override": "var(--editor-text-muted)",
  "--trees-fg-override": "var(--editor-text)",
  "--trees-focus-ring-color-override": "transparent",
  "--trees-focus-ring-width-override": "0px",
  "--trees-indent-guide-bg-override": "transparent",
  "--trees-icon-width-override": "14px",
  "--trees-item-padding-x-override": "2px",
  "--trees-item-row-gap-override": "2px",
  "--trees-level-gap-override": "2px",
  "--trees-padding-inline-override": "4px",
  "--trees-scrollbar-gutter-override": "6px",
  "--trees-selected-bg-override": "var(--editor-tab-hover-bg)",
  "--trees-selected-focused-border-color-override": "transparent",
  "--trees-selected-fg-override": "var(--editor-text)",
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
  fontSize: "var(--app-ui-font-size)",
  height: "100%",
};

export const FILE_TREE_STYLE: TreeStyle = {
  ...TREE_STYLE,
  "--trees-item-margin-x-override": "0px",
  "--trees-padding-inline-override": "10px",
};

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

export const TREES_UNSAFE_CSS = `${INTERACTIVE_SCROLLBAR_CSS}
${DIRECTORY_FOLDER_ICON_CSS}`;
