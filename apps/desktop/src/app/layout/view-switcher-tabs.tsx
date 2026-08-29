import { useAtom } from "jotai";
import {
  FileText,
  FolderTree,
  GitCompare,
  Globe,
  ListTodo,
  type LucideIcon,
  NotebookPen,
  TerminalSquare,
} from "lucide-react";
import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  ToggleGroup,
  ToggleGroupItem,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui";
import { cn } from "@/lib";
import {
  TITLEBAR_EDITOR_TOGGLE_WIDTH,
  TITLEBAR_HEIGHT,
  TITLEBAR_ICON_BUTTON_GAP,
  TITLEBAR_ICON_BUTTON_SIZE,
} from "./app-shell/app-shell-layout";
import {
  type RightPanelView,
  rightPanelTabOrderAtom,
} from "./right-editor-panel-store";
import {
  TITLEBAR_ICON_GLYPH_CLASS,
  titlebarIconButtonClassName,
} from "./titlebar-icon-button";

/** Delay before tab tooltips open so quick sweeps over the row stay quiet. */
const TAB_TOOLTIP_DELAY_MS = 500;

type ViewTabLabelKey =
  | "actions.showGitChanges"
  | "actions.showEditor"
  | "actions.showNotes"
  | "actions.showIssues"
  | "actions.showBrowser"
  | "actions.showPdf"
  | "actions.showTerminal";

interface TabDef {
  id: RightPanelView;
  icon: LucideIcon;
  labelKey: ViewTabLabelKey;
}

const TAB_REGISTRY: Record<RightPanelView, TabDef> = {
  git: { id: "git", icon: GitCompare, labelKey: "actions.showGitChanges" },
  editor: { id: "editor", icon: FolderTree, labelKey: "actions.showEditor" },
  notes: { id: "notes", icon: NotebookPen, labelKey: "actions.showNotes" },
  issues: { id: "issues", icon: ListTodo, labelKey: "actions.showIssues" },
  browser: { id: "browser", icon: Globe, labelKey: "actions.showBrowser" },
  pdf: { id: "pdf", icon: FileText, labelKey: "actions.showPdf" },
  terminal: {
    id: "terminal",
    icon: TerminalSquare,
    labelKey: "actions.showTerminal",
  },
};

const DRAG_THRESHOLD_PX = 3;
// Drag step matches shared titlebar icon metrics (size-6 + gap-1).
const TAB_STEP_PX = TITLEBAR_ICON_BUTTON_SIZE + TITLEBAR_ICON_BUTTON_GAP;
/** Fixed title chrome height — same as OS titlebar / center spacer / pinned chat. */
export const VIEW_SWITCHER_ROW_HEIGHT_PX = TITLEBAR_HEIGHT;

interface ViewSwitcherTabsProps {
  activeView: RightPanelView;
  hasPdfsOpen: boolean;
  onViewChange: (view: RightPanelView) => void;
  reserveTrafficLights?: boolean;
}

export function ViewSwitcherTabs({
  activeView,
  hasPdfsOpen,
  onViewChange,
  reserveTrafficLights = false,
}: ViewSwitcherTabsProps) {
  const { t } = useTranslation("editor");
  const [tabOrder, setTabOrder] = useAtom(rightPanelTabOrderAtom);

  const visibleTabs = tabOrder.filter((id) => id !== "pdf" || hasPdfsOpen);

  const dragState = useRef<{
    tabId: RightPanelView;
    startX: number;
    dragIndex: number;
    currentIndex: number;
    order: RightPanelView[];
  } | null>(null);
  const isDraggingRef = useRef(false);
  const tabRefs = useRef<Map<string, HTMLElement>>(new Map());

  const commitOrder = useCallback(
    (visibleOrder: RightPanelView[]) => {
      const visibleSet = new Set(visibleOrder);
      const full: RightPanelView[] = [];
      let vi = 0;
      for (const id of tabOrder) {
        if (visibleSet.has(id)) {
          full.push(visibleOrder[vi++]);
        } else {
          full.push(id);
        }
      }
      setTabOrder(full);
    },
    [tabOrder, setTabOrder],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent, tabId: RightPanelView) => {
      if (event.button !== 0) return;
      const el = event.currentTarget as HTMLElement;
      el.setPointerCapture(event.pointerId);

      const idx = visibleTabs.indexOf(tabId);
      dragState.current = {
        tabId,
        startX: event.clientX,
        dragIndex: idx,
        currentIndex: idx,
        order: [...visibleTabs],
      };
      isDraggingRef.current = false;
    },
    [visibleTabs],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent) => {
      const state = dragState.current;
      if (!state) return;

      const deltaX = event.clientX - state.startX;
      if (!isDraggingRef.current && Math.abs(deltaX) < DRAG_THRESHOLD_PX) {
        return;
      }

      if (!isDraggingRef.current) {
        isDraggingRef.current = true;
        document.body.style.cursor = "grabbing";
        document.body.style.userSelect = "none";
      }

      const draggedEl = tabRefs.current.get(state.tabId);
      if (draggedEl) {
        draggedEl.style.transform = `translateX(${deltaX}px)`;
        draggedEl.style.zIndex = "50";
        draggedEl.style.opacity = "0.8";
      }

      const steps = Math.round(deltaX / TAB_STEP_PX);
      const newIndex = Math.max(
        0,
        Math.min(visibleTabs.length - 1, state.dragIndex + steps),
      );

      if (newIndex !== state.currentIndex) {
        state.currentIndex = newIndex;
        const reordered = [...visibleTabs];
        const [moved] = reordered.splice(state.dragIndex, 1);
        reordered.splice(newIndex, 0, moved);
        state.order = reordered;

        for (const tab of visibleTabs) {
          if (tab === state.tabId) continue;
          const el = tabRefs.current.get(tab);
          if (!el) continue;

          const originalIdx = visibleTabs.indexOf(tab);
          const newIdx = reordered.indexOf(tab);
          const shift = (newIdx - originalIdx) * TAB_STEP_PX;
          el.style.transform = shift ? `translateX(${shift}px)` : "";
          el.style.transition = "transform 150ms ease";
        }
      }
    },
    [visibleTabs],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent) => {
      const state = dragState.current;
      if (!state) return;

      const el = event.currentTarget as HTMLElement;
      el.releasePointerCapture(event.pointerId);

      for (const tab of visibleTabs) {
        const tabEl = tabRefs.current.get(tab);
        if (tabEl) {
          tabEl.style.transform = "";
          tabEl.style.transition = "";
          tabEl.style.zIndex = "";
          tabEl.style.opacity = "";
        }
      }

      if (isDraggingRef.current) {
        commitOrder(state.order);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        // Defer clearing so the trailing click is swallowed
        window.setTimeout(() => {
          isDraggingRef.current = false;
        }, 0);
      }

      dragState.current = null;
    },
    [visibleTabs, commitOrder],
  );

  const handleValueChange = useCallback(
    (value: string) => {
      if (isDraggingRef.current) return;
      if (
        value === "editor" ||
        value === "notes" ||
        value === "issues" ||
        value === "browser" ||
        value === "git" ||
        value === "pdf" ||
        value === "terminal"
      ) {
        onViewChange(value);
      }
    },
    [onViewChange],
  );

  const tabClassName = (id: RightPanelView) => {
    const isActive = activeView === id;
    return cn(
      // Shared titlebar pill shell (same as left/right chrome icons).
      "app-no-drag cursor-default",
      titlebarIconButtonClassName({ active: isActive }),
      // Kill Base UI toggle pressed/muted defaults that fight our active paint.
      "data-pressed:bg-transparent data-pressed:text-editor-fg-subtle",
      "aria-pressed:bg-transparent aria-pressed:text-editor-fg-subtle",
      isActive &&
        "data-pressed:bg-editor-tab-active-bg data-pressed:text-editor-fg aria-pressed:bg-editor-tab-active-bg aria-pressed:text-editor-fg",
    );
  };

  return (
    <TooltipProvider delay={TAB_TOOLTIP_DELAY_MS}>
      {/*
        Full-width row so border-b runs edge to edge. Do NOT put app-drag on
        the whole row: Electron's -webkit-app-region:drag on a full-width
        band (even with pe-* padding) steals clicks from the absolute
        titlebar maximize / panel toggles that sit in that corner.
        Split into: tabs (drag) | middle filler (drag) | toggle reserve (no-drag).
      */}
      <div
        className={cn(
          "relative z-40 flex w-full shrink-0 items-center border-b border-editor-border",
          reserveTrafficLights && "ps-20",
        )}
        data-testid="editor-panel-view-switcher"
        style={{ height: VIEW_SWITCHER_ROW_HEIGHT_PX }}
      >
        <ToggleGroup
          // Non-zero spacing avoids the connected segmented styles (rounded-none
          // flush first/last) so each tab stays an independent pill with inset.
          spacing={1}
          className="app-drag flex h-full w-fit items-center rounded-none px-2"
          type="single"
          value={activeView}
          onValueChange={handleValueChange}
        >
          {visibleTabs.map((id) => {
            const def = TAB_REGISTRY[id];
            const Icon = def.icon;
            const label = t(def.labelKey);
            return (
              <Tooltip key={id}>
                <TooltipTrigger asChild>
                  <ToggleGroupItem
                    ref={(el: HTMLElement | null) => {
                      if (el) {
                        tabRefs.current.set(id, el);
                      } else {
                        tabRefs.current.delete(id);
                      }
                    }}
                    aria-label={label}
                    className={tabClassName(id)}
                    value={id}
                    onPointerDown={(e) => handlePointerDown(e, id)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                  >
                    <Icon className={TITLEBAR_ICON_GLYPH_CLASS} />
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={6}>
                  {label}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </ToggleGroup>
        <div
          aria-hidden
          className="app-drag min-h-0 min-w-0 flex-1 self-stretch"
        />
        {/*
          Matches titlebar-editor-toggle-region (size-6 pills + gap-1 + px-3).
          app-no-drag so the absolute toggles stay clickable.
        */}
        <div
          aria-hidden
          className="app-no-drag shrink-0 self-stretch"
          style={{ width: TITLEBAR_EDITOR_TOGGLE_WIDTH }}
        />
      </div>
    </TooltipProvider>
  );
}
