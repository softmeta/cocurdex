import type { APPLICATION_CATALOG } from "@cocurdex/shared";
import { ArrowUpRight, Plug } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Text } from "@/components/ui";
import { desktopApi } from "@/lib";

export function ApplicationCatalogDetail({
  app,
  authHint,
  busy,
  connected,
  onConnect,
}: {
  app: (typeof APPLICATION_CATALOG)[number];
  authHint: string;
  busy: boolean;
  connected: boolean;
  onConnect(): void;
}) {
  const { t } = useTranslation("personal");
  const connectLabel = connected
    ? t("apps.connectAnother", { defaultValue: "Connect another account" })
    : t("apps.connect", { defaultValue: "Connect" });

  return (
    <section
      aria-label={app.name}
      className="flex flex-col gap-2"
      data-catalog-application-detail={app.id}
    >
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-3">
        <Text as="h2" size="display" weight="semibold">
          {app.name}
        </Text>
        <Button
          size="sm"
          disabled={busy}
          aria-label={`${connectLabel} ${app.name}`}
          onClick={onConnect}
        >
          <Plug className="size-3.5" />
          {connectLabel}
        </Button>
      </div>
      <Text size="body" tone="muted">
        {authHint}
      </Text>
      <div>
        <Button
          className="-ms-2"
          size="sm"
          variant="ghost"
          onClick={() => void desktopApi.openExternal(app.documentationUrl)}
        >
          <ArrowUpRight className="size-3.5" />
          {t("apps.providerDocs", { defaultValue: "Provider instructions" })}
        </Button>
      </div>
    </section>
  );
}
