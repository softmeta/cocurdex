import {
  detectRiskyScriptPatterns,
  primaryWorkspaceRootPath,
  suggestWorktreeSetupScript,
  type WorkspaceRecord,
  type WorkspaceWorktreeEnvironment,
} from "@cocurdex/shared";

import { useSetAtom } from "jotai";
import { Sparkles, TriangleAlert } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CodeTextarea } from "@/components/code-textarea";
import { Button, Spinner, Text } from "@/components/ui";
import { cn, desktopApi, useMountEffect } from "@/lib";
import {
  openAssistantSessionAtom,
  sendAssistantMessageAtom,
} from "../assistant";

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
  const openAssistantSession = useSetAtom(openAssistantSessionAtom);
  const sendAssistantMessage = useSetAtom(sendAssistantMessageAtom);
  const [setupScript, setSetupScript] = useState("");
  const [cleanupScript, setCleanupScript] = useState("");
  const [suggestedSetup, setSuggestedSetup] = useState("");
  const filledProposalAt = useRef<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAskingAgent, setIsAskingAgent] = useState(false);

  const hydrate = (
    environment: WorkspaceWorktreeEnvironment,
    resetFields: boolean,
  ) => {
    const proposal = environment.proposal;
    if (proposal) {
      if (proposal.proposedAt !== filledProposalAt.current) {
        filledProposalAt.current = proposal.proposedAt;
        setSetupScript(proposal.setupScript);
        setCleanupScript(proposal.cleanupScript);
      }
      return;
    }
    filledProposalAt.current = null;
    if (resetFields) {
      setSetupScript(environment.setupScript);
      setCleanupScript(environment.cleanupScript);
    }
  };

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
        hydrate(environment, true);
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
    const unsubscribe = desktopApi.onDataChanged((event) => {
      if (!event.areas.includes("workspace") || cancelled) {
        return;
      }
      void desktopApi
        .getWorktreeEnvironment(workspace.id)
        .then((environment) => {
          if (!cancelled) {
            hydrate(environment, false);
          }
        })
        .catch(() => {});
    });
    return () => {
      cancelled = true;
      unsubscribe();
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
      filledProposalAt.current = null;
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

  const handleAskAgent = async () => {
    setIsAskingAgent(true);
    try {
      const session = await openAssistantSession(workspace.id);
      void sendAssistantMessage({
        session,
        workspace,
        content: t("assistant.worktreeKickoff"),
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setIsAskingAgent(false);
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

  return (
    <div className="flex flex-col">
      <ScriptField
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
      <div className="flex items-center justify-between py-3">
        <Button
          disabled={isAskingAgent}
          size="sm"
          type="button"
          variant="outline"
          onClick={() => void handleAskAgent()}
        >
          {isAskingAgent ? <Spinner /> : <Sparkles className="size-3.5" />}
          {t("worktrees.askAgent")}
        </Button>
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
    </div>
  );
}

function ScriptField({
  description,
  onChange,
  placeholder,
  tall = false,
  title,
  value,
}: {
  description: string;
  onChange(value: string): void;
  placeholder: string;
  tall?: boolean;
  title: string;
  value: string;
}) {
  const { t } = useTranslation("settings");
  const risks = detectRiskyScriptPatterns(value);
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
      </div>
      <CodeTextarea
        className={cn("max-h-64", tall ? "min-h-24" : "min-h-20")}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
      />
      {risks.length > 0 ? (
        <div className="flex items-start gap-1.5">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-destructive" />
          <Text as="p" size="meta" tone="destructive">
            {t("worktrees.riskyPatterns", { patterns: risks.join(", ") })}
          </Text>
        </div>
      ) : null}
    </div>
  );
}
