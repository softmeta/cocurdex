import type { AgentToolCallRecord } from "@cocurdex/shared";
import {
  Bot,
  FilePen,
  FileText,
  Globe,
  type LucideIcon,
  Search,
  Sparkles,
  SquareTerminal,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib";
import { type ActivityAction, getActivityAction } from "./tool-call-action";
import { ToolCallStatusIcon } from "./tool-call-status-icon";
import { useToolCallDisplayStatus } from "./use-tool-call-display-status";

const ACTION_ICONS: Record<ActivityAction, LucideIcon> = {
  command: SquareTerminal,
  edit: FilePen,
  fetch: Globe,
  other: Wrench,
  read: FileText,
  search: Search,
  skill: Sparkles,
  subagent: Bot,
};

export function ToolCallRowIcon({
  className,
  toolCall,
}: {
  className?: string;
  toolCall: AgentToolCallRecord;
}) {
  const status = useToolCallDisplayStatus(toolCall);
  if (status !== "completed") {
    return <ToolCallStatusIcon className={className} toolCall={toolCall} />;
  }
  const Icon = ACTION_ICONS[getActivityAction(toolCall)];
  return (
    <Icon
      aria-hidden
      className={cn("size-3.5 text-chat-fg-muted", className)}
    />
  );
}
