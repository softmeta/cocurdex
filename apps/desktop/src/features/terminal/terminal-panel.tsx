import { useAtom, useSetAtom } from "jotai";
import { Plus, RotateCcw, TerminalSquare } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { PanelToolbar } from "@/app/layout/panel-toolbar";
import { TitlebarIconButton } from "@/app/layout/titlebar-icon-button";
import { Button, EmptyState } from "@/components/ui";
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
  openTerminalTabAtom,
  primaryTerminalTabId,
  type TerminalTab,
  workspaceTerminalStatesAtom,
} from "./terminal-store";
import { TerminalTabItem } from "./terminal-tab";

export interface TerminalPanelProps {
  workspaceId: string;
  cwd: string;
  isActive: boolean;
  onEmptied?: () => void;
}

export function TerminalPanel({
  workspaceId,
  cwd,
  isActive,
  onEmptied,
}: TerminalPanelProps) {
  const { t } = useTranslation("editor");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [workspaceStates, setWorkspaceStates] = useAtom(
    workspaceTerminalStatesAtom,
  );
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

  const openTerminalTab = useSetAtom(openTerminalTabAtom);
  const handleAddTab = useCallback(() => {
    openTerminalTab({ scopeId: workspaceId });
  }, [workspaceId, openTerminalTab]);

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
      const tabIndex = terminalTabs.findIndex((tab) => tab.id === tabId);
      if (tabIndex === -1) {
        return;
      }

      const nextTabs = terminalTabs.filter((tab) => tab.id !== tabId);
      const fallbackTab = nextTabs[Math.min(tabIndex, nextTabs.length - 1)];
      setWorkspaceStates((current) => {
        if (nextTabs.length === 0) {
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
      if (nextTabs.length === 0) {
        onEmptied?.();
      }
    },
    [workspaceId, terminalTabs, activeTabId, onEmptied, setWorkspaceStates],
  );

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col bg-editor-canvas">
      <PanelToolbar
        className="app-drag bg-editor-shell"
        data-testid="terminal-tab-row"
      >
        <div className="app-no-drag flex min-w-0 items-center gap-1">
          <div className="scrollbar-hide flex min-w-0 items-center gap-px overflow-x-auto">
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
            <Plus className="size-3.5" />
          </TitlebarIconButton>
        </div>
      </PanelToolbar>
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
