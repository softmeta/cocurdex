import {
  APPLICATION_CATALOG,
  type ApplicationConnection,
  type PersonalAgentRecord,
} from "@cocurdex/shared";
import { ArrowUpRight, LogOut, Plug, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AppRemoveButton, SettingRow, SettingsGroup } from "@/components";
import { Button, Input, Label, Switch } from "@/components/ui";
import { desktopApi, requestDaemon } from "@/lib";
import {
  applicationStateLabel,
  isApplicationConnected,
} from "./application-state";
import { ApplicationTools } from "./application-tools";
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
  const [name, setName] = useState(connection.displayName);
  const [busy, setBusy] = useState(false);
  const app = APPLICATION_CATALOG.find(
    (item) => item.id === connection.applicationId,
  );

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      await onChanged();
      return true;
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const { view, save } = useApplicationSave(connection, onSaved, onChanged);

  function commitName() {
    const next = name.trim();
    if (!next) {
      setName(view.displayName);
      return;
    }
    if (next !== view.displayName) save({ displayName: next });
  }

  const disabled = busy || login.busyId !== null;
  const connected = isApplicationConnected(connection);
  const authorizeLabel = connected
    ? t("apps.reauthorize", { defaultValue: "Reauthorize" })
    : t("apps.connect", { defaultValue: "Connect" });
  return (
    <div className="flex flex-col gap-6">
      <p className="text-body text-muted-foreground">
        {t("apps.hostCredentials", {
          defaultValue:
            "Credentials stay on this host. The provider controls account and workspace access during authorization.",
        })}
      </p>
      <SettingsGroup
        title={t("apps.connection", { defaultValue: "Connection" })}
      >
        <div className="flex flex-col gap-2 py-3.5">
          <Label htmlFor="application-name">
            {t("apps.name", { defaultValue: "Connection name" })}
          </Label>
          <Input
            id="application-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={commitName}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            disabled={disabled}
            maxLength={160}
          />
        </div>
        <SettingRow title={t("apps.enabled", { defaultValue: "Enabled" })}>
          <Switch
            checked={view.enabled}
            onCheckedChange={(enabled) => save({ enabled })}
            disabled={disabled}
            aria-label={t("apps.enabled", { defaultValue: "Enabled" })}
          />
        </SettingRow>
        <div className="py-3.5 text-body">
          {applicationStateLabel(connection, t)}
          {connection.status?.checkedAt ? (
            <span className="ms-2 text-meta text-muted-foreground">
              {new Date(connection.status.checkedAt).toLocaleString()}
            </span>
          ) : null}
          {connection.status?.error ? (
            <p
              role="alert"
              className="mt-2 break-words text-meta text-destructive"
            >
              {connection.status.error}
            </p>
          ) : null}
        </div>
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
        <SettingRow
          title={t("apps.delegated", { defaultValue: "Allow delegated work" })}
          description={t("apps.delegatedDescription", {
            defaultValue:
              "Work sessions and teammates these assistants delegate can also use this account.",
          })}
        >
          <Switch
            checked={view.allowDelegatedWork}
            onCheckedChange={(allowDelegatedWork) =>
              save({ allowDelegatedWork })
            }
            disabled={disabled}
            aria-label={t("apps.delegated", {
              defaultValue: "Allow delegated work",
            })}
          />
        </SettingRow>
      </SettingsGroup>
      <SettingsGroup title={t("apps.workMode")}>
        <SettingRow
          title={t("apps.workSessions")}
          description={t("apps.workSessionsDescription")}
        >
          <Switch
            aria-label={t("apps.workSessions")}
            checked={view.allowWorkSessions}
            disabled={disabled}
            onCheckedChange={(allowWorkSessions) => save({ allowWorkSessions })}
          />
        </SettingRow>
      </SettingsGroup>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="ghost"
          disabled={disabled || !view.enabled}
          onClick={() => void login.start(connection.id)}
        >
          <Plug className="size-3.5" />
          {authorizeLabel}
        </Button>
        <Button
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
      </div>
      <ApplicationTools connection={connection} />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() =>
            void run(() =>
              requestDaemon("application.logout", { id: connection.id }),
            )
          }
        >
          <LogOut className="size-3.5" />
          {t("apps.signOut", { defaultValue: "Sign out" })}
        </Button>
        {app ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void desktopApi.openExternal(app.documentationUrl)}
          >
            <ArrowUpRight className="size-3.5" />
            {t("apps.providerDocs", { defaultValue: "Provider instructions" })}
          </Button>
        ) : null}
        <AppRemoveButton
          disabled={disabled}
          label={t("apps.remove", { defaultValue: "Remove connection" })}
          confirmTitle={t("apps.remove", { defaultValue: "Remove connection" })}
          confirmDescription={t("apps.removeDescription", {
            defaultValue:
              "Remove this host connection and its saved authorization? Provider-side authorization may also need revoking in the provider's account settings.",
          })}
          confirmLabel={t("apps.remove", { defaultValue: "Remove connection" })}
          cancelLabel={t("apps.cancel", { defaultValue: "Cancel" })}
          onConfirm={() =>
            void run(async () => {
              await requestDaemon("application.remove", { id: connection.id });
              onRemoved();
            })
          }
        />
      </div>
    </div>
  );
}
