import { RESPONSE_STALL_MS } from "@cocurdex/client-runtime";
import { useEffect, useState } from "react";

export function useResponseStall(streamKey: string | null) {
  const [stalledKey, setStalledKey] = useState<string | null>(null);

  useEffect(() => {
    if (streamKey === null) return;
    const timer = setTimeout(() => setStalledKey(streamKey), RESPONSE_STALL_MS);
    return () => clearTimeout(timer);
  }, [streamKey]);

  return streamKey !== null && stalledKey === streamKey;
}
