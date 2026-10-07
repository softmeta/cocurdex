import { useState } from "react";
import type { CocurdexMarkMotion } from "@/components/cocurdex-mark";
import type { ActivityState } from "./chat-activity-state";

export function useActivityMotion(activity: ActivityState) {
  const { toolActivityId } = activity;
  const isUsingTools = activity.kind === "usingTools";
  const [cycle, setCycle] = useState({
    toolActivityId,
    working: isUsingTools,
  });

  if (cycle.toolActivityId !== toolActivityId) {
    setCycle({ toolActivityId, working: toolActivityId !== undefined });
  }

  let motion: CocurdexMarkMotion = "thinking";
  if (isUsingTools || cycle.working) {
    motion = "working";
  } else if (activity.kind === "responding") {
    motion = "replying";
  }

  function completeWorkingCycle() {
    if (!isUsingTools) {
      setCycle((current) => ({ ...current, working: false }));
    }
  }

  return { completeWorkingCycle, motion };
}
