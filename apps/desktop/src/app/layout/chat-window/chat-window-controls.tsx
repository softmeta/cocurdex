import { ExternalLink, PanelLeftClose } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppDropdownItem } from "@/components";
import { Button, Text } from "@/components/ui";
import { TitlebarIconButton } from "../titlebar-icon-button";
import { useChatWindowActions } from "./use-chat-window";

export function ChatWindowMenuItem() {
  const { t } = useTranslation("sessions");
  const { busy, move, isDetachedChatWindow } = useChatWindowActions();
  if (!window.desktopApi?.chatWindow) return null;
  return (
    <AppDropdownItem disabled={busy} onClick={() => void move()}>
      <ExternalLink className="size-4" />
      {isDetachedChatWindow ? t("window.return") : t("window.detach")}
    </AppDropdownItem>
  );
}

export function ChatWindowButton() {
  const { t } = useTranslation("sessions");
  const { busy, move, isDetachedChatWindow } = useChatWindowActions();
  if (!window.desktopApi?.chatWindow) return null;
  return (
    <TitlebarIconButton
      aria-label={
        isDetachedChatWindow ? t("window.return") : t("window.detach")
      }
      disabled={busy}
      onClick={() => void move()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {isDetachedChatWindow ? (
        <PanelLeftClose className="size-3.5" />
      ) : (
        <ExternalLink className="size-3.5" />
      )}
    </TitlebarIconButton>
  );
}

export function DetachedChatPlaceholder() {
  const { t } = useTranslation("sessions");
  const { focus } = useChatWindowActions();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-chat-canvas p-4">
      <Text tone="muted">{t("window.detached")}</Text>
      <Button variant="outline" onClick={focus}>
        <ExternalLink className="size-4" />
        {t("window.show")}
      </Button>
    </div>
  );
}
