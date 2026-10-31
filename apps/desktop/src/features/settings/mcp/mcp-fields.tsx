import { Plus, X } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button, IconButton, Input, Label, Text } from "@/components/ui";
import { cn } from "@/lib";
import { createKeyValueRow, type McpKeyValueRow } from "./mcp-server-form";

export function McpInput({
  className,
  ...props
}: ComponentProps<typeof Input>) {
  return (
    <Input
      className={cn(
        "h-7 min-w-0 rounded-control border-border/70 bg-background/60 text-body shadow-none focus-visible:border-ring/60 focus-visible:ring-2 focus-visible:ring-ring/20",
        className,
      )}
      {...props}
    />
  );
}

export function McpField({
  children,
  hint,
  label,
}: {
  children: ReactNode;
  hint?: string;
  label: string;
}) {
  return (
    <Label className="grid gap-1.5">
      <Text size="meta" tone="muted" weight="medium">
        {label}
      </Text>
      {children}
      {hint ? (
        <Text size="meta" tone="subtle">
          {hint}
        </Text>
      ) : null}
    </Label>
  );
}

export function McpKeyValueEditor({
  addLabel,
  disabled,
  keyPlaceholder,
  label,
  rows,
  valuePlaceholder,
  onChange,
}: {
  addLabel: string;
  disabled: boolean;
  keyPlaceholder: string;
  label: string;
  rows: McpKeyValueRow[];
  valuePlaceholder: string;
  onChange(rows: McpKeyValueRow[]): void;
}) {
  const { t } = useTranslation("settings");
  const updateRow = (id: string, patch: Partial<McpKeyValueRow>) =>
    onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  return (
    <fieldset aria-label={label} className="grid gap-1.5">
      <div className="flex h-6 items-center justify-between gap-2">
        <Text size="meta" tone="muted" weight="medium">
          {label}
        </Text>
        {disabled ? null : (
          <Button
            size="xs"
            type="button"
            variant="ghost"
            onClick={() => onChange([...rows, createKeyValueRow()])}
          >
            <Plus className="size-3.5" />
            {addLabel}
          </Button>
        )}
      </div>
      {rows.map((row) => (
        <div className="flex items-center gap-2" key={row.id}>
          <McpInput
            aria-label={t("mcp.fields.key")}
            className="w-2/5 flex-none font-mono"
            disabled={disabled}
            placeholder={keyPlaceholder}
            spellCheck={false}
            value={row.key}
            onChange={(event) => updateRow(row.id, { key: event.target.value })}
          />
          <McpInput
            aria-label={t("mcp.fields.value")}
            className="flex-1 font-mono"
            disabled={disabled}
            placeholder={valuePlaceholder}
            spellCheck={false}
            value={row.value}
            onChange={(event) =>
              updateRow(row.id, { value: event.target.value })
            }
          />
          {disabled ? null : (
            <IconButton
              aria-label={t("mcp.fields.removeRow")}
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => onChange(rows.filter((item) => item !== row))}
            >
              <X className="size-4" />
            </IconButton>
          )}
        </div>
      ))}
    </fieldset>
  );
}
