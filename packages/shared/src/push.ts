export const PUSH_PLATFORMS = ["apns", "fcm"] as const;
export type PushPlatform = (typeof PUSH_PLATFORMS)[number];

export const PUSH_ENVIRONMENTS = ["production", "sandbox"] as const;
export type PushEnvironment = (typeof PUSH_ENVIRONMENTS)[number];

export interface PushRegistration {
  platform: PushPlatform;
  token: string;
  environment: PushEnvironment;
}

export interface PushSettings {
  url: string | null;
}

export type PushSettingsUpdate = PushSettings;

export interface HostPushStatus {
  url: string | null;
}

export interface DevicePushRegistrationResult {
  registered: boolean;
}

export const PUSH_NOTIFICATION_KINDS = [
  "approval",
  "question",
  "plan",
  "turnCompleted",
  "turnFailed",
] as const;
export type PushNotificationKind = (typeof PUSH_NOTIFICATION_KINDS)[number];

export interface PushNotificationContent {
  v: 1;
  kind: PushNotificationKind;
  hostId: string;
  hostName: string;
  sessionId: string;
  sessionTitle: string;
  detail: string | null;
  requestId: string | null;
  at: string;
}

export const PUSH_SEAL_PROLOGUE = "cocurdex-push/1";
export const MAX_PUSH_PLAINTEXT_BYTES = 1536;
