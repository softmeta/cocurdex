import type { ApplicationConnection } from "@cocurdex/shared";
import { ArrowUpRight, Save } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingsGroup } from "@/components";
import { Button, Input, Label } from "@/components/ui";
import { desktopApi } from "@/lib";

export interface ApplicationOAuthChanges {
  clientId: string;
  callbackPort: number;
  clientSecret?: string;
}

export function ApplicationOAuthSetup({
  connection,
  disabled,
  onSave,
}: {
  connection: ApplicationConnection;
  disabled: boolean;
  onSave(changes: ApplicationOAuthChanges): Promise<boolean>;
}) {
  const { t } = useTranslation("personal");
  const [clientId, setClientId] = useState(connection.clientId ?? "");
  const [clientSecret, setClientSecret] = useState("");
  const [port, setPort] = useState(String(connection.callbackPort ?? 19173));
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const callbackPort = Number(port);
    if (
      !Number.isInteger(callbackPort) ||
      callbackPort < 1024 ||
      callbackPort > 65535
    ) {
      setError(
        t("apps.invalidPort", {
          defaultValue: "Choose a callback port between 1024 and 65535",
        }),
      );
      return;
    }
    setError(null);
    const saved = await onSave({
      clientId,
      callbackPort,
      ...(clientSecret ? { clientSecret } : {}),
    });
    if (saved) setClientSecret("");
  }

  return (
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
          aria-invalid={error !== null}
        />
        {error ? (
          <p role="alert" className="text-meta text-destructive">
            {error}
          </p>
        ) : null}
        <div className="break-all text-meta text-muted-foreground">
          http://127.0.0.1:{port}/callback
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled || !clientId.trim()}
            onClick={() => void save()}
          >
            <Save className="size-3.5" />
            {t("apps.saveOAuth", { defaultValue: "Save OAuth settings" })}
          </Button>
          <Button
            size="sm"
            variant="ghost"
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
      </div>
    </SettingsGroup>
  );
}
