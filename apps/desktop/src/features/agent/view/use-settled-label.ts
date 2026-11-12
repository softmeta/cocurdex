import { useEffect, useState } from "react";
import { initialSettledLabel, settleLabel } from "./settled-label";

export function useSettledLabel<T>(key: string, value: T): T {
  const [state, setState] = useState(() =>
    initialSettledLabel(key, value, Date.now()),
  );

  useEffect(() => {
    const next = settleLabel(state, key, value, Date.now());
    if (next.state !== state) {
      setState(next.state);
      return;
    }
    if (next.wakeAt === null) return;
    const timer = window.setTimeout(
      () =>
        setState(
          (current) => settleLabel(current, key, value, Date.now()).state,
        ),
      Math.max(0, next.wakeAt - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [state, key, value]);

  return state.value;
}
