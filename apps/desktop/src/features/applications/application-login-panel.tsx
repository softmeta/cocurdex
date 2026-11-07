import { ArrowUpRight, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingsGroup } from "@/components";
import { Button, Input } from "@/components/ui";
import { desktopApi } from "@/lib";
import type { ApplicationLogin } from "./use-application-login";

export function ApplicationLoginPanel({
  login,
  name,
}: {
  login: ApplicationLogin;
  name: string;
}) {
  const { t } = useTranslation("personal");
  const [returnUrl, setReturnUrl] = useState("");
  const waiting = login.waiting;
  if (!waiting) return null;
  const remote = !desktopApi.capabilities.localFilePaths;

  return (
    <SettingsGroup
      title={t("apps.waitingFor", {
        name,
        defaultValue: "Authorizing {{name}}",
      })}
    >
      <div className="flex flex-col gap-3 py-3.5">
        <p role="status" className="text-body text-muted-foreground">
          {t("apps.waitingHint", {
            defaultValue:
              "Finish authorization in your browser. This page updates when you return.",
          })}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void desktopApi.openExternal(waiting.authUrl)}
          >
            <ArrowUpRight className="size-3.5" />
            {t("apps.openAuthorization", {
              defaultValue: "Open authorization page",
            })}
          </Button>
          <Button size="sm" variant="ghost" onClick={login.cancel}>
            <X className="size-3.5" />
            {t("apps.cancel", { defaultValue: "Cancel" })}
          </Button>
        </div>
        {remote ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const url = returnUrl.trim();
              if (!url) return;
              setReturnUrl("");
              void login.submitReturn(url);
            }}
          >
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
              type="submit"
              size="sm"
              variant="ghost"
              disabled={!returnUrl.trim()}
            >
              {t("apps.submitReturn", {
                defaultValue: "Complete authorization",
              })}
            </Button>
          </form>
        ) : null}
      </div>
    </SettingsGroup>
  );
}
