import type {
  ApplicationConnection,
  PersonalAgentRecord,
} from "@cocurdex/shared";
import { Plug, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AppStatusDot, SettingRow, SettingsGroup } from "@/components";
import { Button, Switch, Text } from "@/components/ui";
import { requestDaemon } from "@/lib";
import { ApplicationAdvanced } from "./application-advanced";
import {
  applicationStateLabel,
  applicationStateTone,
  isApplicationConnected,
} from "./application-state";
import type { ApplicationLogin } from "./use-application-login";
import { useApplicationSave } from "./use-application-save";

export function ApplicationDetail({
  connection,
  agents,
  login,
  onChanged,
  onSaved,
  onRemoved,
}: {
  connection: ApplicationConnection;
  agents: PersonalAgentRecord[];
  login: ApplicationLogin;
  onChanged(): Promise<unknown>;
  onSaved(next: ApplicationConnection): Promise<unknown>;
  onRemoved(): void;
}) {
  const { t } = useTranslation("personal");
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      await onChanged();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  const { view, save } = useApplicationSave(connection, onSaved, onChanged);
  const disabled = busy || login.busyId !== null;
  const authorizeLabel = isApplicationConnected(connection)
    ? t("apps.reauthorize", { defaultValue: "Reauthorize" })
    : t("apps.connect", { defaultValue: "Connect" });
  const stateLabel = applicationStateLabel(connection, t);

  return (
    <section aria-label={view.displayName} className="flex flex-col gap-6">
      <SettingsGroup>
        <div className="flex flex-wrap items-center justify-between gap-3 py-3.5">
          <div className="flex min-w-0 items-center gap-2">
            <AppStatusDot
              label={stateLabel}
              tone={applicationStateTone(connection)}
            />
            <Text size="body">{stateLabel}</Text>
            {connection.status?.checkedAt ? (
              <Text size="meta" tone="muted">
                {new Date(connection.status.checkedAt).toLocaleString()}
              </Text>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={() =>
                void run(() =>
                  requestDaemon("application.check", { id: connection.id }),
                )
              }
            >
              <RefreshCw className="size-3.5" />
              {t("apps.check", { defaultValue: "Check connection" })}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={disabled || !view.enabled}
              onClick={() => void login.start(connection.id)}
            >
              <Plug className="size-3.5" />
              {authorizeLabel}
            </Button>
          </div>
        </div>
        {connection.status?.error ? (
          <p
            role="alert"
            className="break-words pb-3.5 text-meta text-destructive"
          >
            {connection.status.error}
          </p>
        ) : null}
      </SettingsGroup>
      <SettingsGroup
        title={t("apps.permissions", { defaultValue: "Assistant access" })}
      >
        <SettingRow
          title={t("apps.allAssistants")}
          description={t("apps.allAssistantsDescription")}
        >
          <Switch
            aria-label={t("apps.allAssistants")}
            checked={view.allPersonas}
            disabled={disabled}
            onCheckedChange={(allPersonas) => save({ allPersonas })}
          />
        </SettingRow>
        {(view.allPersonas ? [] : agents).map((agent) => (
          <SettingRow key={agent.id} title={agent.role.name}>
            <Switch
              aria-label={agent.role.name}
              checked={view.personaIds.includes(agent.id)}
              disabled={disabled}
              onCheckedChange={(value) =>
                save({
                  personaIds: value
                    ? [...view.personaIds, agent.id]
                    : view.personaIds.filter((id) => id !== agent.id),
                })
              }
            />
          </SettingRow>
        ))}
      </SettingsGroup>
      <ApplicationAdvanced
        connection={connection}
        disabled={disabled}
        run={run}
        save={save}
        view={view}
        onRemoved={onRemoved}
      />
    </section>
  );
}
