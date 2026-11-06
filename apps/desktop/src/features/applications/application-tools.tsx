import type { ApplicationConnection } from "@cocurdex/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import useSWR from "swr";
import { SettingsGroup } from "@/components";
import { Button } from "@/components/ui";
import { requestDaemon } from "@/lib";

export function ApplicationTools({
  connection,
}: {
  connection: ApplicationConnection;
}) {
  const { t } = useTranslation("personal");
  const [showTools, setShowTools] = useState(false);
  const { data: tools, error: toolError } = useSWR(
    showTools
      ? ["application.tools", connection.id, connection.revision]
      : null,
    () => requestDaemon("application.tools", { id: connection.id }),
    { dedupingInterval: 0 },
  );
  return (
    <SettingsGroup title={t("apps.tools", { defaultValue: "Available tools" })}>
      <div className="py-3.5">
        <Button
          variant="ghost"
          disabled={!connection.configured || !connection.enabled}
          onClick={() => setShowTools((value) => !value)}
        >
          {t("apps.inspectTools", { defaultValue: "Inspect tools" })}
        </Button>
        {toolError ? (
          <p role="alert" className="break-words text-meta text-destructive">
            {String(toolError)}
          </p>
        ) : null}
        {showTools
          ? tools?.map((tool) => (
              <div key={tool.name} className="py-2">
                <div className="text-body">{tool.name}</div>
                <div className="text-meta text-muted-foreground">
                  {tool.description}
                </div>
              </div>
            ))
          : null}
      </div>
    </SettingsGroup>
  );
}
