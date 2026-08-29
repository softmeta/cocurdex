import type { ReactNode } from "react";

export function SettingsGroup({
  children,
  title,
}: {
  children: ReactNode;
  title?: string;
}) {
  return (
    <div className="flex flex-col">
      {title ? (
        <div className="mb-2 px-1 text-meta font-medium uppercase tracking-wider text-muted-foreground/60">
          {title}
        </div>
      ) : null}
      <div className="rounded-card border border-border/40 bg-card/45 px-4 shadow-sm">
        <div className="flex flex-col divide-y divide-border/30">
          {children}
        </div>
      </div>
    </div>
  );
}
