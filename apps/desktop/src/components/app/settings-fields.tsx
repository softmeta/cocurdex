import type { ComponentProps, ReactNode } from "react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";

export function SettingsGroup({
  action,
  children,
  description,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  description?: string;
  title?: string;
}) {
  const hasHeader = Boolean(title || description || action);
  return (
    <div className="flex flex-col">
      {hasHeader ? (
        <div className="mb-2 flex items-end justify-between gap-4 px-1">
          <div className="flex min-w-0 flex-col gap-0.5">
            {title ? (
              <div className="text-meta font-medium text-muted-foreground/60">
                {title}
              </div>
            ) : null}
            {description ? (
              <div className="text-meta text-muted-foreground">
                {description}
              </div>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      <div className="flex flex-col divide-y divide-border/40 rounded-card bg-settings-surface px-4">
        {children}
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

export function SettingNumberInput({
  onCommit,
  unit,
  ...props
}: Omit<ComponentProps<"input">, "className" | "onBlur" | "onKeyDown"> & {
  onCommit: () => void;
  unit?: string;
}) {
  return (
    <InputGroup className="w-24">
      <InputGroupInput
        {...props}
        className="tabular-nums"
        onBlur={onCommit}
        onKeyDown={(event) => {
          if (event.key === "Enter") onCommit();
        }}
      />
      {unit ? (
        <InputGroupAddon align="inline-end">
          <InputGroupText>{unit}</InputGroupText>
        </InputGroupAddon>
      ) : null}
    </InputGroup>
  );
}
