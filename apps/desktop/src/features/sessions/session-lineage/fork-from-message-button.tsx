import { isChatSession } from "@cocurdex/shared";
import { useAtomValue } from "jotai";
import { selectAtom, useAtomCallback } from "jotai/utils";
import { GitFork } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui";
import { sessionsAtom } from "../session-store";
import { useForkSession } from "./use-session-lineage-actions";

export function ForkFromMessageButton({
  sessionId,
  messageId,
}: {
  sessionId: string;
  messageId: string;
}) {
  const { t } = useTranslation("sessions");
  const forkSession = useForkSession();
  const forkableAtom = useMemo(
    () =>
      selectAtom(sessionsAtom, (sessions) => {
        const session = sessions.find((item) => item.id === sessionId);
        return session ? !isChatSession(session) : false;
      }),
    [sessionId],
  );
  const forkable = useAtomValue(forkableAtom);
  const fork = useAtomCallback(
    useCallback(
      (get) => {
        const session = get(sessionsAtom).find((item) => item.id === sessionId);
        if (session) void forkSession(session, messageId);
      },
      [forkSession, messageId, sessionId],
    ),
  );
  if (!forkable) return null;
  const label = t("lineage.forkFromHere");
  return (
    <Button
      aria-label={label}
      className="size-6 text-chat-fg-muted hover:bg-transparent hover:text-chat-fg"
      onClick={fork}
      size="icon-xs"
      title={label}
      type="button"
      variant="ghost"
    >
      <GitFork className="size-3.5" />
    </Button>
  );
}
