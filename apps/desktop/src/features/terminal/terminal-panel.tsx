import { useAtom } from "jotai";
import { Plus, RotateCcw, TerminalSquare } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  TITLEBAR_ICON_GLYPH_CLASS,
  TitlebarIconButton,
} from "@/app/layout/titlebar-icon-button";
import { Button, EmptyState, Spinner } from "@/components/ui";
import {
  useActiveTerminalStatus,
  useFocusTerminalWhenActive,
  useTerminalSlot,
} from "./terminal-panel-hooks";
import {
  disposeTerminal,
  focusTerminal,
  restartTerminal,
} from "./terminal-registry";
import { TerminalSearchOverlay } from "./terminal-search-overlay";
import {
  createTerminalTab,
  primaryTerminalTabId,
  type TerminalTab,
  workspaceTerminalStatesAtom,
} from "./terminal-store";
import { TerminalTabItem } from "./terminal-tab";

export interface TerminalPanelProps {
  workspaceId: string;
  cwd: string;
  // Whether the terminal view is the active one in the right panel. Used to
  // refocus xterm after the user toggles back from editor / browser / git.
  isActive: boolean;
  // Fired when the user closes the last remaining terminal. The right panel
  // uses this to switch back to whichever view was active before.
  onEmptied?: () => void;
}

// All xterm.js and PTY lifecycle lives in terminal-registry. This component is
// just a slot: it asks the registry to park its cached host DOM here on mount
// and to remove it on unmount. The registry never disposes a Terminal while
// the app is alive, so scrollback survives workspace and view switches.
export function TerminalPanel({
  workspaceId,
  cwd,
  isActive,
  onEmptied,
}: TerminalPanelProps) {
  const { t } = useTranslation("editor");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  // Persisted across remounts so tab ids stay stable (see terminal-store).
  const [workspaceStates, setWorkspaceStates] = useAtom(
    workspaceTerminalStatesAtom,
  );
  // Derive the visible tabs instead of seeding them through an effect. With no
  // stored state yet, the workspace gets an implicit primary tab whose id is
  // deterministic (see primaryTerminalTabId), so it stays stable across
  // remounts without a store write. The isActive gate keeps a hidden panel from
  // deriving a tab and letting the attach effect spawn a shell nobody sees;
  // once the user has explicitly added tabs the stored state takes over and the
  // terminal stays attached across view switches.
  const workspaceState = workspaceStates[workspaceId] ?? null;
  const storedTabs = workspaceState?.tabs;
  const hasStoredTabs = storedTabs !== undefined && storedTabs.length > 0;
  const terminalTabs: TerminalTab[] = hasStoredTabs
    ? storedTabs
    : isActive
      ? [{ id: primaryTerminalTabId(workspaceId) }]
      : [];
  const activeTabId =
    (hasStoredTabs ? workspaceState?.activeTabId : null) ??
    terminalTabs[0]?.id ??
    null;

  const status = useActiveTerminalStatus(activeTabId);
  const handleOpenSearch = useCallback(() => {
    setSearchOpen(true);
  }, []);
  const slotRef = useTerminalSlot({
    terminalId: activeTabId,
    workspaceId,
    cwd,
    onOpenSearch: handleOpenSearch,
  });
  useFocusTerminalWhenActive({
    terminalId: activeTabId,
    isActive,
    status,
  });

  const handleRestart = useCallback(() => {
    if (!activeTabId) {
      return;
    }
    void restartTerminal(activeTabId);
  }, [activeTabId]);

  const handleAddTab = useCallback(() => {
    setWorkspaceStates((current) => {
      // Append a single tab on top of whatever exists. When nothing is stored
      // yet the panel is showing the implicit primary tab, so materialize it
      // here before adding the new one — otherwise the primary would vanish.
      const stored = current[workspaceId]?.tabs;
      const tabs =
        stored && stored.length > 0
          ? stored
          : [{ id: primaryTerminalTabId(workspaceId) }];
      const nextTab = createTerminalTab();
      return {
        ...current,
        [workspaceId]: {
          tabs: [...tabs, nextTab],
          activeTabId: nextTab.id,
        },
      };
    });
  }, [workspaceId, setWorkspaceStates]);

  const handleSelectTab = useCallback(
    (tabId: string) => {
      setWorkspaceStates((current) => {
        const currentState = current[workspaceId];
        if (!currentState || currentState.activeTabId === tabId) {
          return current;
        }
        return {
          ...current,
          [workspaceId]: {
            ...currentState,
            activeTabId: tabId,
          },
        };
      });
    },
    [workspaceId, setWorkspaceStates],
  );

  const handleCloseTab = useCallback(
    (tabId: string) => {
      // Operate on the derived tab list so the implicit primary tab can be
      // closed even before any state was written to the store.
      const tabIndex = terminalTabs.findIndex((tab) => tab.id === tabId);
      if (tabIndex === -1) {
        return;
      }

      const nextTabs = terminalTabs.filter((tab) => tab.id !== tabId);
      const fallbackTab = nextTabs[Math.min(tabIndex, nextTabs.length - 1)];
      setWorkspaceStates((current) => {
        if (nextTabs.length === 0) {
          // Drop the workspace entry entirely so reopening the view re-derives a
          // fresh implicit primary tab instead of restoring an empty list.
          const { [workspaceId]: _removed, ...rest } = current;
          return rest;
        }
        return {
          ...current,
          [workspaceId]: {
            tabs: nextTabs,
            activeTabId:
              activeTabId === tabId ? (fallbackTab?.id ?? "") : activeTabId,
          },
        };
      });
      void disposeTerminal(tabId);
      // Closing the final tab empties the panel; ask the parent to leave the
      // terminal view. This setState batches with the parent's, so isActive is
      // already false on the next render and the derived tab list stays empty.
      if (nextTabs.length === 0) {
        onEmptied?.();
      }
    },
    [workspaceId, terminalTabs, activeTabId, onEmptied, setWorkspaceStates],
  );

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col bg-editor-canvas">
      <div
        className="app-drag flex h-9 shrink-0 items-center border-b border-editor-border bg-editor-shell px-2"
        data-testid="terminal-tab-row"
      >
        {/* Tabs and the new-tab button stay grouped on the start edge so the
            button sits right after the last tab; the row's leftover space is
            left as a window-drag region. */}
        <div className="app-no-drag flex min-w-0 items-center gap-1">
          <div className="scrollbar-hide flex min-w-0 items-center gap-1 overflow-x-auto">
            {terminalTabs.map((tab, index) => (
              <TerminalTabItem
                index={index + 1}
                key={tab.id}
                onClose={handleCloseTab}
                onSelect={handleSelectTab}
                selected={tab.id === activeTabId}
                terminalId={tab.id}
              />
            ))}
          </div>
          <TitlebarIconButton
            aria-label={t("terminal.newTab")}
            onClick={handleAddTab}
          >
            <Plus className={TITLEBAR_ICON_GLYPH_CLASS} />
          </TitlebarIconButton>
        </div>
      </div>
      <div
        className="min-h-0 flex-1 overflow-hidden p-2"
        data-testid="terminal-host"
        ref={slotRef}
      />
      {searchOpen && activeTabId ? (
        <TerminalSearchOverlay
          onClose={() => {
            setSearchOpen(false);
            if (activeTabId) {
              focusTerminal(activeTabId);
            }
          }}
          onQueryChange={setSearchQuery}
          query={searchQuery}
          terminalId={activeTabId}
        />
      ) : null}
      {status.kind === "spawning" ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-editor-canvas/80">
          <Spinner aria-label={t("terminal.starting")} size="md" />
        </div>
      ) : null}
      {status.kind === "error" ? (
        <div className="absolute inset-0 flex items-center justify-center bg-editor-canvas">
          <EmptyState
            action={
              <Button onClick={handleRestart} size="sm" variant="outline">
                <RotateCcw className="size-3.5" />
                {t("terminal.restart")}
              </Button>
            }
            description={status.message}
            icon={<TerminalSquare />}
            title={t("terminal.failedToStart")}
          />
        </div>
      ) : null}
      {status.kind === "exited" ? (
        <div className="absolute right-3 bottom-3 flex items-center">
          <Button onClick={handleRestart} size="sm" variant="outline">
            <RotateCcw className="size-3.5" />
            {t("terminal.restart")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
