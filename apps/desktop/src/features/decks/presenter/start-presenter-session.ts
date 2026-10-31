import { desktopApi } from "@/lib";
import {
  type AudienceMessage,
  audienceChannelName,
} from "../audience/audience-channel";
import type { PresenterSession } from "./deck-presenter-view";

const AUDIENCE_READY_TIMEOUT_MS = 15_000;

function waitForAudienceReady(port: BroadcastChannel): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(
      () => resolve(false),
      AUDIENCE_READY_TIMEOUT_MS,
    );
    port.onmessage = (event: MessageEvent<AudienceMessage>) => {
      if (event.data.type !== "ready") return;
      window.clearTimeout(timer);
      resolve(true);
    };
  });
}

export async function startPresenterSession(): Promise<PresenterSession | null> {
  const channel = crypto.randomUUID();
  const port = new BroadcastChannel(audienceChannelName(channel));
  const ready = waitForAudienceReady(port);
  try {
    const result = await desktopApi.openPresentationWindow({ channel });
    if (!result.opened) return null;
    if (!(await ready)) {
      await desktopApi.closePresentationWindow({ channel });
      return null;
    }
    return {
      channel,
      externalDisplay: result.externalDisplay,
      startedAt: Date.now(),
    };
  } catch {
    await desktopApi.closePresentationWindow({ channel }).catch(() => {});
    return null;
  } finally {
    port.close();
  }
}
