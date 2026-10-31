import { useAtomValue, useSetAtom } from "jotai";
import { Presentation } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SidebarToggleButton } from "@/app/layout/titlebar-icon-button";
import { ResizableSidebar, WORKBENCH_SIDEBAR_WIDTH_PX } from "@/components";
import { EmptyState } from "@/components/ui";
import { useDataSync } from "@/features/data-sync";
import { useMountEffect } from "@/lib";
import { DeckSidebar } from "./deck-sidebar";
import { DeckViewer } from "./deck-viewer";
import {
  activeDeckAtom,
  activeDeckIdAtom,
  decksLoadedAtom,
  loadDecksAtom,
} from "./decks-store";

const MIN_DECK_VIEWER_WIDTH_PX = 280;
const MIN_DECKS_VIEW_WIDTH_PX =
  WORKBENCH_SIDEBAR_WIDTH_PX + MIN_DECK_VIEWER_WIDTH_PX;

export function DecksView() {
  const { t } = useTranslation("decks");
  const loadDecks = useSetAtom(loadDecksAtom);
  const loaded = useAtomValue(decksLoadedAtom);
  const activeDeckId = useAtomValue(activeDeckIdAtom);
  const activeDeck = useAtomValue(activeDeckAtom);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useMountEffect(() => {
    void loadDecks();
  });

  useDataSync("decks");

  if (!loaded) {
    return null;
  }

  const expandSidebar = (
    <SidebarToggleButton
      label={t("sidebar.expand")}
      open={false}
      onToggle={() => setSidebarCollapsed(false)}
    />
  );

  return (
    <div
      className="flex min-h-0 flex-1"
      style={{ minWidth: MIN_DECKS_VIEW_WIDTH_PX }}
    >
      {sidebarCollapsed ? null : (
        <ResizableSidebar
          defaultWidth={WORKBENCH_SIDEBAR_WIDTH_PX}
          ariaLabel={t("sidebar.resize")}
        >
          <DeckSidebar onCollapse={() => setSidebarCollapsed(true)} />
        </ResizableSidebar>
      )}
      <div
        className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-editor-canvas"
        style={{ minWidth: MIN_DECK_VIEWER_WIDTH_PX }}
      >
        {sidebarCollapsed && !activeDeck ? (
          <div className="absolute start-2 top-0 z-10 flex h-8 items-center">
            {expandSidebar}
          </div>
        ) : null}
        {activeDeck ? (
          <DeckViewer
            deck={activeDeck}
            leading={sidebarCollapsed ? expandSidebar : null}
          />
        ) : activeDeckId ? null : (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              icon={<Presentation />}
              title={t("viewer.empty.title")}
              description={t("viewer.empty.description")}
            />
          </div>
        )}
      </div>
    </div>
  );
}
