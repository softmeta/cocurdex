import type { CocurdexDaemonEvent } from "@cocurdex/shared";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect } from "react";
import { hostConnection } from "@/connection";
import { revalidateAssistant } from "./assistant-queries";

const REFRESH_DELAY_MS = 250;
const WATCHED_AREAS = ["routines", "personal"];
const WATCHED_EVENTS = new Set<CocurdexDaemonEvent["type"]>([
  "session.upserted",
  "state.changed",
  "turn.completed",
  "permission.requested",
  "permission.resolved",
  "question.requested",
  "question.resolved",
  "plan.approval.requested",
  "plan.approval.resolved",
]);

function watched(event: CocurdexDaemonEvent) {
  if (event.type === "data.changed") {
    return event.areas.some((area) => WATCHED_AREAS.includes(area));
  }
  return WATCHED_EVENTS.has(event.type);
}

function subscribeAssistantChanges(hostId: string) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const connection = hostConnection(hostId);
  const refresh = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void revalidateAssistant(hostId);
    }, REFRESH_DELAY_MS);
  };
  const stopEvents = connection.onEvent((event) => {
    if (watched(event)) refresh();
  });
  const stopState = connection.subscribeState((state) => {
    if (state.status === "live") refresh();
  });
  return () => {
    if (timer) clearTimeout(timer);
    stopEvents();
    stopState();
  };
}

export function useAssistantRevalidation(hostId: string) {
  useEffect(() => subscribeAssistantChanges(hostId), [hostId]);
  useFocusEffect(
    useCallback(() => {
      void revalidateAssistant(hostId);
    }, [hostId]),
  );
}
