import { lazyComponent } from "@/lib";
import type { ExecutionTreeDialogProps } from "./execution-tree-dialog";

export const ExecutionTreeDialog = lazyComponent<ExecutionTreeDialogProps>(
  async () => (await import("./execution-tree-dialog")).ExecutionTreeDialog,
);
