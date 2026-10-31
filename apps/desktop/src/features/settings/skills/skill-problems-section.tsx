import type { SkillCopy, SkillProblem } from "@cocurdex/shared";
import { useTranslation } from "react-i18next";
import { SettingsGroup } from "@/components";
import { Button, Text } from "@/components/ui";

function CopyRow({
  copy,
  disabled,
  onKeep,
}: {
  copy: SkillCopy;
  disabled: boolean;
  onKeep(path: string): void;
}) {
  const { t } = useTranslation("settings");
  const modified = copy.modifiedAt
    ? new Date(copy.modifiedAt).toLocaleString()
    : null;
  return (
    <div
      className="flex items-center justify-between gap-6 py-3"
      data-item-path={copy.path}
    >
      <div className="min-w-0 flex-1">
        <Text as="div" className="break-all font-mono" size="meta">
          {copy.path}
        </Text>
        <Text as="div" className="mt-0.5" size="meta" tone="muted">
          {t("skills.problems.copyMeta", {
            count: copy.fileCount,
            modified: modified ?? "—",
          })}
        </Text>
      </div>
      <Button
        disabled={disabled}
        size="sm"
        variant="outline"
        onClick={() => onKeep(copy.path)}
      >
        {t("skills.problems.keepCopy")}
      </Button>
    </div>
  );
}

function ProblemGroup({
  disabled,
  problem,
  onKeepCopy,
}: {
  disabled: boolean;
  problem: SkillProblem;
  onKeepCopy(path: string): void;
}) {
  const { t } = useTranslation("settings");
  if (problem.kind === "invalid") {
    return (
      <SettingsGroup
        description={t("skills.problems.invalidDescription")}
        title={t("skills.problems.invalidTitle")}
      >
        <ul className="flex list-disc flex-col gap-1 py-3 ps-5">
          {problem.issues.map((issue) => (
            <li key={issue}>
              <Text size="body">{t(`skills.problems.issue.${issue}`)}</Text>
            </li>
          ))}
        </ul>
      </SettingsGroup>
    );
  }
  if (problem.kind === "duplicate") {
    return (
      <SettingsGroup
        description={t("skills.problems.duplicateDescription")}
        title={t("skills.problems.duplicateTitle")}
      >
        {problem.copies.map((copy) => (
          <CopyRow
            copy={copy}
            disabled={disabled}
            key={copy.path}
            onKeep={onKeepCopy}
          />
        ))}
      </SettingsGroup>
    );
  }
  return null;
}

function BrokenLinksGroup({
  paths,
  removable,
}: {
  paths: string[];
  removable: boolean;
}) {
  const { t } = useTranslation("settings");
  const description = removable
    ? t("skills.problems.brokenLinkRemovableDescription")
    : t("skills.problems.brokenLinkDescription");
  return (
    <SettingsGroup
      description={description}
      title={t("skills.problems.brokenLinkTitle", { count: paths.length })}
    >
      {paths.map((path) => (
        <Text
          as="div"
          className="break-all py-3 font-mono"
          data-item-path={path}
          key={path}
          size="meta"
        >
          {path}
        </Text>
      ))}
    </SettingsGroup>
  );
}

export function SkillProblemsSection({
  brokenLinkOnly,
  disabled,
  problems,
  onKeepCopy,
}: {
  brokenLinkOnly: boolean;
  disabled: boolean;
  problems: SkillProblem[];
  onKeepCopy(path: string): void;
}) {
  const brokenPaths = problems.flatMap((problem) =>
    problem.kind === "brokenLink" ? [problem.path] : [],
  );
  return (
    <>
      {problems.map((problem) => (
        <ProblemGroup
          disabled={disabled}
          key={problem.kind === "brokenLink" ? problem.path : problem.kind}
          problem={problem}
          onKeepCopy={onKeepCopy}
        />
      ))}
      {brokenPaths.length > 0 ? (
        <BrokenLinksGroup paths={brokenPaths} removable={brokenLinkOnly} />
      ) : null}
    </>
  );
}
