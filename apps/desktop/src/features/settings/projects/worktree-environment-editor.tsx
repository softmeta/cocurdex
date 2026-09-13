import {
  primaryWorkspaceRootPath,
  suggestWorktreeSetupScript,
  type WorkspaceRecord,
} from "@cocurdex/shared";

import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button, Spinner, Text, Textarea } from "@/components/ui";
import { cn, desktopApi, useMountEffect } from "@/lib";
import { SettingsGroup } from "../settings-fields";

const SETUP_PROBE_FILES = [
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "package-lock.json",
  "package.json",
  "Cargo.toml",
  "go.mod",
  "poetry.lock",
  "uv.lock",
  "requirements.txt",
];

function joinWorkspaceFile(rootPath: string, name: string) {
  const base = rootPath.replace(/[\\/]+$/, "");
  return `${base}/${name}`;
}

async function probeSetupScript(rootPath: string) {
  const present = (
    await Promise.all(
      SETUP_PROBE_FILES.map(async (name) =>
        (await desktopApi.fileExists(joinWorkspaceFile(rootPath, name)))
          ? name
          : null,
      ),
    )
  ).filter((name): name is string => name !== null);
  return suggestWorktreeSetupScript(present);
}

export function WorktreeEnvironmentEditor({
  workspace,
}: {
  workspace: WorkspaceRecord;
}) {
  const { t } = useTranslation("settings");
  const [setupScript, setSetupScript] = useState("");
  const [cleanupScript, setCleanupScript] = useState("");
  const [suggestedSetup, setSuggestedSetup] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useMountEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const environment = await desktopApi.getWorktreeEnvironment(
          workspace.id,
        );
        if (cancelled) {
          return;
        }
        setSetupScript(environment.setupScript);
        setCleanupScript(environment.cleanupScript);
        const primaryRootPath = primaryWorkspaceRootPath(workspace);
        if (primaryRootPath) {
          const suggestion = await probeSetupScript(primaryRootPath);
          if (!cancelled) {
            setSuggestedSetup(suggestion);
          }
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  });

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const saved = await desktopApi.saveWorktreeEnvironment({
        workspaceId: workspace.id,
        setupScript,
        cleanupScript,
      });
      setSetupScript(saved.setupScript);
      setCleanupScript(saved.cleanupScript);
      toast.success(t("worktrees.saved"));
    } catch (error) {
      toast.error(
        t("worktrees.saveFailed", {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Spinner />
        <Text size="body">{t("worktrees.loading")}</Text>
      </div>
    );
  }

  const showSetupSuggestion =
    suggestedSetup.length > 0 && setupScript.trim().length === 0;

  return (
    <SettingsGroup>
      <ScriptField
        action={
          showSetupSuggestion ? (
            <Button
              className="shrink-0"
              size="sm"
              type="button"
              variant="outline"
              onClick={() => setSetupScript(suggestedSetup)}
            >
              {t("worktrees.insertSuggestion")}
            </Button>
          ) : null
        }
        description={t("worktrees.setupDescription")}
        placeholder={suggestedSetup || t("worktrees.setupPlaceholder")}
        tall
        title={t("worktrees.setupTitle")}
        value={setupScript}
        onChange={setSetupScript}
      />
      <ScriptField
        description={t("worktrees.cleanupDescription")}
        placeholder={t("worktrees.cleanupPlaceholder")}
        title={t("worktrees.cleanupTitle")}
        value={cleanupScript}
        onChange={setCleanupScript}
      />
      <div className="flex justify-end py-3">
        <Button
          disabled={isSaving}
          size="sm"
          type="button"
          onClick={() => void handleSave()}
        >
          {isSaving ? <Spinner /> : null}
          {t("worktrees.save")}
        </Button>
      </div>
    </SettingsGroup>
  );
}

function ScriptField({
  action,
  description,
  onChange,
  placeholder,
  tall = false,
  title,
  value,
}: {
  action?: ReactNode;
  description: string;
  onChange(value: string): void;
  placeholder: string;
  tall?: boolean;
  title: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-2 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Text as="p" weight="medium">
            {title}
          </Text>
          <Text as="p" className="mt-0.5" size="meta" tone="muted">
            {description}
          </Text>
        </div>
        {action}
      </div>
      <Textarea
        className={cn(
          "resize-y rounded-control border-border/70 bg-background/60 font-mono text-body shadow-none focus-visible:border-ring/60 focus-visible:ring-2 focus-visible:ring-ring/20",
          tall ? "min-h-24" : "min-h-20",
        )}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
