import type { ReactNode } from "react";
import { useState } from "react";
import { TranscriptStateContext } from "./use-transcript-state";

export function TranscriptStateProvider({ children }: { children: ReactNode }) {
  const [values] = useState(() => new Map<string, unknown>());
  return (
    <TranscriptStateContext value={values}>{children}</TranscriptStateContext>
  );
}
