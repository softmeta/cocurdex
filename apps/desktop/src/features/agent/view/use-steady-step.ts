import { useEffect, useEffectEvent, useState } from "react";
import {
  type ActivityStep,
  getActivityStepKey,
  getShownStepChangeDelay,
  type ShownStep,
} from "./chat-activity-state";

export function useSteadyStep(activeStep?: ActivityStep) {
  const [shown, setShown] = useState<ShownStep | null>(null);
  const activeKey = activeStep ? getActivityStepKey(activeStep) : null;
  const showActiveStep = useEffectEvent(() => {
    setShown(
      activeStep && activeKey
        ? { at: Date.now(), key: activeKey, step: activeStep }
        : null,
    );
  });

  useEffect(() => {
    const delay = getShownStepChangeDelay({
      activeKey,
      now: Date.now(),
      shown,
    });
    if (delay === null) {
      return;
    }

    const timer = window.setTimeout(showActiveStep, delay);
    return () => window.clearTimeout(timer);
  }, [activeKey, shown]);

  if (activeStep && shown?.key === activeKey) {
    return activeStep;
  }

  return shown?.step;
}
