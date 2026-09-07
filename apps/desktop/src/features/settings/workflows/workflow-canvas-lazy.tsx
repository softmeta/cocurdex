import { type ComponentProps, lazy, Suspense } from "react";
import { Spinner } from "@/components/ui";

const WorkflowCanvasImpl = lazy(async () => {
  const module = await import("./workflow-canvas");
  return { default: module.WorkflowCanvas };
});

export function WorkflowCanvasLazy(
  props: ComponentProps<typeof WorkflowCanvasImpl>,
) {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <Spinner />
        </div>
      }
    >
      <WorkflowCanvasImpl {...props} />
    </Suspense>
  );
}
