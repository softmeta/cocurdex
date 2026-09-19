import { MessageSquare, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { IconButton } from "@/components/ui/icon-button";
import { useResolvedShortcutLabel } from "@/features/shortcuts";
import { useFabPosition } from "./chat-dock-geometry";

interface ChatDockLauncherProps {
  onOpen(): void;
  detached?: boolean;
  onHideFab?(): void;
}

export function ChatDockLauncher({
  onOpen,
  onHideFab,
  detached = false,
}: ChatDockLauncherProps) {
  const { t } = useTranslation("editor");
  const toggleChatShortcut = useResolvedShortcutLabel("toggleChatDock");
  const {
    position: fabPosition,
    beginDrag: beginFabDrag,
    consumeDragClick: consumeFabDragClick,
  } = useFabPosition();
  const label = detached
    ? t("actions.toggleDetachedChat")
    : t("actions.openChat");
  const hint = detached
    ? t("actions.detachedChatFabHint", { shortcut: toggleChatShortcut })
    : t("actions.chatFabHint", { shortcut: toggleChatShortcut });
  return (
    <div
      className="app-no-drag group/fab absolute z-50"
      style={{ right: fabPosition.right, bottom: fabPosition.bottom }}
    >
      <IconButton
        aria-label={label}
        className="cursor-grab rounded-full shadow-lg active:cursor-grabbing"
        onClick={() => {
          if (consumeFabDragClick()) {
            return;
          }
          onOpen();
        }}
        onMouseDown={beginFabDrag}
        size="lg"
        title={toggleChatShortcut ? hint : label}
        variant="default"
      >
        <MessageSquare className="size-4" />
      </IconButton>
      {onHideFab ? (
        <button
          aria-label={t("actions.hideChatFab")}
          className="absolute -end-1 -top-1 z-10 flex size-4 items-center justify-center rounded-full border border-border bg-background text-muted-foreground opacity-0 shadow-sm outline-none transition-opacity pointer-events-none hover:text-foreground focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50 group-hover/fab:pointer-events-auto group-hover/fab:opacity-100"
          onClick={(event) => {
            event.stopPropagation();
            onHideFab();
          }}
          title={
            toggleChatShortcut
              ? t("actions.hideChatFabHint", { shortcut: toggleChatShortcut })
              : t("actions.hideChatFab")
          }
          type="button"
        >
          <X className="size-3" />
        </button>
      ) : null}
    </div>
  );
}
