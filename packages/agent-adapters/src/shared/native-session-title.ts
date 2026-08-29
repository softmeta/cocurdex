import type { AgentEvent } from "@cocurdex/shared";

interface NativeSessionTitleTrackerOptions {
  initialTitle: string | null;
  isUsableTitle?: (title: string) => boolean;
  now?: () => string;
  onEvent: (event: AgentEvent) => void;
  sessionId: string;
}

export function createNativeSessionTitleTracker({
  initialTitle,
  isUsableTitle = () => true,
  now = () => new Date().toISOString(),
  onEvent,
  sessionId,
}: NativeSessionTitleTrackerOptions) {
  let expectedTitle = initialTitle;

  return (nextTitle: unknown) => {
    if (expectedTitle === null || typeof nextTitle !== "string") {
      return false;
    }

    const title = nextTitle.trim();
    if (!title || title === expectedTitle || !isUsableTitle(title)) {
      return false;
    }

    onEvent({
      type: "session.title.updated",
      sessionId,
      title,
      expectedTitle,
      updatedAt: now(),
    });
    expectedTitle = title;
    return true;
  };
}
