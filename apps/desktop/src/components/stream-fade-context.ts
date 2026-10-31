import { createContext } from "react";
import type { StreamFadeBlockPlugins } from "./markdown-stream-fade";

export const StreamFadeContext = createContext<StreamFadeBlockPlugins | null>(
  null,
);
