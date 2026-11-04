import { useEffect } from "react";
import { reachPairedHost } from "./paired-host-reach";

const APPROVAL_POLL_MS = 5_000;

export function useApprovalPoll(onSettled: () => void) {
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      const failure = await reachPairedHost();
      if (stopped) return;
      if (failure === "pending") {
        timer = setTimeout(() => void poll(), APPROVAL_POLL_MS);
        return;
      }
      onSettled();
    };
    timer = setTimeout(() => void poll(), APPROVAL_POLL_MS);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [onSettled]);
}
