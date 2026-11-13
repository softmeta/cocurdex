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
      <div className="flex h-5 items-center gap-2 px-1">
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
