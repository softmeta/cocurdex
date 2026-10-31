import type { McpServerConfig } from "@cocurdex/shared";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Text,
} from "@/components/ui";
import { defaultImportSelection, type McpImportItem } from "./mcp-import-items";
import { serverSummary } from "./mcp-selection";

function McpImportRow({
  checked,
  disabled,
  idPrefix,
  item,
  onCheckedChange,
}: {
  checked: boolean;
  disabled: boolean;
  idPrefix: string;
  item: McpImportItem;
  onCheckedChange(checked: boolean): void;
}) {
  const { t } = useTranslation("settings");
  const id = `${idPrefix}-${item.key}`;
  let badge: string | null = null;
  if (item.unsupported) badge = t("mcp.import.unsupported");
  else if (item.match === "same") badge = t("mcp.import.same");
  else if (item.match === "different") badge = t("mcp.import.different");

  return (
    <label
      className="flex cursor-pointer items-start gap-2 py-2 has-disabled:cursor-default"
      data-mcp-import={item.key}
      htmlFor={id}
    >
      <Checkbox
        checked={checked}
        className="mt-0.5"
        disabled={disabled}
        id={id}
        onCheckedChange={(next) => onCheckedChange(next === true)}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <Text className="font-mono" size="body" truncate weight="medium">
            {item.name}
          </Text>
          {badge ? <Badge variant="outline">{badge}</Badge> : null}
        </span>
        <Text size="meta" tone="muted" truncate>
          {`${item.source} · ${serverSummary(item.config)}`}
        </Text>
        {item.unsupported ? (
          <Text size="meta" tone="destructive">
            {item.unsupported}
          </Text>
        ) : null}
      </span>
    </label>
  );
}

export function McpImportDialog({
  description,
  emptyText,
  items,
  loadError,
  open,
  title,
  onImport,
  onOpenChange,
}: {
  description: string;
  emptyText: string;
  items: McpImportItem[] | null;
  loadError: string;
  open: boolean;
  title: string;
  onImport(servers: Record<string, McpServerConfig>): Promise<void>;
  onOpenChange(open: boolean): void;
}) {
  const { t } = useTranslation("settings");
  const idPrefix = useId();
  const [selected, setSelected] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const picked = selected ?? defaultImportSelection(items ?? []);
  const pickedItems = (items ?? []).filter((item) => picked.includes(item.key));
  const pickedNames = new Set(pickedItems.map((item) => item.name));

  const close = (nextOpen: boolean) => {
    if (isImporting) return;
    if (!nextOpen) {
      setSelected(null);
      setError("");
    }
    onOpenChange(nextOpen);
  };

  const confirm = async () => {
    setIsImporting(true);
    setError("");
    try {
      await onImport(
        Object.fromEntries(pickedItems.map((item) => [item.name, item.config])),
      );
      setIsImporting(false);
      close(false);
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : String(importError),
      );
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent size="default">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[min(24rem,50vh)] min-w-0 flex-col divide-y divide-border/60 overflow-y-auto">
          {items?.length === 0 ? (
            <Text className="py-2" size="body" tone="muted">
              {emptyText}
            </Text>
          ) : null}
          {(items ?? []).map((item) => {
            const isChecked = picked.includes(item.key);
            const nameTaken = !isChecked && pickedNames.has(item.name);
            return (
              <McpImportRow
                checked={isChecked}
                disabled={
                  Boolean(item.unsupported) ||
                  item.match === "same" ||
                  nameTaken ||
                  isImporting
                }
                idPrefix={idPrefix}
                item={item}
                key={item.key}
                onCheckedChange={(checked) =>
                  setSelected(
                    checked
                      ? [...picked, item.key]
                      : picked.filter((key) => key !== item.key),
                  )
                }
              />
            );
          })}
        </div>
        {loadError || error ? (
          <Text role="alert" size="meta" tone="destructive">
            {loadError || error}
          </Text>
        ) : null}
        <DialogFooter>
          <Button
            disabled={isImporting}
            type="button"
            variant="outline"
            onClick={() => close(false)}
          >
            {t("mcp.import.cancel")}
          </Button>
          <Button
            disabled={pickedItems.length === 0 || isImporting}
            type="button"
            onClick={() => void confirm()}
          >
            {isImporting
              ? t("mcp.import.importing")
              : t("mcp.import.confirm", { count: pickedItems.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
