import { useAtomValue, useSetAtom } from "jotai";
import { Presentation } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppWorkbench } from "@/app/layout/app-workbench";
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

export function DecksView() {
  const { t } = useTranslation("decks");
  const loadDecks = useSetAtom(loadDecksAtom);
  const loaded = useAtomValue(decksLoadedAtom);

  useMountEffect(() => {
    void loadDecks();
  });

  useDataSync("decks");

  return (
    <AppWorkbench
      app="decks"
      contentMinWidth={MIN_DECK_VIEWER_WIDTH_PX}
      sidebarResizeLabel={t("sidebar.resize")}
      sidebar={loaded ? <DeckSidebar /> : null}
    >
      {loaded ? <DeckContent /> : null}
    </AppWorkbench>
  );
}

function DeckContent() {
  const { t } = useTranslation("decks");
  const activeDeckId = useAtomValue(activeDeckIdAtom);
  const activeDeck = useAtomValue(activeDeckAtom);
  if (activeDeck) return <DeckViewer deck={activeDeck} />;
  if (activeDeckId) return null;
  return (
    <div className="flex flex-1 items-center justify-center">
      <EmptyState
        icon={<Presentation />}
        title={t("viewer.empty.title")}
        description={t("viewer.empty.description")}
      />
    </div>
  );
}
