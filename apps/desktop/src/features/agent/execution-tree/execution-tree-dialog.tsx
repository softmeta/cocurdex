import { useSetAtom } from "jotai";
import { ListTree } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Label,
  Switch,
  Text,
} from "@/components/ui";
import { selectSessionAtom } from "@/features/sessions";
import { ExecutionTreeRowContent } from "./execution-tree-row-content";
import {
  DEFAULT_EXECUTION_TREE_VIEW,
  type ExecutionTreeSection,
  type ExecutionTreeView,
  type ExpandableExecutionTreeRow,
  flattenExecutionTree,
  groupExecutionTreeSections,
  toggleExpansion,
} from "./execution-tree-rows";
import { useExecutionTree } from "./use-execution-tree";

export interface ExecutionTreeDialogProps {
  sessionId: string;
  onClose(): void;
}

function IssuesOnlySwitch({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange(checked: boolean): void;
}) {
  const { t } = useTranslation("sessions");
  const switchId = useId();
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Label htmlFor={switchId}>
        <Text size="meta" tone="muted">
          {t("executionTree.issuesOnly")}
        </Text>
      </Label>
      <Switch
        checked={checked}
        id={switchId}
        onCheckedChange={onCheckedChange}
        size="sm"
      />
    </div>
  );
}

const SESSION_HEADER_HEIGHT_REM = 1.75;
const OUTERMOST_HEADER_Z_INDEX = 20;

function SectionItem({
  section,
  onOpenSession,
  onToggle,
}: {
  section: ExecutionTreeSection;
  onOpenSession(sessionId: string): void;
  onToggle(row: ExpandableExecutionTreeRow): void;
}) {
  const { row, level, children } = section;
  const content = (
    <ExecutionTreeRowContent
      onOpenSession={onOpenSession}
      onToggle={onToggle}
      row={row}
    />
  );
  const indent = { paddingInlineStart: `${row.depth * 16}px` };
  if (row.kind !== "session") {
    return (
      <li data-execution-row={row.key} style={indent}>
        {content}
      </li>
    );
  }
  return (
    <li>
      <div
        className="sticky bg-popover"
        data-execution-row={row.key}
        style={{
          ...indent,
          top: `${level * SESSION_HEADER_HEIGHT_REM}rem`,
          zIndex: OUTERMOST_HEADER_Z_INDEX - level,
        }}
      >
        {content}
      </div>
      {children.length > 0 ? (
        <ul className="flex flex-col">
          {children.map((child) => (
            <SectionItem
              key={child.row.key}
              onOpenSession={onOpenSession}
              onToggle={onToggle}
              section={child}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function ExecutionTreeBody({
  sessionId,
  view,
  onChangeView,
  onOpenSession,
}: {
  sessionId: string;
  view: ExecutionTreeView;
  onChangeView(view: ExecutionTreeView): void;
  onOpenSession(sessionId: string): void;
}) {
  const { t } = useTranslation("sessions");
  const state = useExecutionTree(sessionId);

  if (state.status === "loading") return null;
  if (state.status === "error" || !state.tree) {
    return (
      <EmptyState
        description={t("executionTree.unavailable")}
        icon={<ListTree />}
        title={t("executionTree.title")}
      />
    );
  }

  const rows = flattenExecutionTree(state.tree, view);
  const hasIssueRows = rows.some((row) => row.kind !== "session");
  const toggle = (row: ExpandableExecutionTreeRow) =>
    onChangeView({ ...view, expansion: toggleExpansion(view.expansion, row) });

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-2">
      {view.issuesOnly && !hasIssueRows ? (
        <Text className="px-1 py-2" size="meta" tone="muted">
          {t("executionTree.noIssues")}
        </Text>
      ) : null}
      <ul className="flex max-h-[60vh] flex-col overflow-y-auto overscroll-contain pb-2">
        {groupExecutionTreeSections(rows).map((section) => (
          <SectionItem
            key={section.row.key}
            onOpenSession={onOpenSession}
            onToggle={toggle}
            section={section}
          />
        ))}
      </ul>
    </div>
  );
}

export function ExecutionTreeDialog({
  sessionId,
  onClose,
}: ExecutionTreeDialogProps) {
  const { t } = useTranslation("sessions");
  const selectSession = useSetAtom(selectSessionAtom);
  const [view, setView] = useState<ExecutionTreeView>(
    DEFAULT_EXECUTION_TREE_VIEW,
  );

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent className="top-[12vh] translate-y-0" size="wide">
        <div className="flex min-w-0 items-end gap-4">
          <DialogHeader className="min-w-0 flex-1">
            <DialogTitle>{t("executionTree.title")}</DialogTitle>
            <DialogDescription>
              {t("executionTree.description")}
            </DialogDescription>
          </DialogHeader>
          <IssuesOnlySwitch
            checked={view.issuesOnly}
            onCheckedChange={(issuesOnly) => setView({ ...view, issuesOnly })}
          />
        </div>
        <ExecutionTreeBody
          onChangeView={setView}
          view={view}
          onOpenSession={(id) => {
            selectSession(id);
            onClose();
          }}
          sessionId={sessionId}
        />
      </DialogContent>
    </Dialog>
  );
}
