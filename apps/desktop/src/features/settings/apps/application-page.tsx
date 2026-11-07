import {
  APPLICATION_CATALOG,
  type ApplicationConnection,
  type ApplicationId,
  type PersonalAgentRecord,
} from "@cocurdex/shared";
import { ArrowUpRight, ChevronLeft, Plug, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Text, ToggleGroup, ToggleGroupItem } from "@/components/ui";
import { desktopApi } from "@/lib";
import { applicationAuthHint } from "./application-auth-hint";
import { ApplicationDetail } from "./application-detail";
import { ApplicationLoginPanel } from "./application-login-panel";
import { ApplicationTile } from "./application-tile";
import type { ApplicationLogin } from "./use-application-login";

export function ApplicationPage({
  agents,
  applicationId,
  busy,
  connections,
  login,
  onBack,
  onChanged,
  onConnect,
  onSaved,
}: {
  agents: PersonalAgentRecord[];
  applicationId: ApplicationId;
  busy: boolean;
  connections: readonly ApplicationConnection[];
  login: ApplicationLogin;
  onBack(): void;
  onChanged(): Promise<unknown>;
  onConnect(): void;
  onSaved(next: ApplicationConnection): Promise<unknown>;
}) {
  const { t } = useTranslation(["personal", "settings"]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const app = APPLICATION_CATALOG.find((item) => item.id === applicationId);
  if (!app) return null;
  const selected =
    connections.find((item) => item.id === selectedId) ?? connections[0];
  const waiting = connections.find((item) => item.id === login.waiting?.id);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <Button
        className="-ms-2 self-start text-muted-foreground"
        size="sm"
        variant="ghost"
        onClick={onBack}
      >
        <ChevronLeft className="size-3.5 rtl:-scale-x-100" />
        {t("settings:sections.apps")}
      </Button>
      <div className="flex flex-wrap items-center gap-4">
        <ApplicationTile applicationId={app.id} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Text as="h2" size="display" weight="semibold">
            {app.name}
          </Text>
          <Text size="body" tone="muted">
            {applicationAuthHint(app.id, t)}
          </Text>
        </div>
        {connections.length ? (
          <Button size="sm" variant="ghost" disabled={busy} onClick={onConnect}>
            <Plus className="size-3.5" />
            {t("apps.connectAnother", {
              defaultValue: "Connect another account",
            })}
          </Button>
        ) : (
          <Button
            aria-label={`${t("apps.connect", { defaultValue: "Connect" })} ${app.name}`}
            disabled={busy}
            size="sm"
            onClick={onConnect}
          >
            <Plug className="size-3.5" />
            {t("apps.connect", { defaultValue: "Connect" })}
          </Button>
        )}
      </div>
      {waiting ? (
        <ApplicationLoginPanel login={login} name={waiting.displayName} />
      ) : null}
      {connections.length > 1 ? (
        <ToggleGroup
          aria-label={t("apps.accounts", { defaultValue: "Accounts" })}
          className="self-start rounded-lg bg-muted p-0.5"
          spacing={0.5}
          type="single"
          value={selected?.id}
          variant="segmented"
          onValueChange={(value) => {
            if (value) setSelectedId(value);
          }}
        >
          {connections.map((item) => (
            <ToggleGroupItem key={item.id} value={item.id}>
              {item.displayName}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      ) : null}
      {selected ? (
        <ApplicationDetail
          agents={agents}
          connection={selected}
          key={selected.id}
          login={login}
          onChanged={onChanged}
          onRemoved={() => {
            setSelectedId(null);
            void onChanged();
          }}
          onSaved={onSaved}
        />
      ) : (
        <div className="flex flex-col gap-2">
          <Text size="body" tone="muted">
            {t("apps.hostCredentials", {
              defaultValue:
                "Credentials stay on this host. The provider controls account and workspace access during authorization.",
            })}
          </Text>
          <Button
            className="-ms-2 self-start"
            size="sm"
            variant="ghost"
            onClick={() => void desktopApi.openExternal(app.documentationUrl)}
          >
            <ArrowUpRight className="size-3.5" />
            {t("apps.providerDocs", { defaultValue: "Provider instructions" })}
          </Button>
        </div>
      )}
    </div>
  );
}
