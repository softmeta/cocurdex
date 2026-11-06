import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { Button, Text } from "@/components/ui";

export function OverviewSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <Text size="meta" tone="muted">
        {title}
      </Text>
      <div className="rounded-card bg-settings-surface px-2 py-1">
        {children}
      </div>
    </section>
  );
}

export function OverviewRow({
  title,
  detail,
  icon,
  onClick,
  sessionId,
  routineId,
}: {
  title: string;
  detail?: string | null;
  icon: ReactNode;
  onClick(): void;
  sessionId?: string;
  routineId?: string;
}) {
  return (
    <Button
      variant="ghost"
      className="h-auto w-full justify-start gap-2 py-2 text-start font-normal"
      onClick={onClick}
      data-session-id={sessionId}
      data-routine-id={routineId}
    >
      {icon}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-body">{title}</span>
        {detail ? (
          <Text className="truncate" size="meta" tone="muted">
            {detail}
          </Text>
        ) : null}
      </span>
      <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" />
    </Button>
  );
}
