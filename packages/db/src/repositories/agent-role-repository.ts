import type { AgentRoleRecord } from "@cocurdex/shared";

export interface AgentRoleRepository {
  list(): Promise<AgentRoleRecord[]>;
  getById(id: string): Promise<AgentRoleRecord | null>;
  upsert(role: AgentRoleRecord): Promise<void>;
  delete(id: string): Promise<void>;
}
