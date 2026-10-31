import {
  formatProxyEgressDetail,
  type NetworkProxyTestResult,
  redactProxyUrl,
} from "@cocurdex/shared";
import type { TFunction } from "i18next";
import { Cable, Unplug } from "lucide-react";
import {
  type ComponentProps,
  type ReactNode,
  useCallback,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { TitlebarIconButton } from "@/app/layout/titlebar-icon-button";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
  Separator,
  Text,
} from "@/components/ui";
import { cn, useMountEffect } from "@/lib";
import {
  listManualProxyEndpoints,
  type NetworkProxyStatusTone,
  resolveNetworkProxyStatusTone,
} from "./network-proxy-status";
import {
  loadNetworkProxyStatus,
  probeCurrentNetworkProxyStatus,
  shouldProbeNetworkProxyStatus,
  useNetworkProxyStatus,
} from "./network-proxy-status-store";
import { openSettings } from "./settings-navigation";

const HOVER_OPEN_DELAY_MS = 200;
const HOVER_CLOSE_DELAY_MS = 80;
const SLOW_LATENCY_MS = 1000;

const statusDotClassName: Record<NetworkProxyStatusTone, string> = {
  checking: "bg-muted-foreground/40",
  error: "bg-destructive",
  incomplete: "bg-status-warning",
  off: "bg-muted-foreground/40",
  ok: "bg-status-success",
  unknown: "bg-muted-foreground/40",
};

const ALERT_TONES = new Set<NetworkProxyStatusTone>(["error", "incomplete"]);

function statusLabel(tone: NetworkProxyStatusTone, t: TFunction<"settings">) {
  switch (tone) {
    case "checking":
      return t("network.proxy.status.state.checking");
    case "error":
      return t("network.proxy.status.state.error");
    case "incomplete":
      return t("network.proxy.status.state.incomplete");
    case "off":
      return t("network.proxy.status.state.off");
    case "ok":
      return t("network.proxy.status.state.ok");
    default:
      return t("network.proxy.status.state.unknown");
  }
}

function statusNote(tone: NetworkProxyStatusTone, t: TFunction<"settings">) {
  if (tone === "incomplete") {
    return t("network.proxy.manualIncomplete");
  }
  if (tone === "off") {
    return t("network.proxy.status.offDetail");
  }
  if (tone === "unknown") {
    return t("network.proxy.status.idle");
  }
  return null;
}

function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: NetworkProxyStatusTone;
}) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-meta text-muted-foreground">
      <span
        className={cn(
          "size-1.5 rounded-full",
          statusDotClassName[tone],
          tone === "checking" && "animate-pulse",
        )}
      />
      {label}
    </span>
  );
}

function DetailRow({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <>
      <Text className="whitespace-nowrap" size="meta" tone="muted">
        {label}
      </Text>
      <Text
        className="min-w-0 wrap-break-word tabular-nums select-text"
        size="meta"
      >
        {children}
      </Text>
    </>
  );
}

function ProbeResultRows({
  result,
  t,
}: {
  result: NetworkProxyTestResult;
  t: TFunction<"settings">;
}) {
  const latency = (
    <DetailRow label={t("network.proxy.status.fields.latency")}>
      <span
        className={cn(
          result.durationMs > SLOW_LATENCY_MS && "text-status-warning",
        )}
      >
        {t("network.proxy.status.latencyValue", {
          durationMs: result.durationMs,
        })}
      </span>
    </DetailRow>
  );
  if (!result.ok) {
    return (
      <>
        {latency}
        <DetailRow label={t("network.proxy.status.fields.error")}>
          <span className="text-destructive">{result.error}</span>
        </DetailRow>
      </>
    );
  }
  const location = formatProxyEgressDetail(result);
  return (
    <>
      {latency}
      <DetailRow label={t("network.proxy.status.fields.egressIp")}>
        {result.ip ?? t("network.proxy.test.unknownIp")}
      </DetailRow>
      {location ? (
        <DetailRow label={t("network.proxy.status.fields.location")}>
          {location}
        </DetailRow>
      ) : null}
    </>
  );
}

export function NetworkProxyStatusButton() {
  const { t } = useTranslation("settings");
  const status = useNetworkProxyStatus();
  const tone = resolveNetworkProxyStatusTone(status);
  const Icon = status.settings?.mode === "off" ? Unplug : Cable;
  const note = statusNote(tone, t);
  const endpoints = status.settings
    ? listManualProxyEndpoints(status.settings)
    : [];

  const [open, setOpen] = useState(false);
  const suppressHoverOpenRef = useRef(false);

  useMountEffect(() => {
    void loadNetworkProxyStatus().then(() => {
      if (shouldProbeNetworkProxyStatus()) {
        void probeCurrentNetworkProxyStatus();
      }
    });
  });

  const handleOpenChange = useCallback<
    NonNullable<ComponentProps<typeof Popover>["onOpenChange"]>
  >((next, eventDetails) => {
    if (next && suppressHoverOpenRef.current) {
      eventDetails.cancel();
      return;
    }
    setOpen(next);
    if (!next || !shouldProbeNetworkProxyStatus()) {
      return;
    }
    void probeCurrentNetworkProxyStatus();
  }, []);

  const handleOpenSettings = useCallback(() => {
    suppressHoverOpenRef.current = true;
    setOpen(false);
    openSettings("environment");
    const unlockHover = () => {
      suppressHoverOpenRef.current = false;
    };
    window.addEventListener("pointermove", unlockHover, { once: true });
  }, []);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        asChild
        closeDelay={HOVER_CLOSE_DELAY_MS}
        delay={HOVER_OPEN_DELAY_MS}
        openOnHover
      >
        <TitlebarIconButton
          aria-label={t("network.proxy.status.label")}
          cursor="default"
          tooltip={false}
          onClick={handleOpenSettings}
        >
          <Icon className="size-3.5" />
          {ALERT_TONES.has(tone) ? (
            <span
              className={cn(
                "absolute end-0.5 bottom-0.5 size-1.5 rounded-full ring-2 ring-background",
                statusDotClassName[tone],
              )}
            />
          ) : null}
        </TitlebarIconButton>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 rounded-card" side="bottom">
        <PopoverHeader className="flex-row items-center justify-between gap-3">
          <PopoverTitle>{t("network.proxy.status.label")}</PopoverTitle>
          <StatusBadge label={statusLabel(tone, t)} tone={tone} />
        </PopoverHeader>
        <Separator />
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5">
          <DetailRow label={t("network.proxy.status.fields.mode")}>
            {status.settings
              ? t(`network.proxy.modes.${status.settings.mode}`)
              : t("network.proxy.loading")}
          </DetailRow>
          {endpoints.map((endpoint) => (
            <DetailRow
              key={endpoint.field}
              label={t(`network.proxy.${endpoint.field}.title`)}
            >
              {redactProxyUrl(endpoint.url)}
            </DetailRow>
          ))}
          {status.result && tone !== "checking" ? (
            <ProbeResultRows result={status.result} t={t} />
          ) : null}
        </div>
        {note ? (
          <PopoverDescription className="text-meta">{note}</PopoverDescription>
        ) : null}
        <Separator />
        <Button
          className="h-auto justify-start px-0"
          size="sm"
          variant="link"
          onClick={handleOpenSettings}
        >
          {t("network.proxy.status.openSettings")}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
