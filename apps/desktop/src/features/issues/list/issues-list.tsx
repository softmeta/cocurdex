import type { IssueRecord, ViewFull } from "@cocurdex/shared";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  TITLEBAR_ICON_GLYPH_CLASS,
  TitlebarIconButton,
} from "@/app/layout/titlebar-icon-button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ScrollArea,
  Text,
} from "@/components/ui";
import { cn } from "@/lib";
import { groupFieldColor } from "../group-field-color";
import { IssueListRow } from "./issue-list-row";

interface IssuesListProps {
  board: ViewFull;
  onAddCard: (columnId: string) => void;
  onDeleteCard: (cardId: string) => void;
  onEditCard: (card: IssueRecord) => void;
  onUpdateCardFields: (
    id: string,
    fields: { status?: string; priority?: string },
  ) => void;
}

export function IssuesList({
  board,
  onAddCard,
  onDeleteCard,
  onEditCard,
  onUpdateCardFields,
}: IssuesListProps) {
  const { t } = useTranslation("issues");
  // Collapsed groups only; open by default like Linear.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const sortedColumns = useMemo(
    () => [...board.columns].sort((a, b) => a.sortOrder - b.sortOrder),
    [board.columns],
  );

  const issuesByColumn = useMemo(() => {
    const map = new Map<string, IssueRecord[]>();
    for (const col of sortedColumns) {
      map.set(col.id, []);
    }
    for (const card of board.issues) {
      const list = map.get(card.columnId);
      if (list) list.push(card);
    }
    for (const [, list] of map) {
      list.sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return map;
  }, [board.issues, sortedColumns]);

  return (
    <ScrollArea className="min-h-0 flex-1">
      {/* Match board canvas inset and sidebar row rhythm. */}
      <div className="flex flex-col gap-3 px-4 py-3">
        {sortedColumns.map((column) => {
          const issues = issuesByColumn.get(column.id) ?? [];
          const open = !collapsed[column.id];
          const markColor = groupFieldColor(column);

          return (
            <Collapsible
              key={column.id}
              open={open}
              onOpenChange={(next) => {
                setCollapsed((prev) => ({
                  ...prev,
                  [column.id]: !next,
                }));
              }}
            >
              <div
                className={cn(
                  "group flex h-8 items-center gap-1 rounded-control pe-1",
                  "hover:bg-editor-tab-hover-bg",
                )}
              >
                <CollapsibleTrigger
                  type="button"
                  className="flex h-8 min-w-0 flex-1 items-center gap-1.5 px-2 text-start"
                  aria-label={
                    open
                      ? t("list.collapseGroup", { title: column.title })
                      : t("list.expandGroup", { title: column.title })
                  }
                >
                  {open ? (
                    <ChevronDown className="size-3.5 shrink-0 text-editor-fg-subtle" />
                  ) : (
                    <ChevronRight className="size-3.5 shrink-0 text-editor-fg-subtle" />
                  )}
                  {/* Quiet status mark: small filled dot, not a loud outline circle. */}
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      !markColor && "bg-editor-fg-subtle/50",
                    )}
                    style={
                      markColor ? { backgroundColor: markColor } : undefined
                    }
                    aria-hidden
                  />
                  <Text
                    size="body"
                    weight="medium"
                    className="min-w-0 truncate text-editor-fg"
                  >
                    {column.title}
                  </Text>
                  <Text
                    size="meta"
                    weight="medium"
                    className="shrink-0 tabular-nums text-editor-fg-subtle"
                  >
                    {issues.length}
                  </Text>
                </CollapsibleTrigger>
                <TitlebarIconButton
                  aria-label={t("board.addCard")}
                  className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={() => {
                    onAddCard(column.id);
                  }}
                >
                  <Plus className={TITLEBAR_ICON_GLYPH_CLASS} />
                </TitlebarIconButton>
              </div>

              {/* Skip empty content: open panels still had padding and caused a
                  height jump when collapsing groups with 0 issues. */}
              {issues.length > 0 ? (
                <CollapsibleContent>
                  <div className="mt-0.5 flex flex-col gap-0.5 ps-2">
                    {issues.map((card) => (
                      <IssueListRow
                        key={card.id}
                        card={card}
                        groupBy={board.view.groupBy}
                        statusOptions={board.statusOptions}
                        priorityOptions={board.priorityOptions}
                        onDelete={onDeleteCard}
                        onEdit={onEditCard}
                        onUpdateFields={onUpdateCardFields}
                      />
                    ))}
                  </div>
                </CollapsibleContent>
              ) : null}
            </Collapsible>
          );
        })}
      </div>
    </ScrollArea>
  );
}
