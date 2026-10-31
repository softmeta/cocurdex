import type { SkillAuditFinding, SkillCatalogResult } from "@cocurdex/shared";
import { useTranslation } from "react-i18next";
import { SettingsGroup } from "@/components";
import { Badge, Button, Text } from "@/components/ui";
import { SkillDocumentSection, SkillFilesSection } from "./skill-files-section";
import { queryErrorMessage, useCatalogSkillQuery } from "./skill-queries";
import { SkillSourceReading } from "./skill-source-detail";

const AUDIT_PROVIDER_NAMES: Record<SkillAuditFinding["provider"], string> = {
  ath: "Gen Agent Trust Hub",
  socket: "Socket",
  snyk: "Snyk",
};

const RISK_BADGE_VARIANTS = {
  safe: "outline",
  low: "outline",
  medium: "secondary",
  high: "destructive",
  critical: "destructive",
} as const;

function AuditRow({ finding }: { finding: SkillAuditFinding }) {
  const { t } = useTranslation("settings");
  return (
    <div
      className="flex items-center justify-between gap-6 py-3"
      data-skill-audit={finding.provider}
    >
      <Text size="body">{AUDIT_PROVIDER_NAMES[finding.provider]}</Text>
      <Badge variant={RISK_BADGE_VARIANTS[finding.risk]}>
        {t(`skills.audit.risk.${finding.risk}`)}
      </Badge>
    </div>
  );
}

export function SkillCatalogDetail({
  installed,
  result,
  onInstall,
}: {
  installed: boolean;
  result: SkillCatalogResult;
  onInstall(source: string, skillPaths: string[]): void;
}) {
  const { t } = useTranslation("settings");
  const query = useCatalogSkillQuery(result);
  const data = query.data;
  const error = queryErrorMessage(query.error);
  const skill = data?.detail.skill;

  return (
    <section
      aria-label={result.name}
      className="flex flex-col gap-6"
      data-skill-catalog-result={result.id}
    >
      <div className="flex flex-col gap-2">
        <div className="flex min-h-8 flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Text
              as="h2"
              className="font-mono"
              size="display"
              weight="semibold"
            >
              {result.name}
            </Text>
            {installed ? (
              <Badge variant="outline">{t("skills.add.installed")}</Badge>
            ) : null}
          </div>
          <Button
            disabled={!skill?.installable}
            size="sm"
            onClick={() => {
              if (skill) onInstall(result.source, [skill.skillPath]);
            }}
          >
            {t("skills.discover.install")}
          </Button>
        </div>
        <Text className="font-mono" size="meta" tone="muted">
          {t("skills.discover.resultMeta", {
            source: result.source,
            count: result.installs,
          })}
        </Text>
        {skill?.description ? (
          <Text size="body" tone="muted">
            {skill.description}
          </Text>
        ) : null}
      </div>
      {error ? (
        <Text role="alert" size="meta" tone="destructive">
          {error}
        </Text>
      ) : null}
      {!data && !error ? <SkillSourceReading source={result.source} /> : null}
      {data ? (
        <>
          <SettingsGroup
            description={t("skills.audit.description")}
            title={t("skills.audit.title")}
          >
            {data.findings.length === 0 ? (
              <Text as="div" className="py-3" size="meta" tone="muted">
                {t("skills.audit.none")}
              </Text>
            ) : null}
            {data.findings.map((finding) => (
              <AuditRow finding={finding} key={finding.provider} />
            ))}
          </SettingsGroup>
          <SkillFilesSection
            files={data.detail.files}
            revealPath={null}
            scriptCount={data.detail.skill.scriptCount}
          />
          <SkillDocumentSection document={data.detail.document} />
        </>
      ) : null}
    </section>
  );
}
