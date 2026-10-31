import {
  type AgentToolCallRecord,
  readContextCompactionDetails,
} from "@cocurdex/shared";
import { Minimize2 } from "lucide-react";
import { Text } from "@/components/ui";
import { cn } from "@/lib";
import {
  getContextCompactionLabel,
  isContextCompactionRunning,
} from "../tool-call/context-compaction-label";

export function ContextCompactionDivider({
  toolCall,
}: {
  toolCall: AgentToolCallRecord;
}) {
  const label = getContextCompactionLabel(toolCall);
  const { error } = readContextCompactionDetails(toolCall);
  const failed = toolCall.status === "failed";

  return (
    <div
      className="flex w-full max-w-3xl min-w-0 items-center gap-3 py-1"
      title={error ?? undefined}
    >
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
      <Text
        className={cn(
          "flex shrink-0 items-center gap-1.5",
          isContextCompactionRunning(toolCall) && "activity-shimmer",
        )}
        size="meta"
        tone={failed ? "destructive" : "muted"}
      >
        <Minimize2 aria-hidden="true" className="size-3.5 shrink-0" />
        {label}
      </Text>
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
    </div>
  );
}
