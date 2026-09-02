import {
  DEFAULT_NETWORK_PROXY_SETTINGS,
  formatProxyEgressDetail,
  isManualProxyIncomplete,
  isValidProxyUrl,
  type NetworkProxyMode,
  type NetworkProxySettings,
  type NetworkProxyTestResult,
} from "@cocurdex/shared";
import { CircleAlert, CircleCheck } from "lucide-react";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button, Input, Spinner, Text } from "@/components/ui";
import { desktopApi, useMountEffect } from "@/lib";
import {
  applyNetworkProxyProbeToStatus,
  applyNetworkProxySettingsToStatus,
} from "./network-proxy-status-store";
import { SettingsSelect } from "./settings-select";

function SettingsGroup({
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

function SettingRow({
  children,
  description,
  footer,
  title,
  vertical,
}: {
  children?: ReactNode;
  description?: string;
  // Full-width slot under the row, for output the control produces (e.g. a
  // connectivity result) that would not fit beside the title.
  footer?: ReactNode;
  title: string;
  vertical?: boolean;
}) {
  if (vertical) {
    return (
      <div className="flex flex-col gap-2 py-3.5">
        <div className="min-w-0">
          <div className="text-body font-medium text-foreground">{title}</div>
          {description ? (
            <div className="mt-0.5 text-body text-muted-foreground">
              {description}
            </div>
          ) : null}
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 py-3.5">
      <div className="flex items-center justify-between gap-6">
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
      {footer}
    </div>
  );
}

function ProxyConnectivityRow({
  result,
  testing,
  onTest,
}: {
  result: NetworkProxyTestResult | null;
  testing: boolean;
  onTest: () => void;
}) {
  const { t } = useTranslation("settings");

  return (
    <SettingRow
      description={t("network.proxy.test.description")}
      footer={
        result ? (
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              {result.ok ? (
                <CircleCheck className="size-3.5 shrink-0 text-status-success" />
              ) : (
                <CircleAlert className="size-3.5 shrink-0 text-destructive" />
              )}
              <Text size="meta" tone={result.ok ? "success" : "destructive"}>
                {result.ok
                  ? t("network.proxy.test.success", {
                      durationMs: String(result.durationMs),
                      ip: result.ip ?? t("network.proxy.test.unknownIp"),
                    })
                  : t("network.proxy.test.failure", { error: result.error })}
              </Text>
            </div>
            {formatProxyEgressDetail(result) ? (
              // Indent past the icon so the detail line hangs under the text.
              <Text className="ps-5" size="meta" tone="muted">
                {formatProxyEgressDetail(result)}
              </Text>
            ) : null}
          </div>
        ) : null
      }
      title={t("network.proxy.test.title")}
    >
      <div className="flex items-center gap-2">
        {testing ? <Spinner size="md" /> : null}
        <Button disabled={testing} size="sm" variant="outline" onClick={onTest}>
          {t("network.proxy.test.action")}
        </Button>
      </div>
    </SettingRow>
  );
}

const PROXY_URL_FIELDS = [
  "httpProxy",
  "httpsProxy",
  "allProxy",
] as const satisfies (keyof NetworkProxySettings)[];

export function NetworkProxySettingsPanel() {
  const { t } = useTranslation("settings");
  const [settings, setSettings] = useState<NetworkProxySettings>(
    DEFAULT_NETWORK_PROXY_SETTINGS,
  );
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<NetworkProxyTestResult | null>(
    null,
  );
  const persistedRef = useRef(JSON.stringify(DEFAULT_NETWORK_PROXY_SETTINGS));
  const saveRevisionRef = useRef(0);
  const draftRevisionRef = useRef(0);

  useMountEffect(() => {
    void desktopApi
      .getNetworkProxySettings()
      .then((next) => {
        setSettings(next);
        persistedRef.current = JSON.stringify(next);
      })
      .finally(() => setLoading(false));
  });

  const modeOptions = (
    ["system", "manual", "off"] as const satisfies NetworkProxyMode[]
  ).map((mode) => ({
    label: t(`network.proxy.modes.${mode}`),
    value: mode,
  }));

  // Never write the server response back into local state: a save started on
  // blur resolves after the user has already typed into the next field, and
  // echoing the stale snapshot back would wipe that input.
  const persist = async (next: NetworkProxySettings) => {
    setSettings(next);
    const revision = ++saveRevisionRef.current;
    try {
      const saved = await desktopApi.setNetworkProxySettings(next);
      applyNetworkProxySettingsToStatus(saved);
      if (revision === saveRevisionRef.current) {
        persistedRef.current = JSON.stringify(saved);
      }
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("network.proxy.saveFailed"),
      );
      return false;
    }
  };

  const updateField = <K extends keyof NetworkProxySettings>(
    key: K,
    value: NetworkProxySettings[K],
  ) => {
    const next = { ...settings, [key]: value };
    draftRevisionRef.current += 1;
    setTestResult(null);
    if (key === "mode") {
      void persist(next);
      return;
    }
    setSettings(next);
  };

  const commitManualFields = () => {
    if (settings.mode !== "manual") {
      return;
    }
    if (JSON.stringify(settings) === persistedRef.current) {
      return;
    }
    const invalid = PROXY_URL_FIELDS.find(
      (field) => !isValidProxyUrl(settings[field]),
    );
    if (invalid) {
      toast.error(
        t("network.proxy.invalidUrl", {
          field: t(`network.proxy.${invalid}.title`),
        }),
      );
      return;
    }
    void persist(settings);
  };

  const runTest = async () => {
    if (isManualProxyIncomplete(settings)) {
      toast.error(t("network.proxy.manualIncomplete"));
      return;
    }
    const invalid = PROXY_URL_FIELDS.find(
      (field) => !isValidProxyUrl(settings[field]),
    );
    if (invalid) {
      toast.error(
        t("network.proxy.invalidUrl", {
          field: t(`network.proxy.${invalid}.title`),
        }),
      );
      return;
    }

    const testedSettings = settings;
    const draftRevision = draftRevisionRef.current;
    const saveRevision = ++saveRevisionRef.current;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await desktopApi.testNetworkProxy(testedSettings);
      applyNetworkProxyProbeToStatus(testedSettings, result);
      if (saveRevision === saveRevisionRef.current) {
        persistedRef.current = JSON.stringify(testedSettings);
      }
      if (draftRevision === draftRevisionRef.current) {
        setTestResult(result);
      }
    } catch (error) {
      if (draftRevision === draftRevisionRef.current) {
        setTestResult({
          ok: false,
          durationMs: 0,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="settings-panel-enter flex flex-col gap-8">
        <SettingsGroup title={t("network.proxy.groupTitle")}>
          <SettingRow title={t("network.proxy.loading")} />
        </SettingsGroup>
      </div>
    );
  }

  return (
    <div className="settings-panel-enter flex flex-col gap-8">
      <SettingsGroup title={t("network.proxy.groupTitle")}>
        <SettingRow
          description={t("network.proxy.scopeDescription")}
          title={t("network.proxy.modeTitle")}
        >
          <SettingsSelect
            ariaLabel={t("network.proxy.modeTitle")}
            compact
            options={modeOptions}
            value={settings.mode}
            onChange={(value) => {
              if (value === "system" || value === "manual" || value === "off") {
                updateField("mode", value);
              }
            }}
          />
        </SettingRow>
        <ProxyConnectivityRow
          result={testResult}
          testing={testing}
          onTest={() => void runTest()}
        />
      </SettingsGroup>

      {settings.mode === "manual" ? (
        <SettingsGroup title={t("network.proxy.manualGroupTitle")}>
          {isManualProxyIncomplete(settings) ? (
            <div className="py-3.5">
              <Text size="body" tone="destructive">
                {t("network.proxy.manualIncomplete")}
              </Text>
            </div>
          ) : null}
          <SettingRow
            description={t("network.proxy.httpProxy.description")}
            title={t("network.proxy.httpProxy.title")}
            vertical
          >
            <Input
              className="max-w-md"
              placeholder={t("network.proxy.httpProxy.placeholder")}
              value={settings.httpProxy}
              onBlur={commitManualFields}
              onChange={(event) => updateField("httpProxy", event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
            />
          </SettingRow>
          <SettingRow
            description={t("network.proxy.httpsProxy.description")}
            title={t("network.proxy.httpsProxy.title")}
            vertical
          >
            <Input
              className="max-w-md"
              placeholder={t("network.proxy.httpsProxy.placeholder")}
              value={settings.httpsProxy}
              onBlur={commitManualFields}
              onChange={(event) =>
                updateField("httpsProxy", event.target.value)
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
            />
          </SettingRow>
          <SettingRow
            description={t("network.proxy.allProxy.description")}
            title={t("network.proxy.allProxy.title")}
            vertical
          >
            <Input
              className="max-w-md"
              placeholder={t("network.proxy.allProxy.placeholder")}
              value={settings.allProxy}
              onBlur={commitManualFields}
              onChange={(event) => updateField("allProxy", event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
            />
          </SettingRow>
          <SettingRow
            description={t("network.proxy.noProxy.description")}
            title={t("network.proxy.noProxy.title")}
            vertical
          >
            <Input
              className="max-w-md"
              placeholder={t("network.proxy.noProxy.placeholder")}
              value={settings.noProxy}
              onBlur={commitManualFields}
              onChange={(event) => updateField("noProxy", event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
            />
          </SettingRow>
        </SettingsGroup>
      ) : null}

      <SettingsGroup title={t("network.proxy.notesGroupTitle")}>
        <div className="flex flex-col gap-2 py-3.5">
          <Text size="body" tone="muted">
            {t("network.proxy.notesBody")}
          </Text>
          <Text size="body" tone="muted">
            {t("network.proxy.credentialsNote")}
          </Text>
        </div>
      </SettingsGroup>
    </div>
  );
}
