import { Maximize2, Minimize2, PanelRight, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NetworkProxyStatusButton } from "@/features/settings";
import {
  TITLEBAR_ICON_GLYPH_CLASS,
  TitlebarIconButton,
} from "../titlebar-icon-button";
import {
  TITLEBAR_EDITOR_TOGGLE_WIDTH,
  TITLEBAR_HEIGHT,
} from "./app-shell-layout";

interface AppShellTitlebarActionsProps {
  isRightPanelOpen: boolean;
  isRightPanelMaximized: boolean;
  onToggleRightPanel(): void;
  onToggleRightPanelMaximize(): void;
  onOpenSettings(): void;
}

export function AppShellTitlebarActions({
  isRightPanelOpen,
  isRightPanelMaximized,
  onToggleRightPanel,
  onToggleRightPanelMaximize,
  onOpenSettings,
}: AppShellTitlebarActionsProps) {
  const { t } = useTranslation(["editor", "sessions"]);

  return (
    <div
      className="app-no-drag absolute top-0 right-0 z-[60] flex items-center justify-end gap-1 px-3"
      data-testid="titlebar-editor-toggle-region"
      style={{
        height: TITLEBAR_HEIGHT,
        width: TITLEBAR_EDITOR_TOGGLE_WIDTH,
      }}
    >
      {isRightPanelOpen ? (
        <TitlebarIconButton
          active={isRightPanelMaximized}
          aria-label={
            isRightPanelMaximized
              ? t("editor:actions.exitEditorFullscreen")
              : t("editor:actions.enterEditorFullscreen")
          }
          cursor="default"
          onClick={onToggleRightPanelMaximize}
        >
          {isRightPanelMaximized ? (
            <Minimize2 className={TITLEBAR_ICON_GLYPH_CLASS} />
          ) : (
            <Maximize2 className={TITLEBAR_ICON_GLYPH_CLASS} />
          )}
        </TitlebarIconButton>
      ) : null}
      <NetworkProxyStatusButton />
      <TitlebarIconButton
        active={isRightPanelOpen}
        aria-label={t("editor:actions.toggleEditorPanel")}
        cursor="default"
        onClick={onToggleRightPanel}
      >
        <PanelRight className={TITLEBAR_ICON_GLYPH_CLASS} />
      </TitlebarIconButton>
      <TitlebarIconButton
        aria-label={t("sessions:sidebar.settings")}
        cursor="default"
        onClick={onOpenSettings}
      >
        <Settings className={TITLEBAR_ICON_GLYPH_CLASS} />
      </TitlebarIconButton>
    </div>
  );
}
