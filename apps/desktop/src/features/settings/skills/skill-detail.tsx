import type {
  InstalledSkill,
  InstalledSkillDetail,
  SkillLinkAgent,
} from "@cocurdex/shared";
import { ArrowUpCircle } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AppRemoveButton, SettingsGroup } from "@/components";
import { Badge, Button, Text } from "@/components/ui";
import { SkillAgentsSection } from "./skill-agents-section";
import { SkillDocumentSection, SkillFilesSection } from "./skill-files-section";
import { SkillInfoList } from "./skill-info-list";
import {
  hasPendingUpdate,
  isBrokenLinkOnly,
  skillRef,
} from "./skill-library-model";
import { SkillProblemsSection } from "./skill-problems-section";
import { SkillUpdateDialog } from "./skill-update-dialog";
import { skillsApi } from "./skills-api";
import { useSkillDetail } from "./use-skill-detail";

export function SkillDetail({
  skill,
  onChanged,
  onRemoved,
}: {
  skill: InstalledSkill;
  onChanged(): void;
  onRemoved(): void;
}) {
  const { t } = useTranslation("settings");
  const ref = skillRef(skill);
  const { detail, error, isBusy, run } = useSkillDetail(ref);
  const [isUpdateOpen, setIsUpdateOpen] = useState(false);
  const current = detail?.skill ?? skill;
  const brokenLinkOnly = isBrokenLinkOnly(current);
  const removeDescription = brokenLinkOnly
    ? t("skills.detail.removeBrokenDescription", { name: current.name })
    : t("skills.detail.removeDescription", { name: current.name });

  const mutate = async (action: () => Promise<InstalledSkillDetail>) => {
    if (await run(action)) {
      onChanged();
    }
  };

  const toggleAgent = (agent: SkillLinkAgent, enabled: boolean) =>
    void mutate(() => skillsApi.setAgentLink({ ...ref, agent, enabled }));

  const remove = async () => {
    const removed = await run(async () => {
      await skillsApi.remove(ref);
      return null;
    });
    if (removed) {
      onRemoved();
    }
  };

  return (
    <section
      aria-label={t("skills.detail.label", { name: current.name })}
      className="flex flex-col gap-6"
      data-skill-detail={current.name}
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
              {current.name}
            </Text>
            {hasPendingUpdate(current) ? (
              <Badge variant="secondary">
                {t("skills.detail.updateBadge")}
              </Badge>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {current.update ? (
              <Button
                disabled={isBusy}
                size="sm"
                variant="outline"
                onClick={() => setIsUpdateOpen(true)}
              >
                <ArrowUpCircle className="size-4" />
                {t("skills.detail.reviewUpdate")}
              </Button>
            ) : null}
          </div>
        </div>
        {current.description ? (
          <Text size="body" tone="muted">
            {current.description}
          </Text>
        ) : null}
        {error ? (
          <Text role="alert" size="meta" tone="destructive">
            {error}
          </Text>
        ) : null}
      </div>

      <SkillInfoList
        license={detail?.document?.license ?? null}
        skill={current}
      />

      <SkillProblemsSection
        brokenLinkOnly={brokenLinkOnly}
        disabled={isBusy}
        problems={current.problems}
        onKeepCopy={(keepPath) =>
          void mutate(() => skillsApi.resolveDuplicate({ ...ref, keepPath }))
        }
      />

      {current.agents.length > 0 ? (
        <SkillAgentsSection
          disabled={isBusy || current.builtin}
          skill={current}
          onShare={() => void mutate(() => skillsApi.share(ref))}
          onToggle={toggleAgent}
        />
      ) : null}

      {detail && !brokenLinkOnly ? (
        <>
          <SkillFilesSection
            files={detail.files}
            revealPath={current.path}
            scriptCount={current.scriptCount}
          />
          <SkillDocumentSection document={detail.document} />
        </>
      ) : null}

      {current.builtin ? null : (
        <SettingsGroup title={t("skills.detail.manageTitle")}>
          <div className="flex items-center py-2">
            <AppRemoveButton
              cancelLabel={t("skills.actions.cancel")}
              confirmDescription={removeDescription}
              confirmLabel={t("skills.actions.remove")}
              confirmTitle={t("skills.detail.removeTitle", {
                name: current.name,
              })}
              disabled={isBusy}
              label={t("skills.actions.remove")}
              onConfirm={() => void remove()}
            />
          </div>
        </SettingsGroup>
      )}
      {isUpdateOpen && current.update ? (
        <SkillUpdateDialog
          skill={current}
          onClose={() => setIsUpdateOpen(false)}
          onUpdated={() => void mutate(() => skillsApi.show(ref))}
        />
      ) : null}
    </section>
  );
}
