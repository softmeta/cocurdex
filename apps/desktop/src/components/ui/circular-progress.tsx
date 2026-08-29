import { Progress as ProgressPrimitive } from "@base-ui/react/progress";
import type * as React from "react";
import { cn } from "@/lib/utils";

type CircularProgressProps = Omit<
  React.ComponentProps<typeof ProgressPrimitive.Root>,
  "children"
> & {
  indicatorClassName?: string;
  trackClassName?: string;
};

function CircularProgress({
  className,
  indicatorClassName,
  max = 100,
  trackClassName,
  value = 0,
  ...props
}: CircularProgressProps) {
  const radius = 5;
  const circumference = 2 * Math.PI * radius;
  const normalizedMax = max ?? 100;
  const normalizedValue = value ?? 0;
  const progress = Math.max(0, Math.min(normalizedMax, normalizedValue));
  const offset = circumference * (1 - progress / normalizedMax);

  return (
    <ProgressPrimitive.Root
      className={cn("inline-flex size-3.5 shrink-0 items-center", className)}
      data-slot="circular-progress"
      max={normalizedMax}
      value={normalizedValue}
      {...props}
    >
      <svg
        aria-hidden="true"
        className="size-full -rotate-90"
        viewBox="0 0 14 14"
      >
        <circle
          className={cn("text-muted", trackClassName)}
          cx="7"
          cy="7"
          fill="none"
          r={radius}
          stroke="currentColor"
          strokeWidth="2"
        />
        <circle
          className={cn(
            "transition-[stroke-dashoffset] duration-300 ease-out",
            indicatorClassName,
          )}
          cx="7"
          cy="7"
          fill="none"
          r={radius}
          stroke="currentColor"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          strokeWidth="2"
        />
      </svg>
    </ProgressPrimitive.Root>
  );
}

export { CircularProgress };
