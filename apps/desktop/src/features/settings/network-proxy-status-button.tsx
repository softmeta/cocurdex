import { formatProxyEgressDetail, redactProxyUrl } from "@cocurdex/shared";
import { Cable, Unplug } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  TITLEBAR_ICON_GLYPH_CLASS,
  TitlebarIconButton,
} from "@/app/layout/titlebar-icon-button";
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
import { useMountEffect } from "@/lib";
import {
  listManualProxyEndpoints,
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

export function NetworkProxyStatusButton() {
  const { t } = useTranslation("settings");
  const status = useNetworkProxyStatus();
  const tone = resolveNetworkProxyStatusTone(status);
  const Icon = status.settings?.mode === "off" ? Unplug : Cable;
  const egress = status.result ? formatProxyEgressDetail(status.result) : null;
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

  const handleOpenChange = useCallback((next: boolean) => {
    if (next && suppressHoverOpenRef.current) {
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

  let connectivityText: string = t("network.proxy.status.idle");
  if (tone === "checking") {
    connectivityText = t("network.proxy.status.checking");
  } else if (status.result?.ok) {
    connectivityText = t("network.proxy.test.success", {
      durationMs: String(status.result.durationMs),
      ip: status.result.ip ?? t("network.proxy.test.unknownIp"),
    });
  } else if (status.result && !status.result.ok) {
    connectivityText = t("network.proxy.test.failure", {
      error: status.result.error,
    });
  } else if (tone === "incomplete") {
    connectivityText = t("network.proxy.manualIncomplete");
  } else if (tone === "off") {
    connectivityText = t("network.proxy.status.offDetail");
  }

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
          onClick={handleOpenSettings}
        >
          <Icon className={TITLEBAR_ICON_GLYPH_CLASS} />
        </TitlebarIconButton>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 rounded-card" side="bottom">
        <PopoverHeader>
          <PopoverTitle>{t("network.proxy.status.label")}</PopoverTitle>
          <PopoverDescription>
            {status.settings
              ? t(`network.proxy.modes.${status.settings.mode}`)
              : t("network.proxy.loading")}
          </PopoverDescription>
        </PopoverHeader>
        {endpoints.length > 0 ? (
          <div className="flex flex-col gap-1">
            {endpoints.map((endpoint) => (
              <Text key={endpoint.field} className="break-all" size="meta">
                {t(`network.proxy.${endpoint.field}.title`)}
                {": "}
                {redactProxyUrl(endpoint.url)}
              </Text>
            ))}
          </div>
        ) : null}
        <Separator />
        <div className="flex flex-col gap-1">
          <Text size="meta">{connectivityText}</Text>
          {egress ? (
            <Text size="meta" tone="muted">
              {egress}
            </Text>
          ) : null}
        </div>
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
