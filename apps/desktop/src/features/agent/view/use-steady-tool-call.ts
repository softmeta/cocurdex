import type { AgentToolCallRecord } from "@cocurdex/shared";
import { useEffect, useEffectEvent, useState } from "react";
import {
  getShownToolCallChangeDelay,
  type ShownToolCall,
} from "./chat-activity-state";

export function useSteadyToolCall(activeToolCall?: AgentToolCallRecord) {
  const [shown, setShown] = useState<ShownToolCall | null>(null);
  const activeToolCallId = activeToolCall?.id ?? null;
  const showActiveToolCall = useEffectEvent(() => {
    setShown(
      activeToolCall ? { at: Date.now(), toolCall: activeToolCall } : null,
    );
  });

  useEffect(() => {
    const delay = getShownToolCallChangeDelay({
      activeToolCallId,
      now: Date.now(),
      shown,
    });
    if (delay === null) {
      return;
    }

    const timer = window.setTimeout(showActiveToolCall, delay);
    return () => window.clearTimeout(timer);
  }, [activeToolCallId, shown]);

  if (activeToolCall && shown?.toolCall.id === activeToolCall.id) {
    return activeToolCall;
  }

  return shown?.toolCall;
}
