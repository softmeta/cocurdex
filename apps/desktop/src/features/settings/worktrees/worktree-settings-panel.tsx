import {
  groupManagedWorktrees,
  type ManagedWorktree,
  type ManagedWorktreeGroup,
  type WorktreeSettingsSnapshot,
} from "@cocurdex/shared";
import { useSetAtom } from "jotai";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button, Input, Switch } from "@/components/ui";
import { createDraftSessionAtom, selectSessionAtom } from "@/features/sessions";
import { selectWorkspaceAtom } from "@/features/workspaces";
import { desktopApi, useMountEffect } from "@/lib";
import { SettingRow, SettingsGroup } from "../settings-fields";
import { closeSettings } from "../settings-navigation";
import { WorktreeInventory } from "./worktree-inventory";

export function WorktreeSettingsPanel() {
  const { t } = useTranslation("settings");
  const selectWorkspace = useSetAtom(selectWorkspaceAtom);
  const createDraftSession = useSetAtom(createDraftSessionAtom);
  const selectSession = useSetAtom(selectSessionAtom);
  const [settings, setSettings] = useState<WorktreeSettingsSnapshot | null>(
    null,
  );
  const [rootDraft, setRootDraft] = useState("");
  const [groups, setGroups] = useState<ManagedWorktreeGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingPath, setPendingPath] = useState<string | null>(null);

  const loadInventory = async () => {
    const listed = await desktopApi.listManagedWorktrees();
    setGroups(groupManagedWorktrees(listed));
  };

  useMountEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const nextSettings = await desktopApi.getWorktreeSettings();
        const listed = await desktopApi.listManagedWorktrees();
        if (cancelled) {
          return;
        }
        setSettings(nextSettings);
        setRootDraft(nextSettings.rootPath ?? "");
        setGroups(groupManagedWorktrees(listed));
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

  const persistSettings = async (next: {
    fetchBeforeCreate: boolean;
    rootPath: string | null;
  }) => {
    try {
      const saved = await desktopApi.saveWorktreeSettings(next);
      setSettings(saved);
      setRootDraft(saved.rootPath ?? "");
    } catch (error) {
      toast.error(
        t("worktrees.saveFailed", {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  };

  const handleBrowseRoot = async () => {
    const result = await desktopApi.openWorkspace();
    if (result.canceled || !result.filePaths[0]) {
      return;
    }
    await persistSettings({
      fetchBeforeCreate: settings?.fetchBeforeCreate ?? false,
      rootPath: result.filePaths[0],
    });
  };

  const handleRootBlur = async () => {
    const nextRoot = rootDraft.trim() || null;
    if ((settings?.rootPath ?? null) === nextRoot) {
      return;
    }
    await persistSettings({
      fetchBeforeCreate: settings?.fetchBeforeCreate ?? false,
      rootPath: nextRoot,
    });
  };

  const handleNewSession = (worktree: ManagedWorktree) => {
    selectWorkspace(worktree.workspaceId);
    createDraftSession({
      workspaceId: worktree.workspaceId,
      worktreePath: worktree.path,
    });
    closeSettings();
  };

  const handleOpenSession = (worktree: ManagedWorktree, sessionId: string) => {
    selectWorkspace(worktree.workspaceId);
    selectSession(sessionId);
    closeSettings();
  };

  const handleDelete = async (worktree: ManagedWorktree) => {
    if (pendingPath) {
      return;
    }
    setPendingPath(worktree.path);
    try {
      await desktopApi.removeWorktree({
        workspaceId: worktree.workspaceId,
        worktreePath: worktree.path,
      });
      await loadInventory();
    } catch (error) {
      toast.error(
        t("worktrees.deleteFailed", {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setPendingPath(null);
    }
  };

  return (
    <div className="settings-panel-enter flex flex-col gap-8">
      <SettingsGroup title={t("worktrees.groupTitle")}>
        <SettingRow
          description={t("worktrees.rootDescription")}
          title={t("worktrees.rootTitle")}
        >
          <div className="flex items-center gap-2">
            <Input
              className="h-8 w-56"
              placeholder={settings?.resolvedRootPath}
              value={rootDraft}
              onBlur={() => void handleRootBlur()}
              onChange={(event) => setRootDraft(event.target.value)}
            />
            <Button
              size="sm"
              type="button"
              variant="outline"
              onClick={() => void handleBrowseRoot()}
            >
              {t("worktrees.browse")}
            </Button>
          </div>
        </SettingRow>
        <SettingRow
          description={t("worktrees.fetchDescription")}
          title={t("worktrees.fetchTitle")}
        >
          <Switch
            checked={settings?.fetchBeforeCreate ?? false}
            disabled={!settings}
            onCheckedChange={(checked) => {
              void persistSettings({
                fetchBeforeCreate: checked,
                rootPath: settings?.rootPath ?? null,
              });
            }}
          />
        </SettingRow>
      </SettingsGroup>
      <WorktreeInventory
        groups={groups}
        isLoading={isLoading}
        pendingPath={pendingPath}
        onDelete={(worktree) => void handleDelete(worktree)}
        onNewSession={handleNewSession}
        onOpenSession={handleOpenSession}
        onRefresh={() => void loadInventory()}
      />
    </div>
  );
}
