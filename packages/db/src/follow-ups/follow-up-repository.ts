import type { FollowUpRecord } from "@cocurdex/shared";

export interface FollowUpRepository {
  listByAgent(
    agentId: string,
    status: FollowUpRecord["status"] | null,
  ): FollowUpRecord[];
  listPending(): FollowUpRecord[];
  getById(id: string): FollowUpRecord | null;
  insert(followUp: FollowUpRecord): void;
  markFired(id: string, firedAt: string): boolean;
  cancel(id: string, canceledAt: string): boolean;
  deleteByAgent(agentId: string): void;
}
