import {
  choosePeerDelivery,
  isPeerReachable,
  type MessageRecord,
  type PeerMessageEvent,
  type PeerSessionSummary,
  renderPeerEnvelope,
  type SendPeerMessagePayload,
  type SendPeerMessageResult,
  type SendSessionCommand,
  type SessionRecord,
  summarizePeerSession,
  validateSessionId,
} from "@cocurdex/shared";

export interface PeerMessagingDependencies {
  getSession(sessionId: string): Promise<SessionRecord | null>;
  listSessions(): Promise<SessionRecord[]>;
  hasActiveTurn(sessionId: string): boolean;
  sendSessionMessage(command: SendSessionCommand): Promise<MessageRecord>;
  broadcast(event: PeerMessageEvent): void;
}

export class PeerMessagingService {
  constructor(private readonly deps: PeerMessagingDependencies) {}

  async listPeers(fromSessionId: string): Promise<PeerSessionSummary[]> {
    validateSessionId(fromSessionId);
    const sessions = await this.deps.listSessions();
    return sessions
      .filter((session) => isPeerReachable(session, fromSessionId))
      .map(summarizePeerSession);
  }

  async send(payload: SendPeerMessagePayload): Promise<SendPeerMessageResult> {
    validateSessionId(payload.fromSessionId);
    validateSessionId(payload.toSessionId);
    const sender = await this.deps.getSession(payload.fromSessionId);
    if (!sender) {
      throw new Error(`Session ${payload.fromSessionId} was not found`);
    }
    const target = await this.deps.getSession(payload.toSessionId);
    if (!target || !isPeerReachable(target, payload.fromSessionId)) {
      throw new Error(`Session ${payload.toSessionId} is not reachable`);
    }
    const origin = {
      kind: "peer" as const,
      sessionId: sender.id,
      sessionTitle: sender.title,
    };
    if (target.peerInbound === "refuse") {
      return this.finish(payload, null, "refused");
    }
    const delivery = choosePeerDelivery({
      hasActiveTurn: this.deps.hasActiveTurn(target.id),
    });
    const message = await this.deps.sendSessionMessage({
      sessionId: target.id,
      content: renderPeerEnvelope(origin, payload.content),
      delivery,
      origin,
    });
    return this.finish(payload, message.id, delivery);
  }

  private finish(
    payload: SendPeerMessagePayload,
    messageId: string | null,
    delivery: SendPeerMessageResult["delivery"],
  ): SendPeerMessageResult {
    this.deps.broadcast({
      type: "peer.message",
      fromSessionId: payload.fromSessionId,
      toSessionId: payload.toSessionId,
      messageId,
      delivery,
    });
    return { messageId, delivery };
  }
}
