import { ChevronDown, ChevronRight } from "lucide-react";
import { type ReactNode, useDeferredValue, useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui";
import { cn } from "@/lib";
import { useTranscriptState } from "../use-transcript-state";

export function ActivityBlock({
  busy = false,
  children,
  label,
  liveLabel,
  stateKey,
  variant,
}: {
  busy?: boolean;
  children: ReactNode;
  label: string;
  liveLabel?: ReactNode;
  stateKey: string;
  variant: "step" | "turn";
}) {
  const [open, setOpen] = useTranscriptState(stateKey, false);
  const showRows = useDeferredValue(open);
  const [keepMounted, setKeepMounted] = useState(false);
  if (showRows && !keepMounted) {
    setKeepMounted(true);
  }

  const trigger =
    variant === "turn" ? (
      <TurnTrigger
        busy={busy}
        label={label}
        liveLabel={liveLabel}
        open={open}
      />
    ) : (
      <StepTrigger
        busy={busy}
        label={label}
        liveLabel={liveLabel}
        open={open}
      />
    );

  return (
    <Collapsible
      className={cn(
        "group/activity min-w-0 max-w-3xl",
        variant === "turn" && "w-full",
        variant === "step" && "-mx-1.5",
      )}
      onOpenChange={setOpen}
      open={open}
    >
      {trigger}
      <CollapsibleContent
        className={cn(
          "flex flex-col overflow-hidden",
          variant === "turn" && "activity-timeline -mx-1.5 mt-1 mb-3 px-1.5",
          variant === "step" && "gap-1",
          variant === "step" &&
            "ms-3 -me-1.5 mt-0.5 mb-1 border-s border-chat-border-soft ps-2.5 pe-1.5",
          "transition-[opacity,transform,height,margin] duration-200 ease-[cubic-bezier(0.2,0,0,1)] [interpolate-size:allow-keywords] data-ending-style:duration-150 data-starting-style:mt-0 data-starting-style:mb-0 data-starting-style:h-0 data-starting-style:-translate-y-1 data-starting-style:opacity-0 data-ending-style:mt-0 data-ending-style:mb-0 data-ending-style:h-0 data-ending-style:opacity-0",
        )}
        keepMounted={keepMounted}
      >
        {keepMounted || showRows ? children : null}
      </CollapsibleContent>
    </Collapsible>
  );
}

function TurnTrigger({
  busy,
  label,
  liveLabel,
  open,
}: {
  busy: boolean;
  label: string;
  liveLabel?: ReactNode;
  open: boolean;
}) {
  return (
    <CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-2 border-chat-border-soft mb-3 border-b pt-0.5 pb-2 text-body transition-colors hover:text-chat-fg-secondary">
      {liveLabel ?? (
        <span
          className={cn(
            "min-w-0 truncate font-medium text-chat-fg-muted",
            busy && "activity-shimmer",
          )}
        >
          {label}
        </span>
      )}
      <ChevronDown
        className={cn(
          "size-3.5 shrink-0 text-chat-fg-muted transition-transform",
          open && "rotate-180",
        )}
      />
    </CollapsibleTrigger>
  );
}

function StepTrigger({
  busy,
  label,
  liveLabel,
  open,
}: {
  busy: boolean;
  label: string;
  liveLabel?: ReactNode;
  open: boolean;
}) {
  return (
    <CollapsibleTrigger className="flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-control px-1.5 py-1 text-left text-body text-chat-fg-muted transition-colors hover:bg-chat-surface-row-hover">
      {liveLabel ? (
        <>
          {liveLabel}
          <StepChevron open={open} />
        </>
      ) : (
        <>
          <StepChevron open={open} />
          <span
            className={cn(
              "min-w-0 truncate text-chat-fg-secondary",
              busy && "activity-shimmer",
            )}
          >
            {label}
          </span>
        </>
      )}
    </CollapsibleTrigger>
  );
}

function StepChevron({ open }: { open: boolean }) {
  return (
    <ChevronRight
      className={cn(
        "size-3.5 shrink-0 transition-transform rtl:-scale-x-100",
        open && "rotate-90",
      )}
    />
  );
}

export function ActivityLiveRow({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-1.5 flex min-w-0 max-w-3xl items-center gap-2 px-1.5 py-1 text-body">
      {children}
    </div>
  );
}
