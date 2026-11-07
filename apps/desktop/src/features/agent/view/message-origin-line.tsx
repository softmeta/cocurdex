import type { MessageOrigin } from "@cocurdex/shared";
import { useSetAtom } from "jotai";
import { ArrowUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { selectSessionAtom } from "@/features/sessions";
import { messageOriginLabel } from "./message-origin-label";

function originSessionId(origin: MessageOrigin) {
  if (origin.kind === "routine") return origin.sessionId ?? null;
  return null;
}

export function MessageOriginLine({ origin }: { origin: MessageOrigin }) {
  const { t } = useTranslation("agent");
  const selectSession = useSetAtom(selectSessionAtom);
  const label = messageOriginLabel(t, origin);
  const sessionId = originSessionId(origin);

  if (!label) return null;
  if (!sessionId) {
    return (
      <div className="mb-1.5 text-meta font-medium text-chat-fg-secondary">
        {label}
      </div>
    );
  }

  return (
    <button
      className="group/origin mb-1.5 flex max-w-full items-center gap-1 rounded-dense text-meta font-medium text-chat-fg-secondary hover:text-chat-fg"
      data-origin-session-id={sessionId}
      onClick={() => selectSession(sessionId)}
      type="button"
    >
      <span className="min-w-0 truncate">{label}</span>
      <ArrowUpRight className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover/origin:opacity-100 group-focus-visible/origin:opacity-100" />
    </button>
  );
}
