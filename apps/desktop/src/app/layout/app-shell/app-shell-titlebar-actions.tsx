import { PanelRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TitlebarIconButton } from "../titlebar-icon-button";

interface AppShellTitlebarActionsProps {
  isChatDetached: boolean;
  isRightPanelOpen: boolean;
  onToggleRightPanel(): void;
}

export function AppShellTitlebarActions({
  isChatDetached,
  isRightPanelOpen,
  onToggleRightPanel,
}: AppShellTitlebarActionsProps) {
  const { t } = useTranslation("editor");
  const panelLabel = isRightPanelOpen
    ? t("actions.closeEditorPanel")
    : t("actions.openEditorPanel");

  if (isChatDetached) {
    return null;
  }
  return (
    <TitlebarIconButton
      active={isRightPanelOpen}
      aria-label={panelLabel}
      cursor="default"
      onClick={onToggleRightPanel}
    >
      <PanelRight className="size-3.5" />
    </TitlebarIconButton>
  );
}
