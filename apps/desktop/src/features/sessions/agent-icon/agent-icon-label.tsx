import type { AgentId } from "@cocurdex/shared";
import type { ReactNode } from "react";
import { cn } from "@/lib";
import { AgentIcon } from "./agent-icon";

export function AgentIconLabel({
  agentId,
  children,
  className,
}: {
  agentId: AgentId;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <AgentIcon agentId={agentId} className="size-3.5" />
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}
