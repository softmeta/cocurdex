import type {
  Brief,
  BriefRoutineResult,
  PersonalAgentRecord,
} from "@cocurdex/shared";

export type AssistantRow =
  | { kind: "result"; key: string; result: BriefRoutineResult }
  | { kind: "agent"; key: string; agent: PersonalAgentRecord };

export type AssistantSectionKind = "brief" | "agents";

export interface AssistantSection {
  kind: AssistantSectionKind;
  key: AssistantSectionKind;
  data: AssistantRow[];
}

export function assistantSections({
  brief,
  agents,
}: {
  brief: Brief | null;
  agents: readonly PersonalAgentRecord[];
}): AssistantSection[] {
  const sections: AssistantSection[] = [
    {
      kind: "agents",
      key: "agents",
      data: agents.map((agent) => ({
        kind: "agent",
        key: `agent-${agent.id}`,
        agent,
      })),
    },
    {
      kind: "brief",
      key: "brief",
      data: (brief?.results ?? []).map((result) => ({
        kind: "result",
        key: `result-${result.runId}`,
        result,
      })),
    },
  ];
  return sections.filter((section) => section.data.length > 0);
}
