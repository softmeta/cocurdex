import type { CreateSessionPayload } from "@cocurdex/shared";
import useSWR from "swr";
import { hostConnection } from "@/connection";
import type { NewSessionDraft } from "./new-session-draft";

const DAEMON_READ = { dedupingInterval: 0 };

function newSessionPayload(
  workspaceId: string,
  draft: NewSessionDraft,
): CreateSessionPayload {
  return {
    workspaceId,
    agentType: draft.agentType,
    model: draft.model,
    permissionMode: draft.permissionMode,
    agentRoleId: draft.roleId,
  };
}

export function useNewSessionDefaults(
  hostId: string,
  workspaceId: string | null,
  draft: NewSessionDraft,
) {
  return useSWR(
    workspaceId
      ? ([
          "session.resolveNew",
          hostId,
          newSessionPayload(workspaceId, draft),
        ] as const)
      : null,
    ([method, host, payload]) => hostConnection(host).request(method, payload),
    { ...DAEMON_READ, keepPreviousData: true },
  );
}
