import { useAtomValue, useSetAtom } from "jotai";
import { atomWithRefresh, loadable } from "jotai/utils";
import { Archive, ArchiveRestore } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button, EmptyState, Input, Spinner, Text } from "@/components/ui";
import { agentLabels, upsertSessionAtom } from "@/features/sessions";
import { workspacesAtom } from "@/features/workspaces";
import { desktopApi } from "@/lib";

export function ArchivedSessionsPanel() {
  const { t, i18n } = useTranslation("settings");
  const [query, setQuery] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [archiveAtoms] = useState(() => {
    const source = atomWithRefresh(() => desktopApi.listArchivedSessions());
    return { source, result: loadable(source) };
  });
  const result = useAtomValue(archiveAtoms.result);
  const refresh = useSetAtom(archiveAtoms.source);
  const upsertSession = useSetAtom(upsertSessionAtom);
  const workspaces = useAtomValue(workspacesAtom);

  async function restore(sessionId: string) {
    if (pendingId) {
      return;
    }
    setPendingId(sessionId);
    try {
      const restored = await desktopApi.restoreSession({ sessionId });
      for (const session of restored) {
        upsertSession(session);
      }
      refresh();
      if (restored.length > 0) {
        toast.success(t("archive.restored"));
      }
    } catch {
      toast.error(t("archive.restoreFailed"));
    } finally {
      setPendingId(null);
    }
  }

  if (result.state === "loading") {
    return (
      <div
        className="flex min-h-0 flex-1 items-center justify-center gap-2 py-10"
        role="status"
      >
        <Spinner className="size-4" />
        <Text tone="muted">{t("archive.loading")}</Text>
      </div>
    );
  }
  if (result.state === "hasError") {
    return (
      <EmptyState
        className="min-h-0 flex-1"
        title={t("archive.loadFailed")}
        action={
          <Button variant="outline" onClick={() => refresh()}>
            {t("archive.retry")}
          </Button>
        }
      />
    );
  }

  const sessions = result.data;
  const archivedIds = new Set(sessions.map((session) => session.id));
  const search = query.trim().toLocaleLowerCase();
  const visible = sessions.filter((session) => {
    if (session.parentSessionId && archivedIds.has(session.parentSessionId)) {
      return false;
    }
    const workspace = workspaces.find(
      (item) => item.id === session.workspaceId,
    );
    return [
      session.title,
      workspace?.name,
      agentLabels[session.agentType],
    ].some((value) => value?.toLocaleLowerCase().includes(search));
  });
  const dateFormat = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <Text as="p" className="shrink-0" tone="muted">
        {t("archive.description")}
      </Text>
      {sessions.length > 0 ? (
        <Input
          aria-label={t("archive.search")}
          className="shrink-0"
          placeholder={t("archive.search")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      ) : null}
      {visible.length === 0 ? (
        <EmptyState
          className="min-h-0 flex-1"
          icon={<Archive className="size-4" />}
          title={query.trim() ? t("archive.noResults") : t("archive.empty")}
        />
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col divide-y divide-border overflow-y-auto">
          {visible.map((session) => {
            const workspace = workspaces.find(
              (item) => item.id === session.workspaceId,
            );
            const isPending = pendingId === session.id;
            return (
              <li key={session.id} className="flex items-center gap-4 py-4">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <Text weight="medium" truncate title={session.title}>
                    {session.title}
                  </Text>
                  <Text size="meta" tone="muted" truncate>
                    {[workspace?.name, agentLabels[session.agentType]]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                  <Text size="meta" tone="muted">
                    {t("archive.archivedOn", {
                      date: dateFormat.format(
                        new Date(session.archivedAt ?? session.updatedAt),
                      ),
                    })}
                  </Text>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pendingId !== null}
                  onClick={() => void restore(session.id)}
                  aria-label={t("archive.restoreNamed", {
                    title: session.title,
                  })}
                >
                  {isPending ? (
                    <Spinner className="size-4" />
                  ) : (
                    <ArchiveRestore className="size-4" />
                  )}
                  {t("archive.restore")}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
