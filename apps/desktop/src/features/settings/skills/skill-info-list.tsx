import type { InstalledSkill } from "@cocurdex/shared";
import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { IconButton, Text } from "@/components/ui";
import { desktopApi } from "@/lib";
import { shortCommit, sourceDisplay } from "./skill-library-model";

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString() : null;
}

export function SkillInfoList({
  license,
  skill,
}: {
  license: string | null;
  skill: InstalledSkill;
}) {
  const { t } = useTranslation("settings");
  const source = skill.source;
  const sourceText = sourceDisplay(source) ?? t("skills.source.unknown");
  const sourceUrl = source?.url ?? null;
  const installed = formatDate(source?.updatedAt ?? source?.installedAt);
  const latest = shortCommit(skill.update?.latestCommit);
  const rows: Array<{ label: string; value: ReactNode }> = [
    {
      label: t("skills.info.source"),
      value: (
        <span className="flex min-w-0 items-center gap-1">
          <span className="break-all">{sourceText}</span>
          {sourceUrl ? (
            <IconButton
              aria-label={t("skills.info.openSource")}
              size="xs"
              onClick={() => void desktopApi.openExternal(sourceUrl)}
            >
              <ExternalLink />
            </IconButton>
          ) : null}
        </span>
      ),
    },
    ...(source?.ref
      ? [{ label: t("skills.info.ref"), value: source.ref }]
      : []),
    ...(installed
      ? [{ label: t("skills.info.installed"), value: installed }]
      : []),
    ...(latest ? [{ label: t("skills.info.latest"), value: latest }] : []),
    {
      label: t("skills.info.location"),
      value: <span className="break-all font-mono">{skill.path}</span>,
    },
    ...(license ? [{ label: t("skills.info.license"), value: license }] : []),
  ];

  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2">
      {rows.map((row) => (
        <div className="contents" key={row.label}>
          <Text as="dt" size="meta" tone="muted">
            {row.label}
          </Text>
          <Text as="dd" className="min-w-0" size="meta">
            {row.value}
          </Text>
        </div>
      ))}
    </dl>
  );
}
