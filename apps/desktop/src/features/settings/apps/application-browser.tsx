import {
  APPLICATION_CATALOG,
  type ApplicationConnection,
  type ApplicationId,
} from "@cocurdex/shared";
import { Check, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AppSearchInput } from "@/components";
import { Button, Text, ToggleGroup, ToggleGroupItem } from "@/components/ui";
import { applicationAuthHint } from "./application-auth-hint";
import { ApplicationIcon } from "./application-icon";
import { applicationStateLabel } from "./application-state";
import { ApplicationTile } from "./application-tile";

type CatalogApp = (typeof APPLICATION_CATALOG)[number];
type Category = "all" | "connected" | CatalogApp["category"];

const CATEGORIES = [
  ...new Set(APPLICATION_CATALOG.map((app) => app.category)),
] as CatalogApp["category"][];

export function ApplicationBrowser({
  busyId,
  connections,
  onConnect,
  onOpen,
}: {
  busyId: ApplicationId | null;
  connections: readonly ApplicationConnection[];
  onConnect(applicationId: ApplicationId): void;
  onOpen(applicationId: ApplicationId): void;
}) {
  const { t } = useTranslation("personal");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("all");
  const addedIds = [
    ...new Set(connections.map((item) => item.applicationId)),
  ] as ApplicationId[];
  const search = query.trim().toLocaleLowerCase();
  const visible = APPLICATION_CATALOG.filter((app) => {
    if (search && !app.name.toLocaleLowerCase().includes(search)) return false;
    if (category === "connected") return addedIds.includes(app.id);
    return category === "all" || app.category === category;
  });
  const sections =
    category === "all" && !search
      ? CATEGORIES.map((id) => ({
          id,
          apps: visible.filter((app) => app.category === id),
        }))
      : [{ id: null, apps: visible }];

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-56 flex-1">
          <AppSearchInput
            aria-label={t("apps.search", {
              defaultValue: "Search applications",
            })}
            placeholder={t("apps.search", {
              defaultValue: "Search applications",
            })}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        {addedIds.length ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setCategory("connected")}
          >
            <span className="flex items-center gap-1">
              {addedIds.map((id) => (
                <ApplicationIcon applicationId={id} key={id} />
              ))}
            </span>
            {t("apps.addedCount", {
              count: addedIds.length,
              defaultValue: "{{count}} added",
            })}
            <ChevronRight className="size-3.5 text-muted-foreground rtl:-scale-x-100" />
          </Button>
        ) : null}
      </div>
      <ToggleGroup
        aria-label={t("apps.categoryLabel", { defaultValue: "Category" })}
        className="flex-wrap"
        spacing={1}
        type="single"
        value={category}
        onValueChange={(value) => {
          if (value) setCategory(value as Category);
        }}
      >
        {(["all", "connected", ...CATEGORIES] as Category[]).map((id) => (
          <ToggleGroupItem
            className="rounded-full px-3 font-normal text-muted-foreground data-pressed:text-foreground"
            key={id}
            value={id}
          >
            {t(`apps.categories.${id}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {visible.length === 0 ? (
        <Text size="body" tone="muted">
          {t("apps.noConnections", {
            defaultValue: "No matching connections",
          })}
        </Text>
      ) : null}
      {sections.map((section) =>
        section.apps.length ? (
          <section
            aria-label={
              section.id ? t(`apps.categories.${section.id}`) : undefined
            }
            className="flex flex-col gap-2"
            key={section.id ?? "results"}
          >
            {section.id ? (
              <Text size="body" weight="medium">
                {t(`apps.categories.${section.id}`)}
              </Text>
            ) : null}
            <div className="grid grid-cols-1 gap-x-6 gap-y-1 lg:grid-cols-2">
              {section.apps.map((app) => (
                <ApplicationRow
                  app={app}
                  busy={busyId === app.id}
                  connection={connections.find(
                    (item) => item.applicationId === app.id,
                  )}
                  key={app.id}
                  onConnect={() => onConnect(app.id)}
                  onOpen={() => onOpen(app.id)}
                />
              ))}
            </div>
          </section>
        ) : null,
      )}
    </div>
  );
}

function ApplicationRow({
  app,
  busy,
  connection,
  onConnect,
  onOpen,
}: {
  app: CatalogApp;
  busy: boolean;
  connection: ApplicationConnection | undefined;
  onConnect(): void;
  onOpen(): void;
}) {
  const { t } = useTranslation("personal");
  return (
    <div
      className="relative flex min-w-0 items-center gap-3 rounded-card p-2 transition-colors hover:bg-muted/60"
      data-catalog-application={app.id}
    >
      <ApplicationTile applicationId={app.id} />
      <button
        aria-label={app.name}
        className="flex min-w-0 flex-1 flex-col text-start outline-none after:absolute after:inset-0 after:rounded-card focus-visible:after:ring-2 focus-visible:after:ring-ring/50"
        type="button"
        onClick={onOpen}
      >
        <Text className="truncate" size="body" weight="medium">
          {app.name}
        </Text>
        <Text className="truncate" size="meta" tone="muted">
          {applicationAuthHint(app.id, t)}
        </Text>
      </button>
      {connection ? (
        <span className="relative flex shrink-0 items-center gap-1 text-meta text-muted-foreground">
          {connection.status?.state === "connected" ? (
            <Check className="size-3.5" />
          ) : null}
          {connection.status
            ? applicationStateLabel(connection, t)
            : t("apps.addedState", { defaultValue: "Added" })}
        </span>
      ) : (
        <Button
          className="relative"
          disabled={busy}
          size="sm"
          variant="secondary"
          onClick={onConnect}
        >
          {t("apps.connect", { defaultValue: "Connect" })}
        </Button>
      )}
    </div>
  );
}
