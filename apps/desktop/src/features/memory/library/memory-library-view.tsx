import type { MemoryUpdateInput } from "@cocurdex/shared";
import { Brain } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { SidebarPanelHeader } from "@/app/layout/sidebar-panel-header";
import { SidebarToggleButton } from "@/app/layout/titlebar-icon-button";
import {
  AppSelect,
  ResizableSidebar,
  WORKBENCH_SIDEBAR_WIDTH_PX,
} from "@/components";
import {
  EmptyState,
  Input,
  ScrollArea,
  Text,
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui";
import { usePersonalAgents } from "@/features/personal";
import { desktopApi } from "@/lib";
import { revalidateMemory, useMemoryStatus } from "../memory-queries";
import { MemoryEntryDetail } from "./memory-entry-detail";
import { filterMemories } from "./memory-library-groups";
import {
  MemoryLibraryList,
  type MemoryLibraryMode,
} from "./memory-library-list";
import {
  type MemoryScope,
  useMemoryCapabilities,
  useMemoryEntry,
  useMemoryHistory,
  useMemoryLibrary,
  useMemoryRevision,
} from "./memory-library-queries";

const MIN_DETAIL_WIDTH_PX = 280;

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isLibraryMode(value: string): value is MemoryLibraryMode {
  return value === "diary" || value === "tree" || value === "history";
}

export function MemoryLibraryView() {
  const { t } = useTranslation(["memory", "personal"]);
  const { data: status } = useMemoryStatus();
  const { data: revision = null } = useMemoryRevision();
  const { data: capabilities } = useMemoryCapabilities();
  const { agents } = usePersonalAgents(t("personal:defaultName"));
  const [scope, setScope] = useState<MemoryScope>("all");
  const [mode, setMode] = useState<MemoryLibraryMode>("diary");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const canHistory = capabilities?.history ?? false;
  const canRestore = capabilities?.restore ?? false;
  const library = useMemoryLibrary(scope, revision);
  const history = useMemoryHistory(
    null,
    mode === "history" && canHistory,
    revision,
  );
  const entry = useMemoryEntry(selectedId, revision);
  const entryHistory = useMemoryHistory(
    selectedId,
    selectedId !== null && canHistory,
    revision,
  );
  const entries = filterMemories(library.data?.items ?? [], query);
  const ready = Boolean(status?.settings.enabled && status.available);
  const libraryError = ready ? library.data?.error : null;

  const scopeOptions = [
    { value: "all", label: t("library.scope.all") },
    { value: "me", label: t("library.scope.me") },
    ...agents.map((agent) => ({
      value: `agent:${agent.id}`,
      label: agent.role.name,
    })),
  ];

  const restore = async (id: string) => {
    try {
      await desktopApi.restoreMemory(id);
      setSelectedId(id);
      await revalidateMemory();
    } catch (error) {
      toast.error(t("library.restoreFailed"), {
        description: errorText(error),
      });
    }
  };

  const forget = async (id: string) => {
    try {
      await desktopApi.forgetMemory(id);
      setSelectedId(null);
      toast(t("library.forgotten"), {
        action: canRestore
          ? { label: t("library.undo"), onClick: () => void restore(id) }
          : undefined,
      });
      await revalidateMemory();
    } catch (error) {
      toast.error(t("library.forgetFailed"), { description: errorText(error) });
    }
  };

  const save = async (input: MemoryUpdateInput) => {
    await desktopApi.updateMemory(input);
    await revalidateMemory();
  };

  const selected = entry.data ?? null;
  let detail: ReactNode = null;
  if (selected) {
    detail = (
      <MemoryEntryDetail
        canEdit={capabilities?.update ?? false}
        canForget={capabilities?.forget ?? false}
        entry={selected}
        history={entryHistory.data ?? null}
        key={`${selected.id}:${selected.updatedAt ?? ""}`}
        onForget={() => void forget(selected.id)}
        onSave={save}
      />
    );
  } else if (!selectedId) {
    detail = (
      <div className="flex flex-1 items-center justify-center p-6">
        <EmptyState
          icon={<Brain />}
          title={t("library.pick")}
          description={t("library.pickDescription")}
        />
      </div>
    );
  }

  const expandSidebar = (
    <SidebarToggleButton
      label={t("library.expand")}
      open={false}
      onToggle={() => setSidebarCollapsed(false)}
    />
  );

  if (status && !ready) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <EmptyState
          icon={<Brain />}
          title={t("library.off")}
          description={t("library.offDescription")}
        />
      </div>
    );
  }

  return (
    <section
      aria-label={t("library.label")}
      className="flex min-h-0 flex-1"
      style={{ minWidth: WORKBENCH_SIDEBAR_WIDTH_PX + MIN_DETAIL_WIDTH_PX }}
    >
      {sidebarCollapsed ? null : (
        <ResizableSidebar
          ariaLabel={t("library.resize")}
          defaultWidth={WORKBENCH_SIDEBAR_WIDTH_PX}
        >
          <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-2 px-2 pb-2">
            <SidebarPanelHeader
              collapseLabel={t("library.collapse")}
              title={t("library.label")}
              onCollapse={() => setSidebarCollapsed(true)}
            />
            {capabilities?.partitions ? (
              <AppSelect
                options={scopeOptions}
                triggerAriaLabel={t("library.scope.label")}
                value={scope}
                onValueChange={(value) => {
                  setScope(value as MemoryScope);
                  setSelectedId(null);
                }}
              />
            ) : null}
            <Input
              aria-label={t("library.search")}
              placeholder={t("library.search")}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <ToggleGroup
              spacing={0.5}
              type="single"
              value={mode}
              variant="segmented"
              onValueChange={(value) => {
                if (isLibraryMode(value)) setMode(value);
              }}
            >
              <ToggleGroupItem value="diary">
                {t("library.mode.diary")}
              </ToggleGroupItem>
              <ToggleGroupItem value="tree">
                {t("library.mode.tree")}
              </ToggleGroupItem>
              {canHistory ? (
                <ToggleGroupItem value="history">
                  {t("library.mode.history")}
                </ToggleGroupItem>
              ) : null}
            </ToggleGroup>
            <ScrollArea className="min-h-0 flex-1">
              {library.data ? (
                <MemoryLibraryList
                  canRestore={canRestore}
                  entries={entries}
                  history={history.data ?? []}
                  mode={mode}
                  selectedId={selectedId}
                  onRestore={(id) => void restore(id)}
                  onSelect={setSelectedId}
                />
              ) : null}
            </ScrollArea>
            {libraryError ? (
              <Text className="px-2" size="meta" tone="destructive">
                {libraryError}
              </Text>
            ) : null}
          </div>
        </ResizableSidebar>
      )}
      <div
        className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-editor-canvas"
        style={{ minWidth: MIN_DETAIL_WIDTH_PX }}
      >
        {sidebarCollapsed ? (
          <div className="flex h-8 shrink-0 items-center px-2">
            {expandSidebar}
          </div>
        ) : null}
        {detail}
      </div>
    </section>
  );
}
