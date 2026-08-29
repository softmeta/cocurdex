import type { AgentToolCallRecord } from "@cocurdex/shared";
import { useAtomValue } from "jotai";
import { CheckCircle2, Circle, CircleAlert, Loader2 } from "lucide-react";
import { sessionsAtom } from "@/features/sessions";
import { cn } from "@/lib";

import {
  getToolCallStatusClasses,
  getToolCallStatusLabel,
} from "./tool-call-utils";

export function ToolCallStatusIcon({
  toolCall,
  className,
}: {
  toolCall: AgentToolCallRecord;
  className?: string;
}) {
  const label = getToolCallStatusLabel(toolCall);
  const sessions = useAtomValue(sessionsAtom);
  // An interrupted turn never delivers the terminal tool event, so an in-flight
  // row keeps its last status forever. Spinning on a session that stopped reads
  // as "still working"; keep the status text and stop the motion instead.
  const isSessionRunning = sessions.some(
    (session) =>
      session.id === toolCall.sessionId && session.status === "running",
  );
  const baseClass = cn("size-3", getToolCallStatusClasses(toolCall), className);

  if (toolCall.status === "completed") {
    return <CheckCircle2 aria-label={label} className={baseClass} />;
  }

  if (toolCall.status === "failed") {
    return <CircleAlert aria-label={label} className={baseClass} />;
  }

  if (toolCall.status === "pending") {
    return <Circle aria-label={label} className={baseClass} />;
  }

  return (
    <Loader2
      aria-label={label}
      className={cn(baseClass, isSessionRunning && "animate-spin")}
    />
  );
}
