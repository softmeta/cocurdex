import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/ui";
import { SkillDocumentSection, SkillFilesSection } from "./skill-files-section";
import { queryErrorMessage, usePackSkillQuery } from "./skill-queries";

export function SkillPackSkillDetail({
  name,
  onBack,
}: {
  name: string;
  onBack(): void;
}) {
  const { t } = useTranslation("settings");
  const query = usePackSkillQuery(name);
  const detail = query.data;
  const error = queryErrorMessage(query.error);

  return (
    <section
      aria-label={t("skills.detail.label", { name })}
      className="flex flex-col gap-6"
      data-skill-pack-skill={name}
    >
      <div className="flex flex-col gap-2">
        <Text
          as="h2"
          className="flex min-h-8 min-w-0 items-center gap-1"
          size="display"
          weight="semibold"
        >
          <button
            className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
            type="button"
            onClick={onBack}
          >
            {t("skills.pack.title")}
          </button>
          <ChevronRight className="size-5 shrink-0 text-muted-foreground rtl:rotate-180" />
          <span className="min-w-0 truncate font-mono">{name}</span>
        </Text>
        {detail?.skill.description ? (
          <Text size="body" tone="muted">
            {detail.skill.description}
          </Text>
        ) : null}
        {error ? (
          <Text role="alert" size="meta" tone="destructive">
            {error}
          </Text>
        ) : null}
      </div>
      {detail ? (
        <>
          <SkillFilesSection
            files={detail.files}
            revealPath={null}
            scriptCount={
              detail.files.filter((file) => file.kind === "script").length
            }
          />
          <SkillDocumentSection document={detail.document} />
        </>
      ) : null}
    </section>
  );
}
