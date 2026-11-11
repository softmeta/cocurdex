export type RightPanelView =
  | "overview"
  | "editor"
  | "notes"
  | "decks"
  | "issues"
  | "memory"
  | "routines"
  | "git"
  | "browser"
  | "pdf"
  | "terminal";

export type RightPanelMode = "work" | "chat" | "personal";

interface RightPanelTabSet {
  primary: readonly RightPanelView[];
  overflow: readonly RightPanelView[];
  revealOnly: readonly RightPanelView[];
  fallback: RightPanelView;
  reorderable: boolean;
}

const TAB_SETS: Record<RightPanelMode, RightPanelTabSet> = {
  work: {
    primary: [
      "editor",
      "git",
      "terminal",
      "issues",
      "notes",
      "browser",
      "decks",
    ],
    overflow: ["memory", "routines"],
    revealOnly: [],
    fallback: "editor",
    reorderable: true,
  },
  chat: {
    primary: ["notes", "memory", "browser"],
    overflow: ["issues"],
    revealOnly: ["editor"],
    fallback: "notes",
    reorderable: true,
  },
  personal: {
    primary: ["overview", "memory", "notes", "issues", "routines"],
    overflow: ["editor", "browser", "decks"],
    revealOnly: [],
    fallback: "overview",
    reorderable: false,
  },
};

export function rightPanelTabSet(mode: RightPanelMode): RightPanelTabSet {
  return TAB_SETS[mode];
}

export function isRightPanelViewInMode(
  view: RightPanelView,
  mode: RightPanelMode,
) {
  const set = TAB_SETS[mode];
  return (
    view === "pdf" ||
    set.primary.includes(view) ||
    set.overflow.includes(view) ||
    set.revealOnly.includes(view)
  );
}
