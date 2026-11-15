export type FollowUpStatus = "pending" | "fired" | "canceled";

export const FOLLOW_UP_STATUSES = [
  "pending",
  "fired",
  "canceled",
] as const satisfies readonly FollowUpStatus[];

export const FOLLOW_UP_NOTE_MAX_LENGTH = 2000;

export interface FollowUpRecord {
  id: string;
  agentId: string;
  dueAt: string;
  note: string;
  status: FollowUpStatus;
  createdAt: string;
  firedAt: string | null;
  canceledAt: string | null;
}

export interface CreateFollowUpPayload {
  agentId: string;
  dueAt: string;
  note: string;
}
