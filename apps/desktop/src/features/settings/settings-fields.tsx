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
        <div className="mb-2 px-1 text-meta font-medium text-muted-foreground/60">
          {title}
        </div>
      ) : null}
      <div className="rounded-card border border-border/70 bg-card/45 px-4">
        <div className="flex flex-col divide-y divide-border/60">
          {children}
        </div>
      </div>
    </div>
  );
}

export function SettingRow({
  children,
  description,
  title,
}: {
  children?: ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <div className="flex items-center justify-between gap-6 py-3.5">
      <div className="min-w-0 flex-1">
        <div className="text-body font-medium text-foreground">{title}</div>
        {description ? (
          <div className="mt-0.5 text-body text-muted-foreground">
            {description}
          </div>
        ) : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
