import { issueAgentActivity } from "@cocurdex/shared";
import { useMemo } from "react";
import { useHostSessions } from "@/sessions";
import type { IssueActivityLookup } from "./issue-filters";

export function useIssueActivityLookup(hostId: string): IssueActivityLookup {
  const { attention } = useHostSessions(hostId);
  return useMemo(() => {
    const states = new Map(
      attention.map((snapshot) => [snapshot.sessionId, snapshot.primaryState]),
    );
    return (sessionIds) =>
      issueAgentActivity(sessionIds, (id) => states.get(id));
  }, [attention]);
}
