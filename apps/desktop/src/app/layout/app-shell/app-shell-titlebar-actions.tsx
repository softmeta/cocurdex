import { useAtom } from "jotai";
import {
  Maximize2,
  Minimize2,
  PanelRight,
  Pin,
  PinOff,
  Settings,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { NetworkProxyStatusButton } from "@/features/settings";
import { rightPanelDockedAtom } from "../right-editor-panel-store";
import {
  TITLEBAR_ICON_GLYPH_CLASS,
  TitlebarIconButton,
} from "../titlebar-icon-button";
import {
  TITLEBAR_EDITOR_TOGGLE_WIDTH,
  TITLEBAR_HEIGHT,
} from "./app-shell-layout";

interface AppShellTitlebarActionsProps {
  isChatDetached: boolean;
  isRightPanelOpen: boolean;
  isRightPanelMaximized: boolean;
  onToggleRightPanel(): void;
  onToggleRightPanelMaximize(): void;
  onOpenSettings(): void;
}

export function AppShellTitlebarActions({
  isChatDetached,
  isRightPanelOpen,
  isRightPanelMaximized,
  onToggleRightPanel,
  onToggleRightPanelMaximize,
  onOpenSettings,
}: AppShellTitlebarActionsProps) {
  const { t } = useTranslation(["editor", "sessions"]);
  const maximizeLabel = isRightPanelMaximized
    ? t("editor:actions.exitEditorFullscreen")
    : t("editor:actions.enterEditorFullscreen");
  const [isRightPanelDocked, setRightPanelDocked] =
    useAtom(rightPanelDockedAtom);
  const dockLabel = isRightPanelDocked
    ? t("editor:actions.floatEditorPanel")
    : t("editor:actions.dockEditorPanel");
  const panelLabel = isRightPanelOpen
    ? t("editor:actions.closeEditorPanel")
    : t("editor:actions.openEditorPanel");

  return (
    <div
      className="app-no-drag absolute top-0 z-[60] flex items-center justify-end gap-1 px-3"
      data-testid="titlebar-editor-toggle-region"
      style={{
        right: "var(--titlebar-controls-inset)",
        height: TITLEBAR_HEIGHT,
        width: TITLEBAR_EDITOR_TOGGLE_WIDTH,
      }}
    >
      {isRightPanelOpen && !isChatDetached && !isRightPanelMaximized ? (
        <TitlebarIconButton
          active={isRightPanelDocked}
          aria-label={dockLabel}
          cursor="default"
          tooltip={dockLabel}
          onClick={() => setRightPanelDocked(!isRightPanelDocked)}
        >
          {isRightPanelDocked ? (
            <PinOff className={TITLEBAR_ICON_GLYPH_CLASS} />
          ) : (
            <Pin className={TITLEBAR_ICON_GLYPH_CLASS} />
          )}
        </TitlebarIconButton>
      ) : null}
      {isRightPanelOpen && !isChatDetached ? (
        <TitlebarIconButton
          active={isRightPanelMaximized}
          aria-label={maximizeLabel}
          cursor="default"
          tooltip={maximizeLabel}
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
      {isChatDetached ? null : (
        <TitlebarIconButton
          active={isRightPanelOpen}
          aria-label={panelLabel}
          cursor="default"
          tooltip={panelLabel}
          onClick={onToggleRightPanel}
        >
          <PanelRight className={TITLEBAR_ICON_GLYPH_CLASS} />
        </TitlebarIconButton>
      )}
      <TitlebarIconButton
        aria-label={t("sessions:sidebar.settings")}
        cursor="default"
        tooltip={t("sessions:sidebar.settings")}
        onClick={onOpenSettings}
      >
        <Settings className={TITLEBAR_ICON_GLYPH_CLASS} />
      </TitlebarIconButton>
    </div>
  );
}
