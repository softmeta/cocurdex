import { X } from "lucide-react";
import type { ReactNode } from "react";
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
  endInset?: number;
  startInset?: number;
  paneId: string;
  title: string;
  /** Chrome owned by the surrounding shell, rendered inside this row. */
  leading?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  onClose?(): void;
  onCloseAll?(): void;
  onSplitDown(): void;
  onSplitRight(): void;
}

export function SessionPaneHeader({
  canClose,
  isFocused,
  occupiesTitlebar = false,
  endInset = 0,
  startInset = 0,
  paneId,
  title,
  leading,
  trailing,
  className,
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
      className={cn(
        "flex h-8 shrink-0 items-center gap-1 ps-2 pe-2",
        surfaceClass,
        className,
      )}
      style={{
        paddingInlineStart: startInset || undefined,
        paddingInlineEnd: endInset || undefined,
      }}
    >
      {leading}
      <div
        className={cn(
          "flex items-center gap-1",
          occupiesTitlebar && "relative z-[60]",
        )}
      >
        <SessionSplitMenu
          canClose={canClose}
          paneId={paneId}
          onClose={onClose}
          onCloseAll={onCloseAll}
          onSplitDown={onSplitDown}
          onSplitRight={onSplitRight}
        />
        {canClose && onClose ? (
          <TitlebarIconButton
            aria-label={t("split.close")}
            cursor="default"
            onClick={onClose}
          >
            <X className={TITLEBAR_ICON_GLYPH_CLASS} />
          </TitlebarIconButton>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-1">
        {title ? (
          <Text
            className="truncate"
            size="meta"
            tone={isFocused ? "default" : "muted"}
            weight={isFocused ? "medium" : "normal"}
          >
            {title}
          </Text>
        ) : null}
      </div>
      {trailing}
    </div>
  );
}
