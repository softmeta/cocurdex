import type { ComponentProps, ReactNode } from "react";
import { CocurdexMark } from "@/components/cocurdex-mark";
import { Text } from "@/components/ui";
import { cn } from "@/lib";

// Mode-neutral layout wrappers shared by agent chat and direct chat: the
// centered content column and the "fresh start" composer surface. Kept next to
// the composer so both modes pull them from the same shared home.
export function ChatContentColumn({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn("mx-auto w-full min-w-0 max-w-3xl", className)}
      {...props}
    />
  );
}

// Shared layout for "fresh start" composer surfaces (new-session card, empty
// pure chat, empty agent chat). Keeps the composer at the same width and the
// same vertical position across entry points so the three look identical.
export function ComposerSurface({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex min-h-full items-center justify-center px-8 pb-[12vh] pt-8",
        className,
      )}
      {...props}
    />
  );
}

export function ComposerSurfaceBody({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn("w-[clamp(32rem,64vw,46rem)] max-w-full", className)}
      {...props}
    />
  );
}

/** Centered mark + title above the welcome composer. */
export function WelcomeHeading({ children }: { children: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col items-center gap-5">
      <CocurdexMark className="size-12" interactive />
      <Text
        as="h1"
        className="inline-flex flex-wrap items-baseline justify-center gap-x-1.5 text-center text-balance"
        size="title"
        weight="medium"
      >
        {children}
      </Text>
    </div>
  );
}
