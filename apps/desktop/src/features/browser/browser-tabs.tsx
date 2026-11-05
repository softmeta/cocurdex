import { useAtomValue } from "jotai";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PanelToolbar } from "@/app/layout/panel-toolbar";
import { TitlebarIconButton } from "@/app/layout/titlebar-icon-button";
import { AppPanelTab } from "@/components";
import { desktopApi } from "@/lib";
import { browserTabsAtom } from "./browser-store";

export function BrowserTabs({ onEmpty }: { onEmpty(): void }) {
  const { t } = useTranslation("browser");
  const snapshot = useAtomValue(browserTabsAtom);
  const close = async (id: string) => {
    const next = await desktopApi.browserCloseTab(id);
    if (next.tabs.length === 0) onEmpty();
  };
  return (
    <PanelToolbar className="gap-1">
      <div className="scrollbar-hide flex min-w-0 items-center gap-px overflow-x-auto">
        {snapshot.tabs.map((tab) => {
          const title =
            tab.title ||
            (tab.url.startsWith("cocurdex-html:")
              ? t("tabs.htmlPreview")
              : tab.url) ||
            t("placeholder.title");
          return (
            <AppPanelTab
              key={tab.id}
              active={tab.id === snapshot.activeId}
              label={title}
              title={title}
              closeLabel={t("actions.closeTab", { title })}
              onSelect={() => void desktopApi.browserActivateTab(tab.id)}
              onClose={() => void close(tab.id)}
            />
          );
        })}
      </div>
      <TitlebarIconButton
        aria-label={t("actions.newTab")}
        title={t("actions.newTab")}
        onClick={() => void desktopApi.browserNewTab()}
      >
        <Plus className="size-3.5" />
      </TitlebarIconButton>
    </PanelToolbar>
  );
}
