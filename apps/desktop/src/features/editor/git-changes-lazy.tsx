import { lazyComponent } from "@/lib";
import type { GitChangesProps } from "./git-changes";

export const GitChanges = lazyComponent<GitChangesProps>(
  async () => (await import("./git-changes")).GitChanges,
);
