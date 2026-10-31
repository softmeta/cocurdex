import { useAtom } from "jotai";
import { Maximize2, Minimize2, Pin, PinOff, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { rightPanelDockedAtom } from "../right-editor-panel-store";
import { TitlebarIconButton } from "../titlebar-icon-button";

interface RightPanelWindowActionsProps {
  isRightPanelMaximized: boolean;
  onToggleRightPanelMaximize(): void;
  onCloseRightPanel(): void;
}

export function RightPanelWindowActions({
  isRightPanelMaximized,
  onToggleRightPanelMaximize,
  onCloseRightPanel,
}: RightPanelWindowActionsProps) {
  const { t } = useTranslation("editor");
  const [isRightPanelDocked, setRightPanelDocked] =
    useAtom(rightPanelDockedAtom);
  const maximizeLabel = isRightPanelMaximized
    ? t("actions.exitEditorFullscreen")
    : t("actions.enterEditorFullscreen");
  const closeLabel = t("actions.closeEditorPanel");
  const dockLabel = isRightPanelDocked
    ? t("actions.floatEditorPanel")
    : t("actions.dockEditorPanel");

  return (
    <div className="app-no-drag flex items-center gap-1">
      {isRightPanelMaximized ? null : (
        <TitlebarIconButton
          active={isRightPanelDocked}
          aria-label={dockLabel}
          cursor="default"
          onClick={() => setRightPanelDocked(!isRightPanelDocked)}
        >
          {isRightPanelDocked ? (
            <PinOff className="size-3.5" />
          ) : (
            <Pin className="size-3.5" />
          )}
        </TitlebarIconButton>
      )}
      <TitlebarIconButton
        active={isRightPanelMaximized}
        aria-label={maximizeLabel}
        cursor="default"
        onClick={onToggleRightPanelMaximize}
      >
        {isRightPanelMaximized ? (
          <Minimize2 className="size-3.5" />
        ) : (
          <Maximize2 className="size-3.5" />
        )}
      </TitlebarIconButton>
      <TitlebarIconButton
        aria-label={closeLabel}
        cursor="default"
        onClick={onCloseRightPanel}
      >
        <X className="size-3.5" />
      </TitlebarIconButton>
    </div>
  );
}
