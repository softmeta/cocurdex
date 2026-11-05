import type {
  Brief,
  BriefRoutineResult,
  InboxItem,
  PersonalAgentRecord,
} from "@cocurdex/shared";

export type AssistantRow =
  | { kind: "result"; key: string; result: BriefRoutineResult }
  | { kind: "inbox"; key: string; item: InboxItem }
  | { kind: "agent"; key: string; agent: PersonalAgentRecord };

export type AssistantSectionKind = "brief" | "inbox" | "agents";

export interface AssistantSection {
  kind: AssistantSectionKind;
  key: AssistantSectionKind;
  data: AssistantRow[];
}

export function assistantSections({
  brief,
  inbox,
  agents,
}: {
  brief: Brief | null;
  inbox: readonly InboxItem[];
  agents: readonly PersonalAgentRecord[];
}): AssistantSection[] {
  const sections: AssistantSection[] = [
    {
      kind: "brief",
      key: "brief",
      data: (brief?.results ?? []).map((result) => ({
        kind: "result",
        key: `result-${result.runId}`,
        result,
      })),
    },
    {
      kind: "inbox",
      key: "inbox",
      data: inbox.map((item) => ({
        kind: "inbox",
        key: `inbox-${item.id}`,
        item,
      })),
    },
    {
      kind: "agents",
      key: "agents",
      data: agents.map((agent) => ({
        kind: "agent",
        key: `agent-${agent.id}`,
        agent,
      })),
    },
  ];
  return sections.filter((section) => section.data.length > 0);
}
