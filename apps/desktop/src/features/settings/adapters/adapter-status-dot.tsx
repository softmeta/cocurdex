import { useTranslation } from "react-i18next";
import type { AdapterStatusKind } from "@/features/sessions";
import { cn } from "@/lib";

export type AdapterDisplayStatus = AdapterStatusKind | "needs-login";

export function useAdapterStatusLabel(kind: AdapterDisplayStatus) {
  const { t } = useTranslation("settings");
  switch (kind) {
    case "builtin":
      return t("adapters.kind.builtin");
    case "detecting":
      return t("adapters.kind.detecting");
    case "error":
      return t("adapters.kind.error");
    case "missing":
      return t("adapters.kind.missing");
    case "outdated":
      return t("adapters.kind.outdated");
    case "needs-login":
      return t("adapters.kind.needsLogin");
    case "ready":
      return t("adapters.kind.ready");
  }
}

export function AdapterStatusDot({ kind }: { kind: AdapterDisplayStatus }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        (kind === "ready" || kind === "builtin") && "bg-status-success",
        (kind === "outdated" || kind === "needs-login") && "bg-status-warning",
        (kind === "detecting" || kind === "missing") &&
          "bg-muted-foreground/40",
        kind === "error" && "bg-destructive",
      )}
    />
  );
}
