import { cn } from "@/lib";

export function composerSendButtonClassName(canSend: boolean) {
  if (!canSend) {
    return "size-8 rounded-full bg-chat-surface-disabled text-chat-fg-muted transition-colors hover:bg-chat-surface-disabled";
  }
  return "size-8 rounded-full bg-chat-fg text-chat-canvas transition-colors hover:bg-chat-fg-secondary";
}

export function composerStopButtonClassName() {
  return composerSendButtonClassName(true);
}

export function composerStopGlyphClassName() {
  return "size-2.5 rounded-micro bg-current";
}

export function composerFooterControlClassName(className?: string) {
  return cn(
    "h-7 min-w-0 shrink items-center gap-1.5 px-1.5 text-body font-normal text-inherit shadow-none",
    className,
  );
}
