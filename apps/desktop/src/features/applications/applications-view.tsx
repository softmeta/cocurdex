import {
  APPLICATION_CATALOG,
  type ApplicationConnection,
  type ApplicationId,
} from "@cocurdex/shared";
import { useAtomValue } from "jotai";
import { ArrowLeft, ArrowUpRight, Plug, Plus, Search } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { SettingsGroup } from "@/components";
import { Button, Input } from "@/components/ui";
import { usePersonalAgents } from "@/features/personal";
import { activeSessionIdAtom, sessionsAtom } from "@/features/sessions";
import { openSettings } from "@/features/settings";
import { requestDaemon } from "@/lib";
import { ApplicationDetail } from "./application-detail";
import { useApplications } from "./application-queries";

export function ApplicationsView() {
  const { t } = useTranslation("personal");
  const { data, error, mutate } = useApplications();
  const { agents } = usePersonalAgents(t("defaultName"));
  const sessionId = useAtomValue(activeSessionIdAtom);
  const session = useAtomValue(sessionsAtom).find(
    (item) => item.id === sessionId,
  );
  const persona = agents.find(
    (item) =>
      item.homeSessionId === sessionId || item.role.id === session?.agentRoleId,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState<ApplicationId | null>(null);
  const selected = data?.find((item) => item.id === selectedId);
  const matches = (value: string) =>
    value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  const connections = (data ?? []).filter((item) =>
    matches(`${item.displayName} ${item.applicationId}`),
  );

  async function add(applicationId: ApplicationId) {
    setAdding(applicationId);
    try {
      const app = APPLICATION_CATALOG.find((item) => item.id === applicationId);
      const connection = await requestDaemon("application.add", {
        applicationId,
        displayName: app?.name ?? applicationId,
        personaIds: persona ? [persona.id] : [],
        allowDelegatedWork: false,
      });
      await mutate();
      setSelectedId(connection.id);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setAdding(null);
    }
  }

  function stateLabel(connection: ApplicationConnection) {
    if (!connection.enabled)
      return t("apps.disabled", { defaultValue: "Disabled" });
    if (!connection.configured)
      return t("apps.setupRequired", { defaultValue: "Setup required" });
    if (!connection.status)
      return t("apps.notChecked", { defaultValue: "Not checked" });
    if (connection.status.state === "connected")
      return t("apps.connected", { defaultValue: "Connected" });
    if (connection.status.state === "needs-auth")
      return t("apps.needsAuth", { defaultValue: "Authorization required" });
    return t("apps.failed", { defaultValue: "Connection failed" });
  }

  return (
    <section
      className="flex h-full min-h-0 flex-col"
      aria-label={t("apps.title", { defaultValue: "Applications" })}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
        {selected ? (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t("apps.back", {
              defaultValue: "Back to applications",
            })}
            onClick={() => setSelectedId(null)}
          >
            <ArrowLeft className="size-3.5" />
          </Button>
        ) : (
          <Plug className="size-4 text-muted-foreground" />
        )}
        <h2 className="min-w-0 flex-1 truncate text-body font-medium">
          {selected?.displayName ??
            t("apps.title", { defaultValue: "Applications" })}
        </h2>
        <Button size="sm" variant="ghost" onClick={() => openSettings("mcp")}>
          <ArrowUpRight className="size-3.5" />
          {t("apps.advanced", { defaultValue: "Custom MCP" })}
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {error ? (
          <div role="alert" className="mb-4 text-body text-destructive">
            {String(error)}
            <Button variant="ghost" onClick={() => void mutate()}>
              {t("apps.retry", { defaultValue: "Retry" })}
            </Button>
          </div>
        ) : null}
        {selected ? (
          <ApplicationDetail
            key={`${selected.id}:${selected.revision}`}
            connection={selected}
            agents={agents}
            onChanged={() => mutate()}
            onRemoved={() => {
              setSelectedId(null);
              void mutate();
            }}
          />
        ) : (
          <div className="flex flex-col gap-6">
            <p className="text-body text-muted-foreground">
              {t("apps.description", {
                defaultValue:
                  "Connect your accounts on this host, then choose which assistants may use them. Custom MCP connections remain available in advanced settings.",
              })}
            </p>
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                className="ps-9"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("apps.search", {
                  defaultValue: "Search applications",
                })}
                aria-label={t("apps.search", {
                  defaultValue: "Search applications",
                })}
              />
            </div>
            <SettingsGroup
              title={t("apps.added", { defaultValue: "Added connections" })}
            >
              {connections.length ? (
                connections.map((connection) => (
                  <button
                    type="button"
                    key={connection.id}
                    onClick={() => setSelectedId(connection.id)}
                    className="flex w-full items-center justify-between gap-3 py-3.5 text-start"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-body">
                        {connection.displayName}
                      </span>
                      <span className="text-meta text-muted-foreground">
                        {connection.applicationId} ·{" "}
                        {connection.personaIds.length}{" "}
                        {t("apps.assistants", { defaultValue: "assistants" })}
                      </span>
                    </span>
                    <span className="shrink-0 text-meta text-muted-foreground">
                      {stateLabel(connection)}
                    </span>
                  </button>
                ))
              ) : (
                <p className="py-4 text-body text-muted-foreground">
                  {t("apps.noConnections", {
                    defaultValue: "No matching connections",
                  })}
                </p>
              )}
            </SettingsGroup>
            <SettingsGroup
              title={t("apps.catalog", {
                defaultValue: "Available applications",
              })}
            >
              {APPLICATION_CATALOG.filter((app) => matches(app.name)).map(
                (app) => (
                  <div
                    key={app.id}
                    className="flex items-center justify-between gap-4 py-3.5"
                  >
                    <div>
                      <div className="text-body">{app.name}</div>
                      <div className="text-meta text-muted-foreground">
                        {app.requiresClient
                          ? t("apps.ownOAuth", {
                              defaultValue:
                                "Requires your own OAuth application",
                            })
                          : t("apps.browserOAuth", {
                              defaultValue: "Authorize in your browser",
                            })}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={adding !== null}
                      aria-label={`${t("apps.add", { defaultValue: "Add" })} ${app.name}`}
                      onClick={() => void add(app.id)}
                    >
                      <Plus className="size-3.5" />
                      {t("apps.add", { defaultValue: "Add" })}
                    </Button>
                  </div>
                ),
              )}
            </SettingsGroup>
          </div>
        )}
      </div>
    </section>
  );
}
