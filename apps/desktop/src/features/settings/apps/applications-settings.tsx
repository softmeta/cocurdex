import { APPLICATION_CATALOG, type ApplicationId } from "@cocurdex/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button, Text } from "@/components/ui";
import { usePersonalAgents } from "@/features/personal";
import { requestDaemon } from "@/lib";
import { ApplicationBrowser } from "./application-browser";
import { ApplicationPage } from "./application-page";
import { useApplications } from "./application-queries";
import { isApplicationConnected } from "./application-state";
import { useApplicationLogin } from "./use-application-login";

export function ApplicationsSettingsPanel() {
  const { t } = useTranslation("personal");
  const { data, error, mutate } = useApplications();
  const { agents } = usePersonalAgents();
  const [openId, setOpenId] = useState<ApplicationId | null>(null);
  const [adding, setAdding] = useState<ApplicationId | null>(null);
  const login = useApplicationLogin(() => mutate());
  const connections = data ?? [];

  async function connect(applicationId: ApplicationId) {
    setOpenId(applicationId);
    setAdding(applicationId);
    try {
      const pending = connections.find(
        (item) =>
          item.applicationId === applicationId &&
          item.enabled &&
          !isApplicationConnected(item),
      );
      const connection =
        pending ??
        (await requestDaemon("application.add", {
          applicationId,
          displayName:
            APPLICATION_CATALOG.find((app) => app.id === applicationId)?.name ??
            applicationId,
          personaIds: [],
        }));
      await mutate();
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
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5 overflow-auto pe-1">
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
      {openId ? (
        <ApplicationPage
          agents={agents}
          applicationId={openId}
          busy={adding !== null || login.busyId !== null}
          connections={connections.filter(
            (item) => item.applicationId === openId,
          )}
          login={login}
          onBack={() => setOpenId(null)}
          onChanged={() => mutate()}
          onConnect={() => void connect(openId)}
          onSaved={(next) =>
            mutate(
              (current) =>
                current?.map((item) => (item.id === next.id ? next : item)),
              { revalidate: false },
            )
          }
        />
      ) : (
        <>
          <Text className="max-w-2xl shrink-0" size="body" tone="muted">
            {t("apps.description")}
          </Text>
          <ApplicationBrowser
            busyId={adding}
            connections={connections}
            onConnect={(id) => void connect(id)}
            onOpen={setOpenId}
          />
        </>
      )}
    </div>
  );
}
