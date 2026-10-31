import type { InstalledSkill, ProductSkillScope } from "@cocurdex/shared";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { SettingsGroup } from "@/components";
import { Button, Spinner, Text } from "@/components/ui";
import { desktopApi } from "@/lib";
import type { ProductSkillsStatus } from "@/lib/types";
import type { SkillPackState } from "./use-skill-pack";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function usePackStatusText(status: ProductSkillsStatus | undefined) {
  const { t } = useTranslation("settings");
  if (!status) {
    return "";
  }
  if (!status.sourceAvailable) {
    return t("skills.status.sourceMissing", { path: status.sourceRoot });
  }
  if (status.conflict) {
    return t("skills.status.conflict", {
      skills: status.conflictSkills.join(", "),
      path: status.agentsSkillsDir,
    });
  }
  if (status.installed && status.updateAvailable) {
    return t("skills.status.updateAvailable", { path: status.agentsSkillsDir });
  }
  if (status.installed && status.modified) {
    return t("skills.status.modified", { path: status.agentsSkillsDir });
  }
  if (status.installed) {
    return t("skills.status.installed", { path: status.agentsSkillsDir });
  }
  return t("skills.status.notInstalled", { path: status.agentsSkillsDir });
}

function useInstallLabel(status: ProductSkillsStatus | undefined) {
  const { t } = useTranslation("settings");
  if (!status?.installed) {
    return t("skills.actions.install");
  }
  if (status.updateAvailable) {
    return t("skills.actions.update");
  }
  return status.modified ? t("skills.actions.restore") : null;
}

function PackScopeRow({
  pack,
  scope,
  onChanged,
}: {
  pack: SkillPackState;
  scope: ProductSkillScope;
  onChanged(): void;
}) {
  const { t } = useTranslation("settings");
  const [busy, setBusy] = useState(false);
  const status = pack.statuses[scope];
  const statusText = usePackStatusText(status);
  const rootPath = scope === "project" ? pack.workspaceRootPath : null;

  const install = async () => {
    setBusy(true);
    try {
      const result = await desktopApi.installProductSkills(scope, rootPath);
      pack.setStatus(scope, result);
      onChanged();
      if (result.action === "conflict") {
        toast.error(
          t("skills.toast.conflict", {
            skills: result.conflictSkills.join(", "),
          }),
        );
      } else {
        toast.success(t(`skills.toast.${result.action}`));
      }
    } catch (error) {
      toast.error(errorMessage(error, t("skills.toast.installFailed")));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await desktopApi.removeProductSkills(scope, rootPath);
      await pack.refresh();
      onChanged();
      toast.success(t("skills.toast.removed"));
    } catch (error) {
      toast.error(errorMessage(error, t("skills.toast.removeFailed")));
    } finally {
      setBusy(false);
    }
  };

  const installLabel = useInstallLabel(status);
  const canInstall =
    Boolean(status?.sourceAvailable) && !status?.conflict && !busy;
  const canRemove = Boolean(status?.installed || status?.managed) && !busy;

  return (
    <div
      className="flex items-center justify-between gap-6 py-3.5"
      data-skill-pack-scope={scope}
    >
      <div className="min-w-0 flex-1">
        <Text as="div" size="body" weight="medium">
          {t(`skills.scope.${scope}.title`)}
        </Text>
        <Text as="div" className="mt-0.5 break-all" size="meta" tone="muted">
          {statusText}
        </Text>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {busy ? <Spinner size="sm" /> : null}
        {installLabel ? (
          <Button
            disabled={!canInstall}
            size="sm"
            variant="outline"
            onClick={() => void install()}
          >
            {installLabel}
          </Button>
        ) : null}
        <Button
          disabled={!canRemove}
          size="sm"
          variant="ghost"
          onClick={() => void remove()}
        >
          {t("skills.actions.remove")}
        </Button>
      </div>
    </div>
  );
}

export function SkillPackDetail({
  builtin,
  pack,
  onChanged,
  onOpenSkill,
}: {
  builtin: InstalledSkill[];
  pack: SkillPackState;
  onChanged(): void;
  onOpenSkill(name: string): void;
}) {
  const { t } = useTranslation("settings");
  const packSkills =
    pack.statuses.global?.packSkills ??
    builtin.map(({ name, description }) => ({ name, description }));
  const scopes: ProductSkillScope[] = pack.workspaceRootPath
    ? ["global", "project"]
    : ["global"];

  return (
    <section
      aria-label={t("skills.pack.title")}
      className="flex flex-col gap-6"
      data-skill-detail="cocurdex"
    >
      <div className="flex flex-col gap-1">
        <Text as="h2" size="display" weight="semibold">
          {t("skills.pack.title")}
        </Text>
        <Text size="body" tone="muted">
          {t("skills.intro")}
        </Text>
      </div>
      <SettingsGroup title={t("skills.groupTitle")}>
        {scopes.map((scope) => (
          <PackScopeRow
            key={scope}
            pack={pack}
            scope={scope}
            onChanged={onChanged}
          />
        ))}
      </SettingsGroup>
      {packSkills.length > 0 ? (
        <SettingsGroup
          title={t("skills.pack.included", { count: packSkills.length })}
        >
          {packSkills.map((skill) => (
            <button
              className="-mx-4 flex items-center gap-3 px-4 py-3 text-start transition-colors first:rounded-t-card last:rounded-b-card hover:bg-muted/50"
              data-item-path={skill.name}
              key={skill.name}
              type="button"
              onClick={() => onOpenSkill(skill.name)}
            >
              <div className="min-w-0 flex-1">
                <Text
                  as="div"
                  className="font-mono"
                  size="body"
                  weight="medium"
                >
                  {skill.name}
                </Text>
                {skill.description ? (
                  <Text as="div" className="mt-0.5" size="meta" tone="muted">
                    {skill.description}
                  </Text>
                ) : null}
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" />
            </button>
          ))}
        </SettingsGroup>
      ) : null}
    </section>
  );
}
