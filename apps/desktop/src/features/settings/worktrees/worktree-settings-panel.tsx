import {
  groupManagedWorktrees,
  type ManagedWorktree,
  type ManagedWorktreeGroup,
  type WorktreeSettingsSnapshot,
} from "@cocurdex/shared";
import { useSetAtom } from "jotai";
import { FolderOpen } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { SettingRow, SettingsGroup } from "@/components";
import { Button, Input, Switch } from "@/components/ui";
import { createDraftSessionAtom, selectSessionAtom } from "@/features/sessions";
import {
  pickHostDirectoryAtom,
  selectWorkspaceAtom,
} from "@/features/workspaces";
import { desktopApi, useMountEffect } from "@/lib";
import { closeSettings } from "../settings-navigation";
import { WorktreeInventory } from "./worktree-inventory";

let lastSettings: WorktreeSettingsSnapshot | null = null;
let lastGroups: ManagedWorktreeGroup[] | null = null;

export function WorktreeSettingsPanel() {
  const { t } = useTranslation("settings");
  const selectWorkspace = useSetAtom(selectWorkspaceAtom);
  const pickHostDirectory = useSetAtom(pickHostDirectoryAtom);
  const createDraftSession = useSetAtom(createDraftSessionAtom);
  const selectSession = useSetAtom(selectSessionAtom);
  const [settings, setSettings] = useState(lastSettings);
  const [rootDraft, setRootDraft] = useState(lastSettings?.rootPath ?? "");
  const [groups, setGroups] = useState(lastGroups);
  const [pendingPath, setPendingPath] = useState<string | null>(null);

  const applySettings = (next: WorktreeSettingsSnapshot) => {
    lastSettings = next;
    setSettings(next);
    setRootDraft(next.rootPath ?? "");
  };

  const applyGroups = (listed: ManagedWorktree[]) => {
    const next = groupManagedWorktrees(listed);
    lastGroups = next;
    setGroups(next);
  };

  const loadInventory = async () => {
    applyGroups(await desktopApi.listManagedWorktrees());
  };

  const handleRefresh = async () => {
    try {
      await loadInventory();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  useMountEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [nextSettings, listed] = await Promise.all([
          desktopApi.getWorktreeSettings(),
          desktopApi.listManagedWorktrees(),
        ]);
        if (cancelled) {
          return;
        }
        applySettings(nextSettings);
        applyGroups(listed);
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : String(error));
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
      applySettings(await desktopApi.saveWorktreeSettings(next));
    } catch (error) {
      toast.error(
        t("worktrees.saveFailed", {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  };

  const handleBrowseRoot = async () => {
    const rootPath = await pickHostDirectory();
    if (!rootPath) {
      return;
    }
    await persistSettings({
      fetchBeforeCreate: settings?.fetchBeforeCreate ?? false,
      rootPath,
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
        workspaceRootPath: worktree.workspaceRootPath,
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
          <div className="flex items-center gap-1.5">
            <Input
              className="h-8 w-72 text-body"
              placeholder={settings?.resolvedRootPath}
              title={rootDraft || settings?.resolvedRootPath}
              value={rootDraft}
              onBlur={() => void handleRootBlur()}
              onChange={(event) => setRootDraft(event.target.value)}
            />
            <Button
              aria-label={t("worktrees.browse")}
              size="icon"
              title={t("worktrees.browse")}
              type="button"
              variant="outline"
              onClick={() => void handleBrowseRoot()}
            >
              <FolderOpen />
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
        pendingPath={pendingPath}
        onDelete={(worktree) => void handleDelete(worktree)}
        onNewSession={handleNewSession}
        onOpenSession={handleOpenSession}
        onRefresh={() => void handleRefresh()}
      />
    </div>
  );
}
