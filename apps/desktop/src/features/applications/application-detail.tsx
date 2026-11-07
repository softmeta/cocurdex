import {
  APPLICATION_CATALOG,
  type ApplicationConnection,
  type PersonalAgentRecord,
  type UpdateApplicationPayload,
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

type ApplicationChanges = Partial<
  Omit<UpdateApplicationPayload, "id" | "revision">
>;

export function ApplicationDetail({
  connection,
  agents,
  login,
  onChanged,
  onRemoved,
}: {
  connection: ApplicationConnection;
  agents: PersonalAgentRecord[];
  login: ApplicationLogin;
  onChanged(): Promise<unknown>;
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

  function update(changes: ApplicationChanges) {
    return run(() =>
      requestDaemon("application.update", {
        id: connection.id,
        revision: connection.revision,
        displayName: connection.displayName,
        personaIds: connection.personaIds,
        allowDelegatedWork: connection.allowDelegatedWork,
        enabled: connection.enabled,
        ...changes,
      }),
    );
  }

  function commitName() {
    const next = name.trim();
    if (!next) {
      setName(connection.displayName);
      return;
    }
    if (next !== connection.displayName) void update({ displayName: next });
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
            checked={connection.enabled}
            onCheckedChange={(enabled) => void update({ enabled })}
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
        description={t("apps.permissionDescription", {
          defaultValue: "Only selected assistants can use this connection.",
        })}
      >
        {agents.map((agent) => (
          <SettingRow key={agent.id} title={agent.role.name}>
            <Switch
              aria-label={agent.role.name}
              checked={connection.personaIds.includes(agent.id)}
              disabled={disabled}
              onCheckedChange={(value) =>
                void update({
                  personaIds: value
                    ? [...connection.personaIds, agent.id]
                    : connection.personaIds.filter((id) => id !== agent.id),
                })
              }
            />
          </SettingRow>
        ))}
        <SettingRow
          title={t("apps.delegated", { defaultValue: "Allow delegated work" })}
          description={t("apps.delegatedDescription", {
            defaultValue:
              "Work sessions and teammates delegated by these assistants can also use this account. Other work sessions receive no access.",
          })}
        >
          <Switch
            checked={connection.allowDelegatedWork}
            onCheckedChange={(allowDelegatedWork) =>
              void update({ allowDelegatedWork })
            }
            disabled={disabled}
            aria-label={t("apps.delegated", {
              defaultValue: "Allow delegated work",
            })}
          />
        </SettingRow>
      </SettingsGroup>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="ghost"
          disabled={disabled || !connection.enabled}
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
