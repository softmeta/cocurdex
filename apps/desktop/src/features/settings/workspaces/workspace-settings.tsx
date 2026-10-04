import type { WorkspaceRecord } from "@cocurdex/shared";
import { useAtom, useAtomValue } from "jotai";
import { ChevronRight, Folder } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState, Input, Text } from "@/components/ui";
import {
  activeWorkspaceIdAtom,
  sortWorkspacesBySortOrder,
  workspacesAtom,
} from "@/features/workspaces";
import { selectedSettingsWorkspaceIdAtom } from "./workspace-settings-store";
import { WorktreeEnvironmentEditor } from "./worktree-environment-editor";

export function WorkspaceSettingsPanel() {
  const workspaces = useAtomValue(workspacesAtom);
  const [selectedId, setSelectedId] = useAtom(selectedSettingsWorkspaceIdAtom);
  const selected =
    workspaces.find((workspace) => workspace.id === selectedId) ?? null;

  if (selected) {
    return <WorkspaceWorktreeSettings workspace={selected} />;
  }

  return (
    <WorkspaceSettingsList workspaces={workspaces} onSelect={setSelectedId} />
  );
}

function WorkspaceSettingsList({
  onSelect,
  workspaces,
}: {
  onSelect(workspaceId: string): void;
  workspaces: WorkspaceRecord[];
}) {
  const { t } = useTranslation("settings");
  const activeWorkspaceId = useAtomValue(activeWorkspaceIdAtom);
  const [query, setQuery] = useState("");
  const search = query.trim().toLocaleLowerCase();
  const visible = sortWorkspacesBySortOrder(workspaces).filter((workspace) => {
    if (!search) {
      return true;
    }
    return [workspace.name, ...workspace.rootPaths].some((value) =>
      value.toLocaleLowerCase().includes(search),
    );
  });

  return (
    <div className="settings-panel-enter flex flex-col gap-4">
      <Text as="p" tone="muted">
        {t("workspaces.description")}
      </Text>
      {workspaces.length === 0 ? (
        <EmptyState
          icon={<Folder className="size-4" />}
          title={t("workspaces.emptyTitle")}
          description={t("workspaces.emptyDescription")}
        />
      ) : (
        <>
          <Input
            aria-label={t("workspaces.search")}
            placeholder={t("workspaces.search")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {visible.length === 0 ? (
            <EmptyState
              icon={<Folder className="size-4" />}
              title={t("workspaces.noResults")}
            />
          ) : (
            <ul className="overflow-hidden rounded-card border border-border/70 bg-settings-surface">
              {visible.map((workspace) => {
                const isCurrent = workspace.id === activeWorkspaceId;
                return (
                  <li
                    key={workspace.id}
                    className="border-border/60 border-b last:border-b-0"
                  >
                    <button
                      aria-current={isCurrent ? "true" : undefined}
                      className="flex w-full items-center gap-3 px-4 py-2 text-start transition-colors hover:bg-muted/50"
                      type="button"
                      onClick={() => onSelect(workspace.id)}
                    >
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <div className="flex min-w-0 items-center gap-2">
                          <Text truncate weight="medium">
                            {workspace.name}
                          </Text>
                          {isCurrent ? (
                            <Text className="shrink-0" size="meta" tone="muted">
                              {t("workspaces.current")}
                            </Text>
                          ) : null}
                        </div>
                        <Text size="meta" tone="muted" truncate>
                          {workspace.rootPaths.join(" · ")}
                        </Text>
                      </div>
                      <Text className="shrink-0" size="meta" tone="muted">
                        {t("workspaces.worktreeSettings")}
                      </Text>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function WorkspaceRootPathList({ workspace }: { workspace: WorkspaceRecord }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      {workspace.rootPaths.map((rootPath) => (
        <div className="flex min-w-0 items-center gap-1.5" key={rootPath}>
          <Folder className="size-3.5 shrink-0 text-muted-foreground" />
          <Text size="meta" title={rootPath} tone="muted" truncate>
            {rootPath}
          </Text>
        </div>
      ))}
    </div>
  );
}

function WorkspaceWorktreeSettings({
  workspace,
}: {
  workspace: WorkspaceRecord;
}) {
  const { t } = useTranslation("settings");

  return (
    <div className="settings-panel-enter flex flex-col gap-6">
      <WorkspaceRootPathList workspace={workspace} />
      <section className="flex flex-col gap-4">
        <div className="min-w-0">
          <Text as="h3" size="base" weight="semibold">
            {t("workspaces.environmentTitle")}
          </Text>
          <Text as="p" className="mt-0.5" size="meta" tone="muted">
            {t("workspaces.environmentDescription")}
          </Text>
        </div>
        <WorktreeEnvironmentEditor key={workspace.id} workspace={workspace} />
      </section>
    </div>
  );
}
