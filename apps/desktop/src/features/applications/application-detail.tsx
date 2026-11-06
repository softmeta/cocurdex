import {
  APPLICATION_CATALOG,
  type ApplicationConnection,
  type PersonalAgentRecord,
} from "@cocurdex/shared";
import { ArrowUpRight, LogOut, Plug, RefreshCw, Save } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AppRemoveButton, SettingRow, SettingsGroup } from "@/components";
import { Button, Input, Label, Switch } from "@/components/ui";
import { desktopApi, requestDaemon } from "@/lib";
import { ApplicationTools } from "./application-tools";
import { useApplicationLogin } from "./use-application-login";

export function ApplicationDetail({
  connection,
  agents,
  onChanged,
  onRemoved,
}: {
  connection: ApplicationConnection;
  agents: PersonalAgentRecord[];
  onChanged(): Promise<unknown>;
  onRemoved(): void;
}) {
  const { t } = useTranslation("personal");
  const [name, setName] = useState(connection.displayName);
  const [personaIds, setPersonaIds] = useState(connection.personaIds);
  const [delegated, setDelegated] = useState(connection.allowDelegatedWork);
  const [enabled, setEnabled] = useState(connection.enabled);
  const [clientId, setClientId] = useState(connection.clientId ?? "");
  const [clientSecret, setClientSecret] = useState("");
  const [port, setPort] = useState(String(connection.callbackPort ?? 19173));
  const [returnUrl, setReturnUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const login = useApplicationLogin(connection.id, onChanged);
  const app = APPLICATION_CATALOG.find(
    (item) => item.id === connection.applicationId,
  );

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

  async function save() {
    await run(async () => {
      const callbackPort = Number(port);
      if (
        app?.requiresClient &&
        (!Number.isInteger(callbackPort) ||
          callbackPort < 1024 ||
          callbackPort > 65535)
      )
        throw new Error(
          t("apps.invalidPort", {
            defaultValue: "Choose a callback port between 1024 and 65535",
          }),
        );
      await requestDaemon("application.update", {
        id: connection.id,
        revision: connection.revision,
        displayName: name,
        personaIds,
        allowDelegatedWork: delegated,
        enabled,
        ...(app?.requiresClient
          ? {
              clientId,
              callbackPort,
              ...(clientSecret ? { clientSecret } : {}),
            }
          : {}),
      });
      setClientSecret("");
    });
  }

  let stateLabel: string = t("apps.notChecked", {
    defaultValue: "Not checked",
  });
  if (!connection.enabled)
    stateLabel = t("apps.disabled", { defaultValue: "Disabled" });
  else if (!connection.configured)
    stateLabel = t("apps.setupRequired", { defaultValue: "Setup required" });
  else if (connection.status?.state === "connected")
    stateLabel = t("apps.connected", { defaultValue: "Connected" });
  else if (connection.status?.state === "needs-auth")
    stateLabel = t("apps.needsAuth", {
      defaultValue: "Authorization required",
    });
  else if (connection.status?.state === "failed")
    stateLabel = t("apps.failed", { defaultValue: "Connection failed" });
  const disabled = busy || login.busy;
  return (
    <div className="flex flex-col gap-6">
      <p className="text-body text-muted-foreground">
        {t("apps.hostCredentials", {
          defaultValue:
            "Credentials stay on this host. The provider controls account and workspace access during authorization. Adding a connection does not authorize it.",
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
            disabled={disabled}
            maxLength={160}
          />
        </div>
        <SettingRow title={t("apps.enabled", { defaultValue: "Enabled" })}>
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            disabled={disabled}
            aria-label={t("apps.enabled", { defaultValue: "Enabled" })}
          />
        </SettingRow>
        <div className="py-3.5 text-body">
          {stateLabel}
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
          defaultValue:
            "Only selected assistants can use this connection. Save changes before connecting.",
        })}
      >
        {agents.map((agent) => (
          <SettingRow key={agent.id} title={agent.role.name}>
            <Switch
              aria-label={agent.role.name}
              checked={personaIds.includes(agent.id)}
              disabled={disabled}
              onCheckedChange={(value) =>
                setPersonaIds((current) =>
                  value
                    ? [...current, agent.id]
                    : current.filter((id) => id !== agent.id),
                )
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
            checked={delegated}
            onCheckedChange={setDelegated}
            disabled={disabled}
            aria-label={t("apps.delegated", {
              defaultValue: "Allow delegated work",
            })}
          />
        </SettingRow>
      </SettingsGroup>
      {app?.requiresClient ? (
        <SettingsGroup
          title={t("apps.oauthSetup", {
            defaultValue: "GitHub OAuth application",
          })}
          description={t("apps.oauthDescription", {
            defaultValue:
              "Register an OAuth application owned by you. Use the callback URL below and enter its client credentials. Secrets are never shown again.",
          })}
        >
          <div className="flex flex-col gap-3 py-3.5">
            <Label htmlFor="application-client">
              {t("apps.clientId", { defaultValue: "Client ID" })}
            </Label>
            <Input
              id="application-client"
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
              disabled={disabled}
              autoComplete="off"
            />
            <Label htmlFor="application-secret">
              {t("apps.clientSecret", {
                defaultValue: "Client secret (leave blank to keep existing)",
              })}
            </Label>
            <Input
              id="application-secret"
              type="password"
              value={clientSecret}
              onChange={(event) => setClientSecret(event.target.value)}
              disabled={disabled}
              autoComplete="new-password"
            />
            <Label htmlFor="application-port">
              {t("apps.callbackPort", { defaultValue: "Callback port" })}
            </Label>
            <Input
              id="application-port"
              inputMode="numeric"
              value={port}
              onChange={(event) => setPort(event.target.value)}
              disabled={disabled}
            />
            <div className="break-all text-meta text-muted-foreground">
              http://127.0.0.1:{port}/callback
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                void desktopApi.openExternal(
                  "https://github.com/settings/developers",
                )
              }
            >
              <ArrowUpRight className="size-3.5" />
              {t("apps.registerOAuth", {
                defaultValue: "Register OAuth application",
              })}
            </Button>
          </div>
        </SettingsGroup>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button disabled={disabled || !name.trim()} onClick={() => void save()}>
          <Save className="size-3.5" />
          {t("apps.save", { defaultValue: "Save access" })}
        </Button>
        <Button
          variant="ghost"
          disabled={disabled || !connection.configured || !connection.enabled}
          onClick={() => void login.start()}
        >
          <Plug className="size-3.5" />
          {t("apps.authorize", { defaultValue: "Authorize" })}
        </Button>
        <Button
          variant="ghost"
          disabled={disabled || !connection.configured}
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
      {login.busy && !login.waiting ? (
        <p role="status" className="text-body text-muted-foreground">
          {t("apps.starting", { defaultValue: "Preparing authorization…" })}
        </p>
      ) : null}
      {login.waiting ? (
        <SettingsGroup
          title={t("apps.waiting", {
            defaultValue: "Waiting for authorization",
          })}
        >
          <div className="flex flex-col gap-3 py-3.5">
            <Button
              variant="ghost"
              onClick={() =>
                void desktopApi.openExternal(login.waiting?.authUrl ?? "")
              }
            >
              <ArrowUpRight className="size-3.5" />
              {t("apps.openAuthorization", {
                defaultValue: "Open authorization page",
              })}
            </Button>
            <p className="text-meta text-muted-foreground">
              {t("apps.remoteReturn", {
                defaultValue:
                  "Using another device? After authorization, copy the complete localhost return URL from the browser and paste it here. Treat it as a secret; do not send it in chat.",
              })}
            </p>
            <Input
              type="password"
              autoComplete="off"
              value={returnUrl}
              onChange={(event) => setReturnUrl(event.target.value)}
              aria-label={t("apps.returnUrl", {
                defaultValue: "Authorization return URL",
              })}
            />
            <Button
              variant="ghost"
              disabled={!returnUrl.trim()}
              onClick={() =>
                void run(async () => {
                  if (!login.waiting) return;
                  const url = returnUrl;
                  setReturnUrl("");
                  await requestDaemon("application.login.return", {
                    id: connection.id,
                    loginId: login.waiting.loginId,
                    url,
                  });
                })
              }
            >
              {t("apps.submitReturn", {
                defaultValue: "Complete authorization",
              })}
            </Button>
            <Button variant="ghost" onClick={login.cancel}>
              {t("apps.cancel", { defaultValue: "Cancel" })}
            </Button>
          </div>
        </SettingsGroup>
      ) : null}
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
