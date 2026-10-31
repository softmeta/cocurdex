import type {
  AgentId,
  ContextTransferRecord,
  ContextTransferStrategy,
} from "@cocurdex/shared";

export interface ContextTransferConsumption {
  targetAgentType: AgentId;
  sourceAgentTypes: AgentId[];
  strategy: ContextTransferStrategy;
  coveredMessageCount: number;
  handoffText: string | null;
  consumedByMessageId: string;
  consumedAt: string;
}

export interface ContextTransferRepository {
  insert(record: ContextTransferRecord): void;
  listByTargetSession(sessionId: string): ContextTransferRecord[];
  findPending(sessionId: string): ContextTransferRecord | null;
  consume(id: string, consumption: ContextTransferConsumption): void;
}
