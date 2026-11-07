import { APPLICATION_CATALOG, type ApplicationId } from "@cocurdex/shared";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AppSearchInput, AppStatusDot } from "@/components";
import { Button, Text } from "@/components/ui";
import { usePersonalAgents } from "@/features/personal";
import { requestDaemon } from "@/lib";
import { SettingsListItem } from "../settings-list-item";
import { ApplicationCatalogDetail } from "./application-catalog-detail";
import { ApplicationDetail } from "./application-detail";
import { ApplicationLoginPanel } from "./application-login-panel";
import { useApplications } from "./application-queries";
import {
  applicationAccessLabel,
  applicationStateLabel,
  applicationStateTone,
  isApplicationConnected,
} from "./application-state";
import { useApplicationLogin } from "./use-application-login";

type Selection =
  | { kind: "connection"; id: string }
  | { kind: "catalog"; id: ApplicationId };

function ListGroup({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <section aria-label={label} className="flex flex-col gap-2">
      <div className="flex h-5 items-center px-1">
        <Text size="meta" tone="muted" weight="medium">
          {label}
        </Text>
      </div>
      {children}
    </section>
  );
}

export function ApplicationsSettingsPanel() {
  const { t } = useTranslation("personal");
  const { data, error, mutate } = useApplications();
  const { agents } = usePersonalAgents();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState<ApplicationId | null>(null);
  const login = useApplicationLogin(() => mutate());
  const matches = (value: string) =>
    value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  const connections = (data ?? []).filter((item) =>
    matches(`${item.displayName} ${item.applicationId}`),
  );
  const catalog = APPLICATION_CATALOG.filter(
    (app) =>
      matches(app.name) &&
      !(data ?? []).some((item) => item.applicationId === app.id),
  );
  const active = resolveSelection(selection, data ?? []);
  const selectedConnection =
    active?.kind === "connection"
      ? data?.find((item) => item.id === active.id)
      : undefined;
  const selectedApp =
    active?.kind === "catalog"
      ? APPLICATION_CATALOG.find((app) => app.id === active.id)
      : undefined;
  const waitingConnection = data?.find((item) => item.id === login.waiting?.id);
  const busy = adding !== null || login.busyId !== null;

  async function connect(applicationId: ApplicationId) {
    const app = APPLICATION_CATALOG.find((item) => item.id === applicationId);
    if (!app) return;
    setAdding(applicationId);
    try {
      const pending = (data ?? []).find(
        (item) =>
          item.applicationId === applicationId &&
          item.enabled &&
          !isApplicationConnected(item),
      );
      const connection =
        pending ??
        (await requestDaemon("application.add", {
          applicationId,
          displayName: app.name,
          personaIds: [],
        }));
      await mutate();
      setSelection({ kind: "connection", id: connection.id });
      setAdding(null);
      await login.start(connection.id);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setAdding(null);
    }
  }

  if (!data && !error) return <div className="min-h-0 flex-1" />;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5">
      <Text className="max-w-2xl shrink-0" size="body" tone="muted">
        {t("apps.description")}
      </Text>
      {error ? (
        <div role="alert" className="flex items-center gap-2">
          <Text size="meta" tone="destructive">
            {String(error)}
          </Text>
          <Button size="sm" variant="ghost" onClick={() => void mutate()}>
            {t("apps.retry", { defaultValue: "Retry" })}
          </Button>
        </div>
      ) : null}
      <div className="flex min-h-0 min-w-0 flex-1 gap-6">
        <div className="flex min-h-0 w-72 shrink-0 flex-col gap-3">
          <AppSearchInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("apps.search", {
              defaultValue: "Search applications",
            })}
            aria-label={t("apps.search", {
              defaultValue: "Search applications",
            })}
          />
          <div className="min-h-0 flex-1 overflow-auto">
            <div className="flex flex-col gap-4 pe-1">
              {connections.length ? (
                <ListGroup
                  label={t("apps.added", {
                    defaultValue: "Added connections",
                  })}
                >
                  {connections.map((connection) => {
                    const state = applicationStateLabel(connection, t);
                    return (
                      <SettingsListItem
                        key={connection.id}
                        dataAttributes={{
                          "data-application-id": connection.id,
                        }}
                        isActive={
                          active?.kind === "connection" &&
                          active.id === connection.id
                        }
                        subtitle={applicationAccessLabel(connection, t)}
                        title={connection.displayName}
                        trailing={
                          <AppStatusDot
                            label={state}
                            tone={applicationStateTone(connection)}
                          />
                        }
                        onClick={() =>
                          setSelection({
                            kind: "connection",
                            id: connection.id,
                          })
                        }
                      />
                    );
                  })}
                </ListGroup>
              ) : null}
              {catalog.length ? (
                <ListGroup
                  label={t("apps.catalog", {
                    defaultValue: "Available applications",
                  })}
                >
                  {catalog.map((app) => (
                    <SettingsListItem
                      key={app.id}
                      dataAttributes={{ "data-catalog-application": app.id }}
                      isActive={
                        active?.kind === "catalog" && active.id === app.id
                      }
                      subtitle={authHint(app.id, t)}
                      title={app.name}
                      onClick={() =>
                        setSelection({ kind: "catalog", id: app.id })
                      }
                    />
                  ))}
                </ListGroup>
              ) : null}
              {connections.length === 0 && catalog.length === 0 ? (
                <Text className="px-1" size="body" tone="muted">
                  {t("apps.noConnections", {
                    defaultValue: "No matching connections",
                  })}
                </Text>
              ) : null}
            </div>
          </div>
        </div>
        <div className="min-h-0 min-w-0 flex-1 overflow-auto">
          <div className="flex min-w-0 flex-col gap-6 pe-1">
            {waitingConnection ? (
              <ApplicationLoginPanel
                login={login}
                name={waitingConnection.displayName}
              />
            ) : null}
            {selectedConnection ? (
              <ApplicationDetail
                key={selectedConnection.id}
                connection={selectedConnection}
                login={login}
                agents={agents}
                onChanged={() => mutate()}
                onSaved={(next) =>
                  mutate(
                    (current) =>
                      current?.map((item) =>
                        item.id === next.id ? next : item,
                      ),
                    { revalidate: false },
                  )
                }
                onRemoved={() => {
                  setSelection(null);
                  void mutate();
                }}
                onConnectAnother={() =>
                  void connect(selectedConnection.applicationId)
                }
              />
            ) : null}
            {selectedApp ? (
              <ApplicationCatalogDetail
                app={selectedApp}
                authHint={authHint(selectedApp.id, t)}
                busy={busy}
                onConnect={() => void connect(selectedApp.id)}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function resolveSelection(
  selection: Selection | null,
  connections: readonly { id: string }[],
): Selection | null {
  if (
    selection?.kind === "connection" &&
    connections.some((item) => item.id === selection.id)
  )
    return selection;
  if (selection?.kind === "catalog") return selection;
  const first = connections[0];
  if (first) return { kind: "connection", id: first.id };
  const app = APPLICATION_CATALOG[0];
  return app ? { kind: "catalog", id: app.id } : null;
}

function authHint(
  applicationId: ApplicationId,
  t: ReturnType<typeof useTranslation<"personal">>["t"],
) {
  return applicationId === "github"
    ? t("apps.githubAuth", {
        defaultValue:
          "Uses your GitHub CLI sign-in, or authorize in your browser",
      })
    : t("apps.browserOAuth", { defaultValue: "Authorize in your browser" });
}
