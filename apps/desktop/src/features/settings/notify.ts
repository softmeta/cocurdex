import type { PushNotificationKind } from "@cocurdex/shared";
import type { TFunction } from "i18next";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { onDaemonAlert } from "@/lib";
import type { NotificationSettings } from "./notifications";

// Show a native OS notification. In Electron the renderer Notification API is
// routed to the platform's notification center, so no main-process IPC needed.
export function showCompletionNotification(title: string, body: string) {
  if (typeof Notification === "undefined") {
    return;
  }

  const fire = () => {
    try {
      new Notification(title, { body });
    } catch {
      // Ignore platform failures; the notification is best-effort.
    }
  };

  if (Notification.permission === "granted") {
    fire();
    return;
  }

  if (Notification.permission === "denied") {
    return;
  }

  void Notification.requestPermission().then((permission) => {
    if (permission === "granted") {
      fire();
    }
  });
}

let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }

  const AudioContextCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  if (!AudioContextCtor) {
    return null;
  }

  if (!sharedAudioContext) {
    sharedAudioContext = new AudioContextCtor();
  }

  return sharedAudioContext;
}

// Synthesize a short two-note chime via Web Audio so we ship no binary asset.
export function playCompletionSound() {
  const audioContext = getAudioContext();

  if (!audioContext) {
    return;
  }

  void audioContext.resume();

  const now = audioContext.currentTime;
  const notes = [
    { frequency: 880, start: 0 },
    { frequency: 1320, start: 0.12 },
  ];

  for (const note of notes) {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const startAt = now + note.start;

    oscillator.type = "sine";
    oscillator.frequency.value = note.frequency;
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.15, startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.18);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + 0.2);
  }
}

function alertCopy(kind: PushNotificationKind, t: TFunction<"settings">) {
  switch (kind) {
    case "approval":
      return {
        title: t("notifications.permission.title"),
        body: t("notifications.permission.body"),
      };
    case "question":
      return {
        title: t("notifications.question.title"),
        body: t("notifications.question.body"),
      };
    case "plan":
      return {
        title: t("notifications.plan.title"),
        body: t("notifications.plan.body"),
      };
    case "turnCompleted":
      return {
        title: t("notifications.completed.title"),
        body: t("notifications.completed.body"),
      };
    case "turnFailed":
      return {
        title: t("notifications.failed.title"),
        body: t("notifications.failed.body"),
      };
  }
}

export function useCompletionNotifier(settings: NotificationSettings) {
  const { t } = useTranslation("settings");
  const settingsRef = useRef(settings);
  const translateRef = useRef(t);

  settingsRef.current = settings;
  translateRef.current = t;

  useEffect(
    () =>
      onDaemonAlert((alert) => {
        const current = settingsRef.current;
        const translate = translateRef.current;
        const copy = alertCopy(alert.kind, translate);
        if (current.systemNotifications) {
          showCompletionNotification(
            copy.title,
            alert.detail ?? (alert.title || copy.body),
          );
        }
        if (alert.kind === "turnCompleted" && current.completionSound) {
          playCompletionSound();
        }
      }),
    [],
  );
}
