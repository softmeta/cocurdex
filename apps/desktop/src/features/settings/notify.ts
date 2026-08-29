import type { SessionStatus } from "@cocurdex/shared";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { desktopApi } from "@/lib";
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

// React to agent runs finishing (a per-session running -> idle transition) and
// fire the notification / sound the user enabled. This is the legitimate
// "sync with an external system" Effect case (OS notifications + Web Audio).
export function useCompletionNotifier(settings: NotificationSettings) {
  const { t } = useTranslation("settings");
  const settingsRef = useRef(settings);
  const translateRef = useRef(t);
  const previousStatusRef = useRef(new Map<string, SessionStatus>());

  settingsRef.current = settings;
  translateRef.current = t;

  useEffect(() => {
    const previousStatus = previousStatusRef.current;

    return desktopApi.onAgentEvent((event) => {
      const current = settingsRef.current;
      const translate = translateRef.current;

      // Agent needs human interaction (permission approval or a question).
      // These only surface as a system notification, never as the sound.
      if (event.type === "permission.requested") {
        if (current.systemNotifications) {
          showCompletionNotification(
            translate("notifications.permission.title"),
            translate("notifications.permission.body"),
          );
        }
        return;
      }

      if (event.type === "question.requested") {
        if (current.systemNotifications) {
          showCompletionNotification(
            translate("notifications.question.title"),
            translate("notifications.question.body"),
          );
        }
        return;
      }

      if (event.type !== "state.changed") {
        return;
      }

      const prior = previousStatus.get(event.sessionId);
      previousStatus.set(event.sessionId, event.status);

      const justCompleted = prior === "running" && event.status === "idle";

      if (!justCompleted) {
        return;
      }

      if (current.systemNotifications) {
        showCompletionNotification(
          translate("notifications.completed.title"),
          translate("notifications.completed.body"),
        );
      }

      if (current.completionSound) {
        playCompletionSound();
      }
    });
  }, []);
}
