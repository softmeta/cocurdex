import type {
  InstalledSkill,
  SkillCatalogSource,
  SkillSourceSkill,
} from "@cocurdex/shared";
import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SettingsGroup } from "@/components";
import { Badge, Button, IconButton, Spinner, Text } from "@/components/ui";
import { desktopApi } from "@/lib";
import { queryErrorMessage, useSourceSnapshotQuery } from "./skill-queries";

export function SourceSkillRow({
  installed,
  skill,
  onInstall,
}: {
  installed: boolean;
  skill: SkillSourceSkill;
  onInstall(skillPath: string): void;
}) {
  const { t } = useTranslation("settings");
  return (
    <div
      className="flex items-center justify-between gap-6 py-3"
      data-skill-source-path={skill.skillPath}
    >
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <Text className="font-mono" size="body" truncate weight="medium">
            {skill.name}
          </Text>
          {installed ? (
            <Badge variant="outline">{t("skills.add.installed")}</Badge>
          ) : null}
        </div>
        {skill.description ? (
          <Text
            as="div"
            className="mt-0.5 line-clamp-2"
            size="meta"
            tone="muted"
          >
            {skill.description}
          </Text>
        ) : null}
      </div>
      <Button
        aria-label={t("skills.discover.installSkill", { name: skill.name })}
        disabled={!skill.installable}
        size="sm"
        variant="outline"
        onClick={() => onInstall(skill.skillPath)}
      >
        {t("skills.discover.install")}
      </Button>
    </div>
  );
}

export function SkillSourceReading({ source }: { source: string }) {
  const { t } = useTranslation("settings");
  return (
    <div aria-busy className="flex items-center gap-2" role="status">
      <Spinner size="sm" />
      <Text size="meta" tone="muted">
        {t("skills.discover.reading", { source })}
      </Text>
    </div>
  );
}

export function SkillSourceDetail({
  installed,
  source,
  onInstall,
}: {
  installed: InstalledSkill[];
  source: SkillCatalogSource;
  onInstall(source: string, skillPaths?: string[]): void;
}) {
  const { t } = useTranslation("settings");
  const query = useSourceSnapshotQuery(source.source);
  const snapshot = query.data;
  const error = queryErrorMessage(query.error);
  const installedNames = new Set(installed.map((skill) => skill.name));

  return (
    <section
      aria-label={source.title}
      className="flex flex-col gap-6"
      data-skill-catalog-source={source.source}
    >
      <div className="flex flex-col gap-2">
        <div className="flex min-h-8 flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1">
            <Text as="h2" size="display" weight="semibold">
              {source.title}
            </Text>
            <IconButton
              aria-label={t("skills.info.openSource")}
              size="xs"
              onClick={() => void desktopApi.openExternal(source.url)}
            >
              <ExternalLink />
            </IconButton>
          </div>
          <Button
            disabled={!snapshot || snapshot.skills.length === 0}
            size="sm"
            onClick={() => onInstall(source.source)}
          >
            {t("skills.discover.chooseSkills")}
          </Button>
        </div>
        <Text size="body" tone="muted">
          {source.description}
        </Text>
        <Text className="font-mono" size="meta" tone="muted">
          {source.source}
        </Text>
      </div>
      {error ? (
        <Text role="alert" size="meta" tone="destructive">
          {error}
        </Text>
      ) : null}
      {!snapshot && !error ? (
        <SkillSourceReading source={source.source} />
      ) : null}
      {snapshot ? (
        <SettingsGroup
          title={t("skills.discover.sourceSkills", {
            count: snapshot.skills.length,
          })}
        >
          {snapshot.skills.map((skill) => (
            <SourceSkillRow
              installed={installedNames.has(skill.name)}
              key={skill.skillPath || skill.name}
              skill={skill}
              onInstall={(skillPath) => onInstall(source.source, [skillPath])}
            />
          ))}
        </SettingsGroup>
      ) : null}
    </section>
  );
}
