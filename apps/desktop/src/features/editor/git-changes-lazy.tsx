import { lazy, Suspense } from "react";
import type { GitChangesProps } from "./git-changes";

// The diff renderer (@pierre/diffs + its tree host) is only reachable through
// the git view in the right panel, so it loads when that view is first opened
// instead of at startup.
const LazyGitChanges = lazy(async () => ({
  default: (await import("./git-changes")).GitChanges,
}));

export function GitChanges(props: GitChangesProps) {
  return (
    <Suspense fallback={null}>
      <LazyGitChanges {...props} />
    </Suspense>
  );
}
