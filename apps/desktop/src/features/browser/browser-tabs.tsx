import { useAtomValue } from "jotai";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TitlebarIconButton } from "@/app/layout/titlebar-icon-button";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn, desktopApi, useScrollIntoViewWhenActive } from "@/lib";
import { browserTabsAtom } from "./browser-store";

function BrowserTabItem({
  id,
  title,
  active,
  onClose,
}: {
  id: string;
  title: string;
  active: boolean;
  onClose(id: string): void;
}) {
  const { t } = useTranslation("browser");
  const ref = useScrollIntoViewWhenActive<HTMLDivElement>(active);
  return (
    <div
      ref={ref}
      className={cn(
        "flex max-w-44 shrink-0 items-center rounded-control",
        active && "bg-editor-tab-active-bg",
      )}
    >
      <TabsTrigger
        value={id}
        title={title}
        className="min-w-0 justify-start text-meta after:hidden"
      >
        <span className="truncate">{title}</span>
      </TabsTrigger>
      <TitlebarIconButton
        aria-label={t("actions.closeTab", { title })}
        title={t("actions.closeTab", { title })}
        onClick={() => onClose(id)}
      >
        <X className="size-3.5" />
      </TitlebarIconButton>
    </div>
  );
}

export function BrowserTabs({ onEmpty }: { onEmpty(): void }) {
  const { t } = useTranslation("browser");
  const snapshot = useAtomValue(browserTabsAtom);
  const close = async (id: string) => {
    const next = await desktopApi.browserCloseTab(id);
    if (next.tabs.length === 0) onEmpty();
  };
  return (
    <div className="shrink-0 overflow-x-auto border-b border-editor-border px-2">
      <TabsList aria-label={t("tabs.label")} variant="line">
        {snapshot.tabs.map((tab) => (
          <BrowserTabItem
            key={tab.id}
            id={tab.id}
            title={
              tab.title ||
              (tab.url.startsWith("cocurdex-html:")
                ? t("tabs.htmlPreview")
                : tab.url) ||
              t("placeholder.title")
            }
            active={tab.id === snapshot.activeId}
            onClose={close}
          />
        ))}
      </TabsList>
    </div>
  );
}
