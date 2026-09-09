import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/ui";
import { cn } from "@/lib";
import {
  TITLEBAR_ICON_GLYPH_CLASS,
  TitlebarIconButton,
} from "../titlebar-icon-button";
import { SessionSplitMenu } from "./session-split-menu";

interface SessionPaneHeaderProps {
  canClose: boolean;
  isFocused: boolean;
  occupiesTitlebar?: boolean;
  title: string;
  onClose(): void;
  onCloseAll(): void;
  onSplitDown(): void;
  onSplitRight(): void;
}

export function SessionPaneHeader({
  canClose,
  isFocused,
  occupiesTitlebar = false,
  title,
  onClose,
  onCloseAll,
  onSplitDown,
  onSplitRight,
}: SessionPaneHeaderProps) {
  const { t } = useTranslation("sessions");
  let surfaceClass = "bg-app";
  if (occupiesTitlebar) {
    surfaceClass = "bg-transparent";
  } else if (isFocused) {
    surfaceClass = "bg-chat-canvas";
  }

  return (
    <div
      className={cn("flex h-8 shrink-0 items-center gap-1 px-2", surfaceClass)}
    >
      <div
        className={cn(
          "flex items-center gap-1",
          occupiesTitlebar && "relative z-[60]",
        )}
      >
        <SessionSplitMenu
          canClose={canClose}
          onClose={onClose}
          onCloseAll={onCloseAll}
          onSplitDown={onSplitDown}
          onSplitRight={onSplitRight}
        />
        {canClose ? (
          <TitlebarIconButton
            aria-label={t("split.close")}
            cursor="default"
            onClick={onClose}
          >
            <X className={TITLEBAR_ICON_GLYPH_CLASS} />
          </TitlebarIconButton>
        ) : null}
      </div>
      {title ? (
        <Text
          className="min-w-0 flex-1 truncate"
          size="meta"
          tone={isFocused ? "default" : "muted"}
          weight={isFocused ? "medium" : "normal"}
        >
          {title}
        </Text>
      ) : null}
    </div>
  );
}
