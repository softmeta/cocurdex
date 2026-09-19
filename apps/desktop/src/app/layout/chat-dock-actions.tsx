import { Pin, PinOff, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  CHAT_DOCK_MIN_WIDTH,
  resolveChatDockPinLayout,
} from "./chat-dock-sizing";
import { TitlebarIconButton } from "./titlebar-icon-button";
import { useChatDockViewportWidth } from "./use-chat-dock-viewport";

// Pin + close (size-6 each, gap-1), the overlay offset, and a gap to the
// trailing pane-header controls. Detaching lives in the session menu.
export const CHAT_DOCK_ACTIONS_INSET = 60;

export function ChatDockActions({
  pinned,
  onPinnedChange,
  onClose,
}: {
  pinned: boolean;
  onPinnedChange(pinned: boolean): void;
  onClose(): void;
}) {
  const { t } = useTranslation("editor");
  const width = useChatDockViewportWidth();
  const { canPin } = resolveChatDockPinLayout(width, CHAT_DOCK_MIN_WIDTH);
  const unavailable = !pinned && !canPin;
  let label: string = t("actions.pinChatDock");
  if (pinned) label = t("actions.unpinChatDock");
  let hint: string = label;
  if (unavailable) hint = t("actions.pinChatDockNeedsSpace");
  if (pinned && !canPin) hint = t("actions.chatDockTemporarilyFloating");
  return (
    <div className="flex items-center gap-1 bg-chat-canvas">
      <TitlebarIconButton
        active={pinned && canPin}
        aria-label={label}
        aria-disabled={unavailable}
        title={hint}
        className="aria-disabled:cursor-default aria-disabled:text-muted-foreground"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={() => {
          if (unavailable) {
            toast.info(hint);
            return;
          }
          onPinnedChange(!pinned);
        }}
      >
        {pinned ? (
          <PinOff className="size-3.5" />
        ) : (
          <Pin className="size-3.5" />
        )}
      </TitlebarIconButton>
      <TitlebarIconButton
        aria-label={t("actions.closeChat")}
        title={t("actions.closeChat")}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={onClose}
      >
        <X className="size-3.5" />
      </TitlebarIconButton>
    </div>
  );
}
