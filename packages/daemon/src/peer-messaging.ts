import {
  choosePeerDelivery,
  isPeerReachable,
  type MessageRecord,
  PEER_EXCHANGE_LIMIT,
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
  peerScope?(sessionId: string): Promise<ReadonlySet<string> | null>;
}

export type PeerEnvelopeRenderer = typeof renderPeerEnvelope;

function exchangeKey(left: string, right: string) {
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

export class PeerMessagingService {
  private readonly exchanges = new Map<string, number>();

  constructor(private readonly deps: PeerMessagingDependencies) {}

  noteHumanInput(sessionId: string) {
    for (const key of this.exchanges.keys()) {
      if (key.split("|").includes(sessionId)) this.exchanges.delete(key);
    }
  }

  async listPeers(fromSessionId: string): Promise<PeerSessionSummary[]> {
    validateSessionId(fromSessionId);
    const sessions = await this.deps.listSessions();
    const scope = await this.scopeFor(fromSessionId);
    return sessions
      .filter((session) => isPeerReachable(session, fromSessionId))
      .filter((session) => !scope || scope.has(session.id))
      .map(summarizePeerSession);
  }

  async send(
    payload: SendPeerMessagePayload,
    renderEnvelope: PeerEnvelopeRenderer = renderPeerEnvelope,
  ): Promise<SendPeerMessageResult> {
    validateSessionId(payload.fromSessionId);
    validateSessionId(payload.toSessionId);
    const sender = await this.deps.getSession(payload.fromSessionId);
    if (!sender) {
      throw new Error(`Session ${payload.fromSessionId} was not found`);
    }
    const target = await this.deps.getSession(payload.toSessionId);
    const scope = await this.scopeFor(payload.fromSessionId);
    if (
      !target ||
      !isPeerReachable(target, payload.fromSessionId) ||
      (scope && !scope.has(target.id))
    ) {
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
    const key = exchangeKey(sender.id, target.id);
    const exchanges = this.exchanges.get(key) ?? 0;
    if (exchanges >= PEER_EXCHANGE_LIMIT) {
      return this.finish(payload, null, "loop_limit");
    }
    this.exchanges.set(key, exchanges + 1);
    const delivery = choosePeerDelivery({
      hasActiveTurn: this.deps.hasActiveTurn(target.id),
    });
    const message = await this.deps.sendSessionMessage({
      sessionId: target.id,
      content: renderEnvelope(origin, payload.content),
      delivery,
      origin,
    });
    return this.finish(payload, message.id, delivery);
  }

  private scopeFor(sessionId: string) {
    return this.deps.peerScope?.(sessionId) ?? Promise.resolve(null);
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
