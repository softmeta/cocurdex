import { Progress as ProgressPrimitive } from "@base-ui/react/progress";
import type * as React from "react";
import { cn } from "@/lib/utils";

function Progress({
  className,
  children,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      className={cn("flex flex-wrap gap-3", className)}
      data-slot="progress"
      value={value}
      {...props}
    >
      {children}
      <ProgressTrack>
        <ProgressIndicator />
      </ProgressTrack>
    </ProgressPrimitive.Root>
  );
}

function ProgressTrack({
  className,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Track>) {
  return (
    <ProgressPrimitive.Track
      className={cn(
        "relative flex h-1 w-full items-center overflow-x-hidden rounded-full bg-muted",
        className,
      )}
      data-slot="progress-track"
      {...props}
    />
  );
}

function ProgressIndicator({
  className,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Indicator>) {
  return (
    <ProgressPrimitive.Indicator
      className={cn("h-full bg-primary transition-all", className)}
      data-slot="progress-indicator"
      {...props}
    />
  );
}

function ProgressLabel({
  className,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Label>) {
  return (
    <ProgressPrimitive.Label
      className={cn("text-sm font-medium", className)}
      data-slot="progress-label"
      {...props}
    />
  );
}

function ProgressValue({
  className,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Value>) {
  return (
    <ProgressPrimitive.Value
      className={cn(
        "ms-auto text-sm text-muted-foreground tabular-nums",
        className,
      )}
      data-slot="progress-value"
      {...props}
    />
  );
}

export {
  Progress,
  ProgressIndicator,
  ProgressLabel,
  ProgressTrack,
  ProgressValue,
};
