import { PanelRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TitlebarIconButton } from "../titlebar-icon-button";

export function RightPanelOpenButton({ onOpen }: { onOpen(): void }) {
  const { t } = useTranslation("editor");
  return (
    <TitlebarIconButton
      aria-label={t("actions.openEditorPanel")}
      className="app-no-drag"
      cursor="default"
      onClick={onOpen}
    >
      <PanelRight className="size-3.5" />
    </TitlebarIconButton>
  );
}
