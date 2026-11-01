import {
  addNotificationResponseReceivedListener,
  clearLastNotificationResponse,
  getLastNotificationResponse,
  type NotificationResponse,
  setNotificationHandler,
} from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { hosts, selectHost } from "@/hosts";

setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

type AppRouter = ReturnType<typeof useRouter>;

function sessionTarget(response: NotificationResponse) {
  const data: Record<string, unknown> =
    response.notification.request.content.data ?? {};
  const { hostId, sessionId } = data;
  if (typeof hostId !== "string" || typeof sessionId !== "string") return null;
  const paired = hosts.getSnapshot().some((host) => host.hostId === hostId);
  return paired ? { hostId, sessionId } : null;
}

function openSession(router: AppRouter, response: NotificationResponse) {
  clearLastNotificationResponse();
  const target = sessionTarget(response);
  if (!target) return;
  selectHost(target.hostId);
  router.push({ pathname: "/session/[hostId]/[sessionId]", params: target });
}

function subscribeNotificationRoutes(router: AppRouter) {
  const launched = getLastNotificationResponse();
  if (launched) openSession(router, launched);
  const subscription = addNotificationResponseReceivedListener((response) =>
    openSession(router, response),
  );
  return () => subscription.remove();
}

export function useNotificationRoutes() {
  const router = useRouter();
  useEffect(() => subscribeNotificationRoutes(router), [router]);
}
