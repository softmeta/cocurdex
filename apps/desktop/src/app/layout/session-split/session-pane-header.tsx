import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/ui";
import { AgentRoleAvatar } from "@/features/sessions";
import { cn } from "@/lib";
import { TitlebarIconButton } from "../titlebar-icon-button";
import { PersonaTitle } from "./persona-title";
import { SessionSplitMenu } from "./session-split-menu";
import { usePersonaPaneRole } from "./use-persona-pane-role";

interface SessionPaneHeaderProps {
  canClose: boolean;
  isFocused: boolean;
  occupiesTitlebar?: boolean;
  floatingPersona?: boolean;
  endInset?: number | string;
  startInset?: number;
  paneId: string;
  sessionId?: string | null;
  title: string;
  /** Chrome owned by the surrounding shell, rendered inside this row. */
  leading?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  onOpenAssistantOverview?(): void;
  onClose?(): void;
  onCloseAll?(): void;
  onSplitDown(): void;
  onSplitRight(): void;
}

export function SessionPaneHeader({
  canClose,
  isFocused,
  occupiesTitlebar = false,
  floatingPersona = false,
  endInset = 0,
  startInset = 0,
  paneId,
  sessionId,
  title,
  leading,
  trailing,
  className,
  onOpenAssistantOverview,
  onClose,
  onCloseAll,
  onSplitDown,
  onSplitRight,
}: SessionPaneHeaderProps) {
  const { t } = useTranslation("sessions");
  const personaRole = usePersonaPaneRole(sessionId);
  const insetStyle = {
    paddingInlineStart: startInset || undefined,
    paddingInlineEnd: endInset || undefined,
  };

  if (personaRole && floatingPersona) {
    return (
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 z-10 flex h-8 items-center",
          className,
        )}
        style={insetStyle}
      >
        <div className="absolute inset-x-0 top-0 h-20 bg-linear-to-b from-chat-canvas via-chat-canvas/85 to-transparent" />
        {leading ? (
          <div className="pointer-events-auto relative">{leading}</div>
        ) : null}
        <div className="absolute inset-x-0 top-1.5 flex justify-center">
          <PersonaTitle
            onOpenOverview={onOpenAssistantOverview}
            role={personaRole}
          />
        </div>
        <div className="min-w-0 flex-1" />
        {trailing ? (
          <div className="pointer-events-auto relative">{trailing}</div>
        ) : null}
      </div>
    );
  }

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
      style={insetStyle}
    >
      {leading}
      {personaRole ? null : (
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
              <X className="size-3.5" />
            </TitlebarIconButton>
          ) : null}
        </div>
      )}
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {personaRole ? (
          <AgentRoleAvatar role={personaRole} showAgent={false} size="sm" />
        ) : null}
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
