import { createHash } from "node:crypto";
import {
  type AgentEvent,
  type HostIdentity,
  MAX_PUSH_PLAINTEXT_BYTES,
  type PushNotificationContent,
  type PushNotificationKind,
  type SessionRecord,
} from "@cocurdex/shared";

const MAX_TITLE_LENGTH = 120;
const MAX_DETAIL_LENGTH = 300;
const REQUEST_LIFETIME_MS = 60 * 60 * 1000;
const TURN_LIFETIME_MS = 12 * 60 * 60 * 1000;

export interface PushTrigger {
  sessionId: string;
  kind: PushNotificationKind;
  detail: string | null;
  requestId: string | null;
  at: string;
}

export function pushTriggerForEvent(
  event: AgentEvent,
  now: Date,
): PushTrigger | null {
  switch (event.type) {
    case "permission.requested":
      return {
        sessionId: event.sessionId,
        kind: "approval",
        detail: event.request.title,
        requestId: event.request.id,
        at: event.request.createdAt,
      };
    case "question.requested":
      return {
        sessionId: event.sessionId,
        kind: "question",
        detail: event.question.question,
        requestId: event.question.id,
        at: event.question.createdAt,
      };
    case "plan.approval.requested":
      return {
        sessionId: event.sessionId,
        kind: "plan",
        detail: null,
        requestId: event.approval.id,
        at: event.approval.createdAt,
      };
    case "turn.completed": {
      if (event.stopReason === "cancelled") return null;
      const completed =
        event.stopReason === undefined || event.stopReason === "end_turn";
      return {
        sessionId: event.sessionId,
        kind: completed ? "turnCompleted" : "turnFailed",
        detail: completed ? null : (event.stopReason ?? null),
        requestId: null,
        at: event.completedAt,
      };
    }
    case "state.changed":
      if (event.status !== "error") return null;
      return {
        sessionId: event.sessionId,
        kind: "turnFailed",
        detail: null,
        requestId: null,
        at: now.toISOString(),
      };
    default:
      return null;
  }
}

export function shouldNotifyForSession(session: SessionRecord) {
  return (session.sessionKind ?? "main") !== "subagent";
}

function clip(value: string | null, length: number) {
  if (value === null) return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length <= length) return trimmed;
  return `${trimmed.slice(0, length - 1)}…`;
}

const encoder = new TextEncoder();

export function encodePushContent(content: PushNotificationContent) {
  const candidates = [
    content,
    { ...content, detail: clip(content.detail, 80) },
    { ...content, detail: null, sessionTitle: clip(content.sessionTitle, 40) },
  ];
  for (const candidate of candidates) {
    const encoded = encoder.encode(JSON.stringify(candidate));
    if (encoded.length <= MAX_PUSH_PLAINTEXT_BYTES) return encoded;
  }
  throw new Error("Push content does not fit in a notification");
}

export function buildPushContent(
  trigger: PushTrigger,
  session: SessionRecord,
  host: HostIdentity,
): PushNotificationContent {
  return {
    v: 1,
    kind: trigger.kind,
    hostId: host.hostId,
    hostName: clip(host.name, MAX_TITLE_LENGTH) ?? "",
    sessionId: session.id,
    sessionTitle: clip(session.title, MAX_TITLE_LENGTH) ?? "",
    detail: clip(trigger.detail, MAX_DETAIL_LENGTH),
    requestId: trigger.requestId,
    at: trigger.at,
  };
}

const MAX_COLLAPSE_ID_LENGTH = 64;

export function pushCollapseId(trigger: PushTrigger) {
  const id = trigger.requestId ?? `${trigger.sessionId}:turn`;
  if (Buffer.byteLength(id, "utf8") <= MAX_COLLAPSE_ID_LENGTH) return id;
  return createHash("sha256").update(id, "utf8").digest("hex").slice(0, 32);
}

export function pushExpiresAt(trigger: PushTrigger, now: Date) {
  const lifetime =
    trigger.requestId === null ? TURN_LIFETIME_MS : REQUEST_LIFETIME_MS;
  return Math.floor((now.getTime() + lifetime) / 1000);
}
