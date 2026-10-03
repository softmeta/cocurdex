import type { ComponentProps } from "react";
import { lazyComponent } from "@/lib";
import type { WorkflowCanvas } from "./workflow-canvas";

export const WorkflowCanvasLazy = lazyComponent<
  ComponentProps<typeof WorkflowCanvas>
>(async () => (await import("./workflow-canvas")).WorkflowCanvas);
