import type {
  TurnChangeSet,
  TurnFileChange,
  UndoTurnChangesResult,
} from "@cocurdex/shared";
import { useAtom, useSetAtom } from "jotai";
import { ChevronDown, RotateCcw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { rightPanelResolvedActiveViewAtom } from "@/app/layout/right-editor-panel-store";
import { FileTypeIcon } from "@/components";
import { Button, Spinner, Text } from "@/components/ui";
import { editorPanelOpenAtom } from "@/features/editor/editor-store";
import { cn, desktopApi } from "@/lib";
import {
  compactFilePreview,
  fileOperationLabelKey,
  hasMeaningfulLineStats,
  isTurnChangeSetUndoable,
  splitWorkspaceRelativePath,
} from "./format-turn-changes";
import { undoResultsByChangeSetAtom } from "./turn-changes-store";

const PREVIEW_LIMIT = 3;
const SHOW_ALL_BELOW = 5;

function TurnChangesListToggle({
  expanded,
  hiddenCount,
  onToggle,
}: {
  expanded: boolean;
  hiddenCount: number;
  onToggle(): void;
}) {
  const { t } = useTranslation("agent");

  return (
    <button
      className="flex w-full items-center gap-1 px-3 py-1.5 text-start text-chat-fg-muted transition-colors hover:bg-chat-surface-row-hover hover:text-chat-fg"
      type="button"
      onClick={onToggle}
    >
      <Text size="meta">
        {expanded
          ? t("turnChanges.showFewerFiles")
          : t("turnChanges.showMoreFiles", { count: hiddenCount })}
      </Text>
      <ChevronDown className={cn("size-3.5", expanded && "rotate-180")} />
    </button>
  );
}

function LineDelta({
  additions,
  deletions,
}: {
  additions?: number | null;
  deletions?: number | null;
}) {
  const plus = additions ?? 0;
  const minus = deletions ?? 0;
  if (plus === 0 && minus === 0) {
    return null;
  }

  return (
    <span className="flex shrink-0 items-center gap-1 tabular-nums">
      {plus > 0 ? (
        <Text className="text-editor-git-added" size="meta">
          +{plus}
        </Text>
      ) : null}
      {minus > 0 ? (
        <Text className="text-editor-git-deleted" size="meta">
          −{minus}
        </Text>
      ) : null}
    </span>
  );
}

function TurnChangeFileRow({
  file,
  onReview,
}: {
  file: TurnFileChange;
  onReview(): void;
}) {
  const { t } = useTranslation("agent");
  const { dir, name } = splitWorkspaceRelativePath(file.path);

  return (
    <li className="min-w-0">
      <button
        aria-label={`${t(`turnChanges.${fileOperationLabelKey(file.operation)}`)} ${file.path}`}
        className="flex h-9 w-full min-w-0 items-center gap-2 px-3 text-start transition-colors hover:bg-chat-surface-row-hover"
        type="button"
        onClick={onReview}
      >
        <FileTypeIcon className="shrink-0" path={file.path} />
        <span className="flex min-w-0 flex-1 items-center overflow-hidden">
          {dir ? (
            <Text className="min-w-0 text-chat-fg-muted" size="meta" truncate>
              {dir}
            </Text>
          ) : null}
          <Text className="shrink-0 text-chat-fg" size="meta" weight="medium">
            {name}
          </Text>
        </span>
        {file.reviewKind !== "text" ? (
          <Text className="shrink-0 text-chat-fg-muted" size="meta">
            {t(`turnChanges.kind.${file.reviewKind}`)}
          </Text>
        ) : null}
        {file.restorable === false ? (
          <Text className="shrink-0 text-chat-fg-muted" size="meta">
            {t("turnChanges.notRestorable")}
          </Text>
        ) : null}
        <LineDelta additions={file.additions} deletions={file.deletions} />
      </button>
    </li>
  );
}

export function TurnChangesCard({
  changeSet,
  isStreaming = false,
}: {
  changeSet: TurnChangeSet;
  isStreaming?: boolean;
}) {
  const { t } = useTranslation("agent");
  const setPanelOpen = useSetAtom(editorPanelOpenAtom);
  const setActiveView = useSetAtom(rightPanelResolvedActiveViewAtom);
  const [showAllFiles, setShowAllFiles] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [undoResults, setUndoResults] = useAtom(undoResultsByChangeSetAtom);
  const undoResult = undoResults[changeSet.id] ?? null;
  const setUndoResult = (result: UndoTurnChangesResult) => {
    setUndoResults({ ...undoResults, [changeSet.id]: result });
  };

  // Only surface the card once the turn is done and actually touched files:
  // an in-progress "collecting" row adds noise while its actions are inert.
  if (
    changeSet.status === "error" ||
    changeSet.status === "collecting" ||
    changeSet.files.length === 0
  ) {
    return null;
  }

  const fileCount = changeSet.files.length;
  const showStats = hasMeaningfulLineStats(changeSet);
  const collapseList = !showAllFiles && fileCount >= SHOW_ALL_BELOW;
  const visibleFiles = collapseList
    ? compactFilePreview(changeSet.files, PREVIEW_LIMIT)
    : changeSet.files;
  const hiddenCount = fileCount - visibleFiles.length;
  const nonRestorableFiles = changeSet.files.filter(
    (file) => file.restorable === false,
  );
  const canUndo = isTurnChangeSetUndoable(changeSet) && !isStreaming;
  const review = () => {
    setPanelOpen(true);
    setActiveView("git");
  };

  const handleUndo = async () => {
    setUndoing(true);
    try {
      const result = await desktopApi.undoTurnChanges({
        sessionId: changeSet.sessionId,
        messageId: changeSet.messageId || changeSet.userMessageId,
      });
      setUndoResult(result);
    } catch (error) {
      setUndoResult({
        changeSetId: changeSet.id,
        status: "failed",
        files: [],
        recoveryCheckpointRef: null,
      });
      void error;
    } finally {
      setUndoing(false);
    }
  };

  const showUndoConflict = undoResult?.status === "conflict";
  const showUndoRestored = undoResult?.status === "restored";
  const showUndoFailed = undoResult?.status === "failed";
  const showUndoUnavailable =
    !canUndo && nonRestorableFiles.length > 0 && !isStreaming;
  const showStatus =
    showUndoConflict ||
    showUndoRestored ||
    showUndoFailed ||
    showUndoUnavailable;

  return (
    <div className="mt-2 w-full max-w-3xl overflow-hidden rounded-card border border-chat-border-soft">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
          <Text className="text-chat-fg" size="meta" weight="medium">
            {t("turnChanges.editedCount", { count: fileCount })}
          </Text>
          {showStats ? (
            <span className="flex items-center gap-1.5 tabular-nums">
              <Text className="text-editor-git-added" size="meta">
                +{changeSet.additions ?? 0}
              </Text>
              <Text className="text-editor-git-deleted" size="meta">
                −{changeSet.deletions ?? 0}
              </Text>
            </span>
          ) : null}
          {changeSet.status === "partial" ? (
            <Text className="text-chat-fg-muted" size="meta">
              {t("turnChanges.partial")}
            </Text>
          ) : null}
          {changeSet.status === "undone" ? (
            <Text className="text-chat-fg-muted" size="meta">
              {t("turnChanges.undone")}
            </Text>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            className="text-chat-fg-muted"
            disabled={!canUndo || undoing}
            onClick={() => void handleUndo()}
            size="xs"
            type="button"
            variant="ghost"
          >
            <Text size="meta">{t("turnChanges.undo")}</Text>
            {undoing ? (
              <Spinner size="xs" />
            ) : (
              <RotateCcw className="size-3.5" />
            )}
          </Button>
          <Button onClick={review} size="xs" type="button" variant="secondary">
            <Text size="meta">{t("turnChanges.review")}</Text>
          </Button>
        </div>
      </div>
      <ul className="flex min-w-0 flex-col divide-y divide-chat-border-soft border-t border-chat-border-soft">
        {visibleFiles.map((file) => (
          <TurnChangeFileRow file={file} key={file.path} onReview={review} />
        ))}
      </ul>
      {fileCount >= SHOW_ALL_BELOW ? (
        <div className="border-t border-chat-border-soft">
          <TurnChangesListToggle
            expanded={showAllFiles}
            hiddenCount={hiddenCount}
            onToggle={() => setShowAllFiles((current) => !current)}
          />
        </div>
      ) : null}
      {showStatus ? (
        <div className="border-t border-chat-border-soft">
          {showUndoConflict ? (
            <Text className="block px-3 py-1.5 text-chat-fg-muted" size="meta">
              {t("turnChanges.conflict")}
            </Text>
          ) : null}
          {showUndoRestored ? (
            <Text className="block px-3 py-1.5 text-chat-fg-muted" size="meta">
              {t("turnChanges.restored")}
            </Text>
          ) : null}
          {showUndoFailed ? (
            <Text className="block px-3 py-1.5 text-chat-fg-muted" size="meta">
              {t("turnChanges.undoFailed")}
            </Text>
          ) : null}
          {showUndoUnavailable ? (
            <Text className="block px-3 py-1.5 text-chat-fg-muted" size="meta">
              {t("turnChanges.undoUnavailable")}
            </Text>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
