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
  canSplit: boolean;
  isFocused: boolean;
  title: string;
  onClose(): void;
  onSplitDown(): void;
  onSplitRight(): void;
}

export function SessionPaneHeader({
  canSplit,
  isFocused,
  title,
  onClose,
  onSplitDown,
  onSplitRight,
}: SessionPaneHeaderProps) {
  const { t } = useTranslation("sessions");

  return (
    <div
      className={cn(
        "flex h-8 shrink-0 items-center gap-1 px-2",
        isFocused ? "bg-chat-canvas" : "bg-app",
      )}
    >
      <Text
        className="min-w-0 flex-1 truncate"
        size="meta"
        tone={isFocused ? "default" : "muted"}
        weight={isFocused ? "medium" : "normal"}
      >
        {title}
      </Text>
      <SessionSplitMenu
        canClose
        canSplit={canSplit}
        onClose={onClose}
        onSplitDown={onSplitDown}
        onSplitRight={onSplitRight}
      />
      <TitlebarIconButton
        aria-label={t("split.close")}
        cursor="default"
        onClick={onClose}
      >
        <X className={TITLEBAR_ICON_GLYPH_CLASS} />
      </TitlebarIconButton>
    </div>
  );
}
