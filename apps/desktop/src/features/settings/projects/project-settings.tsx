import type { WorkspaceRecord } from "@cocurdex/shared";
import { useAtomValue } from "jotai";
import { ChevronLeft, ChevronRight, Folder } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, EmptyState, Input, Text } from "@/components/ui";
import {
  activeWorkspaceIdAtom,
  sortWorkspacesBySortOrder,
  workspacesAtom,
} from "@/features/workspaces";
import { WorktreeEnvironmentEditor } from "./worktree-environment-editor";

export function ProjectSettingsPanel() {
  const workspaces = useAtomValue(workspacesAtom);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    workspaces.find((workspace) => workspace.id === selectedId) ?? null;

  if (selected) {
    return (
      <ProjectWorktreeSettings
        workspace={selected}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  return (
    <ProjectSettingsList workspaces={workspaces} onSelect={setSelectedId} />
  );
}

function ProjectSettingsList({
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
        {t("projects.description")}
      </Text>
      {workspaces.length === 0 ? (
        <EmptyState
          icon={<Folder className="size-4" />}
          title={t("projects.emptyTitle")}
          description={t("projects.emptyDescription")}
        />
      ) : (
        <>
          <Input
            aria-label={t("projects.search")}
            placeholder={t("projects.search")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {visible.length === 0 ? (
            <EmptyState
              icon={<Folder className="size-4" />}
              title={t("projects.noResults")}
            />
          ) : (
            <ul className="overflow-hidden rounded-card border border-border/70 bg-card/45">
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
                              {t("projects.current")}
                            </Text>
                          ) : null}
                        </div>
                        <Text size="meta" tone="muted" truncate>
                          {workspace.rootPaths.join(" · ")}
                        </Text>
                      </div>
                      <Text className="shrink-0" size="meta" tone="muted">
                        {t("projects.worktreeSettings")}
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

function ProjectBackButton({
  label,
  onBack,
}: {
  label: string;
  onBack(): void;
}) {
  return (
    <Button
      className="-ms-2 self-start text-muted-foreground"
      size="sm"
      type="button"
      variant="ghost"
      onClick={onBack}
    >
      <ChevronLeft className="size-3.5 rtl:rotate-180" />
      {label}
    </Button>
  );
}

function ProjectIdentity({ workspace }: { workspace: WorkspaceRecord }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-control border border-border/70 bg-card/45 text-muted-foreground">
        <Folder className="size-4" />
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <Text as="p" truncate weight="medium">
          {workspace.name}
        </Text>
        {workspace.rootPaths.map((rootPath) => (
          <Text
            as="p"
            key={rootPath}
            size="meta"
            title={rootPath}
            tone="muted"
            truncate
          >
            {rootPath}
          </Text>
        ))}
      </div>
    </div>
  );
}

function ProjectWorktreeSettings({
  onBack,
  workspace,
}: {
  onBack(): void;
  workspace: WorkspaceRecord;
}) {
  const { t } = useTranslation("settings");

  return (
    <div className="settings-panel-enter flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <ProjectBackButton label={t("projects.back")} onBack={onBack} />
        <ProjectIdentity workspace={workspace} />
      </div>
      <section className="flex flex-col gap-5 border-border/60 border-t pt-5">
        <div className="sticky top-[var(--settings-sticky-offset)] z-[5] min-w-0 bg-background pb-2">
          <Text as="h3" size="base" weight="semibold">
            {t("projects.environmentTitle")}
          </Text>
          <Text as="p" className="mt-0.5" size="meta" tone="muted">
            {t("projects.environmentDescription")}
          </Text>
        </div>
        <WorktreeEnvironmentEditor key={workspace.id} workspace={workspace} />
      </section>
    </div>
  );
}
