import type {
  CreatePersonalAgentPayload,
  DuplicatePersonalAgentPayload,
  SaveAgentRolePayload,
  UpdatePersonalAgentPayload,
} from "@cocurdex/shared";
import { requestDaemon } from "@/lib";

export const personalApi = {
  list: () => requestDaemon("personalAgent.list"),
  ensureDefault: (name: string) =>
    requestDaemon("personalAgent.ensureDefault", { name }),
  create: (payload: CreatePersonalAgentPayload) =>
    requestDaemon("personalAgent.create", payload),
  update: (payload: UpdatePersonalAgentPayload) =>
    requestDaemon("personalAgent.update", payload),
  duplicate: (payload: DuplicatePersonalAgentPayload) =>
    requestDaemon("personalAgent.duplicate", payload),
  remove: (id: string) => requestDaemon("personalAgent.delete", { id }),
  saveRole: (payload: SaveAgentRolePayload) =>
    requestDaemon("agentRole.save", payload),
};
