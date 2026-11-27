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

export type RightPanelMode = "work" | "chat" | "personal" | "app";

export const APP_VIEWS = [
  "issues",
  "notes",
  "decks",
  "routines",
  "memory",
] as const satisfies readonly RightPanelView[];

export type AppView = (typeof APP_VIEWS)[number];

export function isAppView(view: RightPanelView): view is AppView {
  return (APP_VIEWS as readonly RightPanelView[]).includes(view);
}

interface RightPanelTabSet {
  primary: readonly RightPanelView[];
  overflow: readonly RightPanelView[];
  revealOnly: readonly RightPanelView[];
  fallback: RightPanelView;
  reorderable: boolean;
}

const TAB_SETS: Record<RightPanelMode, RightPanelTabSet> = {
  work: {
    primary: ["editor", "git", "terminal", "browser"],
    overflow: [],
    revealOnly: ["issues", "notes", "decks", "memory", "routines"],
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
    primary: ["overview"],
    overflow: ["editor", "browser"],
    revealOnly: ["memory", "notes", "issues", "routines", "decks"],
    fallback: "overview",
    reorderable: false,
  },
  app: {
    primary: [],
    overflow: [],
    revealOnly: [...APP_VIEWS, "editor", "browser"],
    fallback: "notes",
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
