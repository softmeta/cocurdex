import type { ComponentProps } from "react";
import { Spinner } from "@/components/ui";
import { lazyComponent } from "@/lib";
import type { WorkflowCanvas } from "./workflow-canvas";

export const WorkflowCanvasLazy = lazyComponent<
  ComponentProps<typeof WorkflowCanvas>
>(
  async () => (await import("./workflow-canvas")).WorkflowCanvas,
  <div className="flex h-full items-center justify-center">
    <Spinner />
  </div>,
);
