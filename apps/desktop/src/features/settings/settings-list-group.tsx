import type { ReactNode } from "react";
import { Text } from "@/components/ui";

export function SettingsListGroup({
  badge,
  children,
  count,
  label,
}: {
  badge?: ReactNode;
  children: ReactNode;
  count?: number;
  label: string;
}) {
  return (
    <section aria-label={label} className="flex flex-col gap-2">
      <div
        className="sticky top-0 z-10 flex h-5 items-center gap-2 bg-app px-1"
        data-window-sticky=""
      >
        <Text size="meta" tone="muted" weight="medium">
          {label}
        </Text>
        {count === undefined ? null : (
          <Text className="tabular-nums" size="meta" tone="muted">
            {count}
          </Text>
        )}
        {badge}
      </div>
      {children}
    </section>
  );
}
