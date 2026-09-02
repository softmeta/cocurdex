import { useAtomValue } from "jotai";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button, Spinner, Text } from "@/components/ui";
import { activeWorkspaceIdAtom, workspacesAtom } from "@/features/workspaces";
import { desktopApi, useMountEffect } from "@/lib";
import type { ProductSkillScope, ProductSkillsStatus } from "@/lib/types";

function ScopeCard({
  scope,
  workspaceRootPath,
  workspaceLabel,
}: {
  scope: ProductSkillScope;
  workspaceRootPath?: string | null;
  workspaceLabel?: string | null;
}) {
  const { t } = useTranslation("settings");
  const [status, setStatus] = useState<ProductSkillsStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const needsWorkspace = scope === "project";
  const canQuery = !needsWorkspace || Boolean(workspaceRootPath);

  const refresh = async () => {
    if (!canQuery) {
      setStatus(null);
      return;
    }
    setStatus(
      await desktopApi.getProductSkillsStatus(scope, workspaceRootPath),
    );
  };

  useMountEffect(() => {
    void refresh();
  });

  const statusText = (() => {
    if (!canQuery) {
      return t("skills.status.noWorkspace");
    }
    if (!status) {
      return t("skills.loading");
    }
    if (status.conflict) {
      return t("skills.status.conflict", {
        skills: status.conflictSkills.join(", "),
        path: status.agentsSkillsDir,
      });
    }
    if (status.installed && status.updateAvailable) {
      return t("skills.status.updateAvailable", {
        installed: status.installedVersion ?? status.packVersion,
        latest: status.packVersion,
        path: status.agentsSkillsDir,
      });
    }
    if (status.installed) {
      return t("skills.status.installed", {
        version: status.installedVersion ?? status.packVersion,
        path: status.agentsSkillsDir,
      });
    }
    return t("skills.status.notInstalled", {
      path: status.agentsSkillsDir,
    });
  })();

  const runInstall = async () => {
    if (!canQuery) {
      return;
    }
    setBusy(true);
    try {
      const result = await desktopApi.installProductSkills(
        scope,
        workspaceRootPath,
      );
      setStatus(result);
      if (result.action === "conflict") {
        toast.error(
          t("skills.toast.conflict", {
            skills: result.conflictSkills.join(", "),
          }),
        );
      } else if (result.action === "skipped") {
        toast.success(t("skills.toast.alreadyInstalled"));
      } else if (result.action === "updated") {
        toast.success(t("skills.toast.updated"));
      } else {
        toast.success(t("skills.toast.installed"));
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("skills.toast.installFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const runRemove = async () => {
    if (!canQuery) {
      return;
    }
    setBusy(true);
    try {
      await desktopApi.removeProductSkills(scope, workspaceRootPath);
      await refresh();
      toast.success(t("skills.toast.removed"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("skills.toast.removeFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const canInstall =
    canQuery && Boolean(status?.sourceAvailable) && !status?.conflict && !busy;
  const canRemove =
    canQuery && Boolean(status?.installed || status?.managed) && !busy;

  let installLabel: string = t("skills.actions.install");
  if (status?.installed && status.updateAvailable) {
    installLabel = t("skills.actions.update");
  } else if (status?.installed) {
    installLabel = t("skills.actions.reinstall");
  }

  return (
    <div className="flex flex-col gap-3 py-3.5">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <div className="text-body font-medium text-foreground">
            {t(`skills.scope.${scope}.title`)}
          </div>
          <div className="mt-0.5 text-body text-muted-foreground">
            {t(`skills.scope.${scope}.description`)}
          </div>
          {workspaceLabel ? (
            <Text className="mt-1 block" size="meta" tone="muted">
              {t("skills.workspaceLabel", { name: workspaceLabel })}
            </Text>
          ) : null}
          <Text className="mt-2 block" size="meta" tone="muted">
            {statusText}
          </Text>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {busy ? <Spinner size="md" /> : null}
          <Button
            disabled={!canInstall}
            size="sm"
            variant="outline"
            onClick={() => void runInstall()}
          >
            {installLabel}
          </Button>
          <Button
            disabled={!canRemove}
            size="sm"
            variant="ghost"
            onClick={() => void runRemove()}
          >
            {t("skills.actions.remove")}
          </Button>
          <Button
            disabled={busy || !canQuery}
            size="sm"
            variant="ghost"
            onClick={() => void refresh()}
          >
            {t("skills.actions.refresh")}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SkillsSettingsPanel() {
  const { t } = useTranslation("settings");
  const workspaces = useAtomValue(workspacesAtom);
  const activeWorkspaceId = useAtomValue(activeWorkspaceIdAtom);
  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null;

  return (
    <div className="settings-panel-enter flex flex-col gap-8">
      <div className="text-body text-muted-foreground">{t("skills.intro")}</div>

      <div className="flex flex-col">
        <div className="mb-2 px-1 text-meta font-medium text-muted-foreground/60">
          {t("skills.groupTitle")}
        </div>
        <div className="rounded-card border border-border/40 bg-card/45 px-4">
          <div className="flex flex-col divide-y divide-border/30">
            <ScopeCard
              key={activeWorkspace?.rootPath ?? "no-project"}
              scope="project"
              workspaceLabel={activeWorkspace?.name ?? null}
              workspaceRootPath={activeWorkspace?.rootPath ?? null}
            />
            <ScopeCard scope="global" />
          </div>
        </div>
      </div>

      <div className="text-meta text-muted-foreground">
        {t("skills.cliHint")}
      </div>
    </div>
  );
}
