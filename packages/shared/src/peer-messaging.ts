import type {
  AgentInputDelivery,
  MessageOrigin,
  SessionRecord,
  SessionStatus,
} from "./contracts";

export type PeerInboundPolicy = "deliver" | "refuse";
export type PeerMessageDelivery = Extract<
  AgentInputDelivery,
  "start-new-run" | "queue-after-run"
>;
export type PeerMessageOutcome = PeerMessageDelivery | "refused" | "loop_limit";

export const PEER_EXCHANGE_LIMIT = 12;

export interface PeerSessionSummary {
  sessionId: string;
  title: string;
  agentType: SessionRecord["agentType"];
  status: SessionStatus;
  workspaceId: string;
}

export interface SendPeerMessagePayload {
  fromSessionId: string;
  toSessionId: string;
  content: string;
}

export interface SendPeerMessageResult {
  messageId: string | null;
  delivery: PeerMessageOutcome;
}

export interface PeerMessageEvent {
  type: "peer.message";
  fromSessionId: string;
  toSessionId: string;
  messageId: string | null;
  delivery: PeerMessageOutcome;
}

export function choosePeerDelivery(target: {
  hasActiveTurn: boolean;
}): PeerMessageDelivery {
  return target.hasActiveTurn ? "queue-after-run" : "start-new-run";
}

export function renderPeerEnvelope(origin: MessageOrigin, content: string) {
  return `[Message from session "${origin.sessionTitle}" (${origin.sessionId})]\n${content}`;
}

export function isPeerReachable(
  session: Pick<SessionRecord, "id" | "archivedAt" | "sessionKind">,
  fromSessionId: string,
) {
  if (session.id === fromSessionId) return false;
  if (session.archivedAt) return false;
  return (session.sessionKind ?? "main") !== "subagent";
}

export function summarizePeerSession(
  session: SessionRecord,
): PeerSessionSummary {
  return {
    sessionId: session.id,
    title: session.title,
    agentType: session.agentType,
    status: session.status,
    workspaceId: session.workspaceId,
  };
}

export function stripPeerEnvelope(content: string) {
  return content.replace(/^\[[^\n]*\](?:\n|$)/, "");
}
