import { lazyComponent } from "@/lib";
import type { GitChangesProps } from "./git-changes";

// The diff renderer (@pierre/diffs + its tree host) is only reachable through
// the git view in the right panel, so it loads when that view is first opened
// instead of at startup.
export const GitChanges = lazyComponent<GitChangesProps>(
  async () => (await import("./git-changes")).GitChanges,
);
