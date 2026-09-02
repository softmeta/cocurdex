import { useVirtualizer } from "@tanstack/react-virtual";
import { Scale } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button, EmptyState, Input, Spinner, Text } from "@/components/ui";
import { cn, desktopApi, useMountEffect } from "@/lib";
import type { OssLicensesPayload } from "@/lib/types";
import {
  buildOssLicenseRows,
  filterOssLicenseRows,
  type OssLicenseRow,
} from "./oss-licenses-rows";

const LICENSE_ROW_ESTIMATE = 52;

export function OssLicensesSettingsPanel() {
  const { t } = useTranslation("settings");
  const [payload, setPayload] = useState<OssLicensesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const loadLicenses = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      setPayload(await desktopApi.getOssLicenses());
    } catch {
      setPayload(null);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useMountEffect(() => {
    void loadLicenses();
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <Text size="body" tone="muted">
        {t("licenses.dialogDescription")}
      </Text>
      <OssLicensesBrowser
        loadError={loadError}
        loading={loading}
        payload={payload}
        onRetry={() => {
          void loadLicenses();
        }}
      />
    </div>
  );
}

function OssLicensesBrowser({
  loadError,
  loading,
  onRetry,
  payload,
}: {
  loadError: boolean;
  loading: boolean;
  onRetry(): void;
  payload: OssLicensesPayload | null;
}) {
  const { t } = useTranslation("settings");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const rows = useMemo(
    () => (payload ? buildOssLicenseRows(payload) : []),
    [payload],
  );
  const filtered = useMemo(
    () => filterOssLicenseRows(rows, query),
    [query, rows],
  );
  const selected =
    filtered.find((row) => row.id === selectedId) ?? filtered[0] ?? null;
  const selectedText =
    selected?.textId && payload ? (payload.texts[selected.textId] ?? "") : "";
  const isFiltering = query.trim().length > 0;
  const packageCountLabel = isFiltering
    ? t("licenses.packageCountFiltered", {
        total: String(rows.length),
        visible: String(filtered.length),
      })
    : t("licenses.packageCount", { total: String(rows.length) });

  if (loading && !payload) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center gap-2">
        <Spinner size="md" />
        <Text size="body" tone="muted">
          {t("licenses.loading")}
        </Text>
      </div>
    );
  }

  if (loadError || !payload) {
    return (
      <EmptyState
        action={
          <Button size="sm" variant="outline" onClick={onRetry}>
            {t("licenses.retry")}
          </Button>
        }
        className="min-h-0 flex-1"
        description={t("licenses.loadError")}
        icon={<Scale className="size-4" />}
        title={t("licenses.loadErrorTitle")}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center gap-3">
        <Input
          aria-label={t("licenses.searchPlaceholder")}
          autoComplete="off"
          className="min-w-0 flex-1"
          placeholder={t("licenses.searchPlaceholder")}
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
        <Text className="shrink-0" size="meta" tone="muted">
          {packageCountLabel}
        </Text>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(16rem,18rem)_minmax(0,1fr)] overflow-hidden rounded-card border border-border/40">
        <OssLicensesPackageList
          rows={filtered}
          selectedId={selected?.id ?? null}
          onSelect={setSelectedId}
        />
        <OssLicensesDetail row={selected} text={selectedText} />
      </div>
    </div>
  );
}

function OssLicensesPackageList({
  onSelect,
  rows,
  selectedId,
}: {
  onSelect(id: string): void;
  rows: OssLicenseRow[];
  selectedId: string | null;
}) {
  const { t } = useTranslation("settings");
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: () => LICENSE_ROW_ESTIMATE,
    getScrollElement: () => scrollRef.current,
    overscan: 12,
  });

  if (rows.length === 0) {
    return (
      <div className="min-h-0 overflow-hidden border-border/40 border-e">
        <EmptyState
          className="h-full py-8"
          description={t("licenses.empty")}
          icon={<Scale className="size-4" />}
          title={t("licenses.emptyTitle")}
        />
      </div>
    );
  }

  return (
    <div
      className="min-h-0 overflow-auto border-border/40 border-e"
      ref={scrollRef}
      role="listbox"
    >
      <div
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((item) => {
          const row = rows[item.index];
          if (!row) {
            return null;
          }
          const isSelected = row.id === selectedId;
          const title =
            row.kind === "chromium" ? t("licenses.chromiumTitle") : row.name;
          return (
            <div
              className="absolute start-0 top-0 w-full"
              key={row.id}
              style={{
                height: item.size,
                transform: `translateY(${item.start}px)`,
              }}
            >
              <button
                aria-selected={isSelected}
                className={cn(
                  "flex h-full w-full flex-col items-stretch rounded-control px-2 py-1.5 text-start hover:bg-muted/50",
                  isSelected && "bg-muted hover:bg-muted",
                )}
                role="option"
                type="button"
                onClick={() => {
                  onSelect(row.id);
                }}
              >
                <Text size="body" truncate weight="medium">
                  {title}
                </Text>
                <Text size="meta" tone="muted" truncate>
                  {row.version
                    ? `${row.license} · ${row.version}`
                    : row.license}
                </Text>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OssLicensesDetail({
  row,
  text,
}: {
  row: OssLicenseRow | null;
  text: string;
}) {
  const { t } = useTranslation("settings");

  if (!row) {
    return (
      <EmptyState
        className="h-full"
        description={t("licenses.empty")}
        icon={<Scale className="size-4" />}
        title={t("licenses.emptyTitle")}
      />
    );
  }

  const title =
    row.kind === "chromium" ? t("licenses.chromiumTitle") : row.name;
  const openChromium = async () => {
    const result = await desktopApi.openChromiumLicenses();
    if (!result.ok) {
      toast.error(t("licenses.chromiumUnavailable"));
    }
  };

  return (
    <div className="flex min-h-0 flex-col">
      <div className="border-border/40 border-b px-3 py-2">
        <Text className="block" size="body" truncate weight="medium">
          {title}
        </Text>
        <Text size="meta" tone="muted">
          {row.version ? `${row.license} · ${row.version}` : row.license}
        </Text>
      </div>
      {row.kind === "chromium" ? (
        <div className="flex min-h-0 flex-1 flex-col items-start gap-3 overflow-auto p-3">
          <Text size="body" tone="muted">
            {t("licenses.chromiumDescription")}
          </Text>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void openChromium();
            }}
          >
            {t("licenses.chromiumOpen")}
          </Button>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto p-3">
          {text ? (
            <pre className="whitespace-pre-wrap break-words font-mono text-meta text-muted-foreground">
              {text}
            </pre>
          ) : (
            <Text size="body" tone="muted">
              {t("licenses.noLicenseText")}
            </Text>
          )}
        </div>
      )}
    </div>
  );
}
