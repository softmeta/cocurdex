import type { PushNotificationKind } from "./push";

export interface AlertEvent {
  type: "alert";
  sessionId: string;
  kind: PushNotificationKind;
  title: string;
  detail: string | null;
  at: string;
}
