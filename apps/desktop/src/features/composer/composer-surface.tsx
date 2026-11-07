import type { ComponentProps, ReactNode } from "react";
import { CocurdexMark } from "@/components/cocurdex-mark";
import { Text } from "@/components/ui";
import { cn } from "@/lib";

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

export function ComposerDockFrame({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "overflow-visible px-2 pb-4 @lg/chat:px-3 @3xl/chat:px-6",
        className,
      )}
    >
      <div className="relative mx-auto flex w-full max-w-[780px] flex-col gap-2 overflow-visible">
        {children}
      </div>
    </div>
  );
}

export function StageIdentity({
  mark = <CocurdexMark className="size-12" interactive />,
  title,
  description,
  children,
  label,
}: {
  mark?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  label?: string;
}) {
  return (
    <section
      aria-label={label}
      className="flex w-full flex-col items-center gap-6"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        {mark}
        {title ? (
          <Text
            as="h1"
            className="inline-flex flex-wrap items-baseline justify-center gap-x-1.5 text-balance"
            size="title"
            weight="medium"
          >
            {title}
          </Text>
        ) : null}
        {description ? (
          <Text className="max-w-md text-balance" size="body" tone="muted">
            {description}
          </Text>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function EmptyStage({
  identity,
  children,
}: {
  identity: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="@container/chat flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 @lg/chat:px-3 @3xl/chat:px-6">
        <ChatContentColumn className="my-auto py-10">
          {identity}
        </ChatContentColumn>
      </div>
      <ComposerDockFrame>{children}</ComposerDockFrame>
    </div>
  );
}
