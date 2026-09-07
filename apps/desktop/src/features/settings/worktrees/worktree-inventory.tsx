import type { ManagedWorktree, ManagedWorktreeGroup } from "@cocurdex/shared";
import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, EmptyState, Spinner, Text } from "@/components/ui";
import { SettingsGroup } from "../settings-fields";

export function WorktreeInventory({
  groups,
  isLoading,
  pendingPath,
  onDelete,
  onNewSession,
  onOpenSession,
  onRefresh,
}: {
  groups: ManagedWorktreeGroup[];
  isLoading: boolean;
  pendingPath: string | null;
  onDelete(worktree: ManagedWorktree): void;
  onNewSession(worktree: ManagedWorktree): void;
  onOpenSession(worktree: ManagedWorktree, sessionId: string): void;
  onRefresh(): void;
}) {
  const { t } = useTranslation("settings");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <Text as="p" size="meta" tone="muted">
          {t("worktrees.inventoryDescription")}
        </Text>
        <Button size="sm" type="button" variant="ghost" onClick={onRefresh}>
          {isLoading ? <Spinner /> : <RefreshCw className="size-4" />}
          {t("worktrees.refresh")}
        </Button>
      </div>
      {isLoading && groups.length === 0 ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Spinner />
          <Text size="body">{t("worktrees.loading")}</Text>
        </div>
      ) : null}
      {!isLoading && groups.length === 0 ? (
        <EmptyState title={t("worktrees.empty")} />
      ) : null}
      {groups.map((group) => (
        <SettingsGroup key={group.workspaceId} title={group.workspaceName}>
          {group.worktrees.map((worktree) => (
            <WorktreeRow
              key={worktree.path}
              pending={pendingPath === worktree.path}
              worktree={worktree}
              onDelete={() => onDelete(worktree)}
              onNewSession={() => onNewSession(worktree)}
              onOpenSession={(sessionId) => onOpenSession(worktree, sessionId)}
            />
          ))}
        </SettingsGroup>
      ))}
    </div>
  );
}

function WorktreeRow({
  onDelete,
  onNewSession,
  onOpenSession,
  pending,
  worktree,
}: {
  onDelete(): void;
  onNewSession(): void;
  onOpenSession(sessionId: string): void;
  pending: boolean;
  worktree: ManagedWorktree;
}) {
  const { t } = useTranslation("settings");
  const label = worktree.branch ?? t("worktrees.detached");

  return (
    <div className="flex flex-col gap-3 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Text as="p" weight="medium">
            {label}
          </Text>
          <Text as="p" className="mt-0.5" size="meta" tone="muted" truncate>
            {worktree.path}
          </Text>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            disabled={pending}
            size="sm"
            type="button"
            variant="outline"
            onClick={onNewSession}
          >
            {t("worktrees.newSession")}
          </Button>
          <Button
            disabled={pending}
            size="sm"
            type="button"
            variant="ghost"
            onClick={onDelete}
          >
            {pending ? <Spinner /> : null}
            {t("worktrees.delete")}
          </Button>
        </div>
      </div>
      {worktree.sessions.length === 0 ? (
        <Text size="meta" tone="muted">
          {t("worktrees.noSessions")}
        </Text>
      ) : (
        <ul className="flex flex-col gap-1">
          {worktree.sessions.map((session) => (
            <li key={session.id}>
              {session.archived ? (
                <Text size="meta" tone="muted">
                  {t("worktrees.archivedSession", { title: session.title })}
                </Text>
              ) : (
                <button
                  className="text-start text-meta text-foreground transition-colors hover:text-primary"
                  type="button"
                  onClick={() => onOpenSession(session.id)}
                >
                  {session.title}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
