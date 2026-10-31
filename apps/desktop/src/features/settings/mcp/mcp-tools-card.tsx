import type { McpServerStatus } from "@cocurdex/shared";
import { useTranslation } from "react-i18next";
import { SettingsGroup } from "@/components/app";
import { Text } from "@/components/ui";

function formatCheckedAt(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function McpToolsCard({
  isChecking,
  status,
}: {
  isChecking: boolean;
  status: McpServerStatus | undefined;
}) {
  const { i18n, t } = useTranslation("settings");
  const tools = status?.tools ?? [];

  let caption: string = t("mcp.tools.notChecked");
  if (isChecking) caption = t("mcp.tools.checking");
  else if (status) {
    caption = t("mcp.tools.checkedAt", {
      time: formatCheckedAt(status.checkedAt, i18n.language),
    });
  }

  let emptyText: string = t("mcp.tools.notChecked");
  if (isChecking) emptyText = t("mcp.tools.checking");
  else if (status?.state === "disabled") emptyText = t("mcp.tools.disabled");
  else if (status?.state === "needs-auth") emptyText = t("mcp.tools.needsAuth");
  else if (status?.state === "connected") emptyText = t("mcp.tools.none");

  return (
    <section aria-label={t("mcp.tools.title")}>
      <SettingsGroup
        action={
          <Text size="meta" tone="muted">
            {caption}
          </Text>
        }
        title={t("mcp.tools.titleWithCount", { count: tools.length })}
      >
        {status?.state === "failed" && status.error ? (
          <Text className="py-3" role="alert" size="meta" tone="destructive">
            {status.error}
          </Text>
        ) : null}
        {tools.length === 0 && status?.state !== "failed" ? (
          <Text className="py-3" size="meta" tone="muted">
            {emptyText}
          </Text>
        ) : null}
        {tools.map((tool) => (
          <div
            className="flex min-w-0 flex-col gap-0.5 py-2.5"
            data-mcp-tool={tool.name}
            key={tool.name}
          >
            <Text className="font-mono" size="body" weight="medium">
              {tool.name}
            </Text>
            {tool.description ? (
              <Text className="line-clamp-2" size="meta" tone="muted">
                {tool.description}
              </Text>
            ) : null}
          </div>
        ))}
      </SettingsGroup>
    </section>
  );
}
