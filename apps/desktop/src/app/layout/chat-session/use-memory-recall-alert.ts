import { useEffect, useRef } from "react";
import { toast } from "sonner";

export interface MemoryRecallAlert {
  key: string;
  message: string;
}

export function useMemoryRecallAlert(alert: MemoryRecallAlert | null) {
  const reported = useRef<string | null>(null);
  const key = alert?.key ?? null;
  const message = alert?.message ?? null;

  useEffect(() => {
    if (!key || !message) {
      reported.current = null;
      return;
    }
    if (reported.current === key) return;
    reported.current = key;
    toast.warning(message);
  }, [key, message]);
}
