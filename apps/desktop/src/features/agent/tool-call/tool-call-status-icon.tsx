import type { AgentToolCallRecord } from "@cocurdex/shared";
import {
  CheckCircle2,
  Circle,
  CircleAlert,
  CircleStop,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib";

import {
  getToolCallStatusClasses,
  getToolCallStatusLabel,
} from "./tool-call-utils";
import { useToolCallDisplayStatus } from "./use-tool-call-display-status";

export function ToolCallStatusIcon({
  toolCall,
  className,
}: {
  toolCall: AgentToolCallRecord;
  className?: string;
}) {
  const status = useToolCallDisplayStatus(toolCall);
  const label = getToolCallStatusLabel(status);
  const baseClass = cn("size-3.5", getToolCallStatusClasses(status), className);

  if (status === "completed") {
    return <CheckCircle2 aria-label={label} className={baseClass} />;
  }

  if (status === "failed") {
    return <CircleAlert aria-label={label} className={baseClass} />;
  }

  if (status === "pending") {
    return <Circle aria-label={label} className={baseClass} />;
  }

  if (status === "interrupted") {
    return <CircleStop aria-label={label} className={baseClass} />;
  }

  return (
    <Loader2 aria-label={label} className={cn(baseClass, "animate-spin")} />
  );
}
