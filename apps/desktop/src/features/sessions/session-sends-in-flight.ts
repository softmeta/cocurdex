import type { SessionRecord } from "@cocurdex/shared";

export type SessionSendsInFlight = Readonly<Record<string, number>>;

export function beginSessionSend(
  sends: SessionSendsInFlight,
  sessionId: string,
): SessionSendsInFlight {
  return { ...sends, [sessionId]: (sends[sessionId] ?? 0) + 1 };
}

export function settleSessionSend(
  sends: SessionSendsInFlight,
  sessionId: string,
): SessionSendsInFlight {
  const remaining = (sends[sessionId] ?? 0) - 1;
  if (remaining > 0) return { ...sends, [sessionId]: remaining };
  const { [sessionId]: _settled, ...rest } = sends;
  return rest;
}

export function keepSendingSessionsRunning(
  incoming: SessionRecord[],
  current: SessionRecord[],
  sends: SessionSendsInFlight,
): SessionRecord[] {
  const runningLocally = new Set(
    current
      .filter((session) => session.status === "running" && sends[session.id])
      .map((session) => session.id),
  );
  if (runningLocally.size === 0) return [...incoming];
  return incoming.map((session) =>
    runningLocally.has(session.id) && session.status !== "running"
      ? { ...session, status: "running" }
      : session,
  );
}
