import { ChevronRight, FoldVertical, UnfoldVertical } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  collectExpandableOutlineKeys,
  outlineNodePathKey,
  type PdfOutlineNode,
} from "./pdf-outline";

interface PdfOutlinePanelProps {
  outline: PdfOutlineNode[];
  // 1-based page currently in view; used to highlight the matching entry.
  currentPage?: number;
  onSelectPage(pageNumber: number): void;
}

export function PdfOutlinePanel({
  outline,
  currentPage,
  onSelectPage,
}: PdfOutlinePanelProps) {
  const { t } = useTranslation("editor");

  const expandableKeys = useMemo(
    () => collectExpandableOutlineKeys(outline),
    [outline],
  );
  const allExpandableKeySet = useMemo(
    () => new Set(expandableKeys),
    [expandableKeys],
  );
  // null = default (all expanded). User actions pin an explicit set.
  const [openKeys, setOpenKeys] = useState<ReadonlySet<string> | null>(null);
  const resolvedOpenKeys = openKeys ?? allExpandableKeySet;

  const hasNested = expandableKeys.length > 0;
  const allCollapsed =
    hasNested && expandableKeys.every((key) => !resolvedOpenKeys.has(key));

  const handleToggleAll = useCallback(() => {
    setOpenKeys(allCollapsed ? new Set(expandableKeys) : new Set());
  }, [allCollapsed, expandableKeys]);

  const handleOpenChange = useCallback(
    (key: string, open: boolean) => {
      setOpenKeys((prev) => {
        const next = new Set(prev ?? expandableKeys);
        if (open) {
          next.add(key);
        } else {
          next.delete(key);
        }
        return next;
      });
    },
    [expandableKeys],
  );

  return (
    <div className="flex size-full flex-col">
      {hasNested ? (
        <div className="flex shrink-0 items-center justify-end border-b border-editor-border px-1 py-0.5">
          <Tooltip>
            <TooltipTrigger
              render={
                <TitlebarIconButton
                  aria-label={
                    allCollapsed ? t("pdf.expandAll") : t("pdf.collapseAll")
                  }
                  onClick={handleToggleAll}
                >
                  {allCollapsed ? (
                    <UnfoldVertical className={TITLEBAR_ICON_GLYPH_CLASS} />
                  ) : (
                    <FoldVertical className={TITLEBAR_ICON_GLYPH_CLASS} />
                  )}
                </TitlebarIconButton>
              }
            />
            <TooltipContent side="bottom" sideOffset={6}>
              {allCollapsed ? t("pdf.expandAll") : t("pdf.collapseAll")}
            </TooltipContent>
          </Tooltip>
        </div>
      ) : null}

      <ScrollArea className="min-h-0 flex-1">
        <nav aria-label={t("pdf.outline")} className="py-1 pe-1.5">
          <ul className="flex flex-col">
            {outline.map((node, index) => {
              const nodeKey = outlineNodePathKey(null, index);
              return (
                <OutlineItem
                  key={nodeKey}
                  node={node}
                  nodeKey={nodeKey}
                  depth={0}
                  currentPage={currentPage}
                  openKeys={resolvedOpenKeys}
                  onOpenChange={handleOpenChange}
                  onSelectPage={onSelectPage}
                />
              );
            })}
          </ul>
        </nav>
      </ScrollArea>
    </div>
  );
}

interface OutlineItemProps {
  node: PdfOutlineNode;
  nodeKey: string;
  depth: number;
  currentPage?: number;
  openKeys: ReadonlySet<string>;
  onOpenChange(key: string, open: boolean): void;
  onSelectPage(pageNumber: number): void;
}

// Per-level indent + base inset. Applied once on the row so parent/leaf text
// share the same start edge; the chevron column is always reserved below.
const OUTLINE_INDENT_PER_DEPTH_PX = 12;
const OUTLINE_BASE_INSET_PX = 4;
const OUTLINE_CHEVRON_CLASS =
  "flex size-4 shrink-0 items-center justify-center";

function OutlineItem({
  node,
  nodeKey,
  depth,
  currentPage,
  openKeys,
  onOpenChange,
  onSelectPage,
}: OutlineItemProps) {
  const hasChildren = node.children.length > 0;
  const isActive = node.pageNumber != null && node.pageNumber === currentPage;
  const isOpen = openKeys.has(nodeKey);

  // Indent the whole row (chevron + label) once. Leaf nodes keep an empty
  // chevron-sized spacer so their title lines up with expandable siblings.
  const rowStyle = {
    paddingInlineStart: `${depth * OUTLINE_INDENT_PER_DEPTH_PX + OUTLINE_BASE_INSET_PX}px`,
  };

  const label = (
    <Label node={node} isActive={isActive} onSelectPage={onSelectPage} />
  );

  const row = (
    <div className="flex min-w-0 items-center" style={rowStyle}>
      {hasChildren ? (
        <CollapsibleTrigger
          className={cn(
            OUTLINE_CHEVRON_CLASS,
            "group rounded-control text-muted-foreground hover:text-foreground",
          )}
        >
          <ChevronRight className="size-3.5 transition-transform group-data-[panel-open]:rotate-90 rtl:-scale-x-100" />
        </CollapsibleTrigger>
      ) : (
        <span className={OUTLINE_CHEVRON_CLASS} aria-hidden />
      )}
      <div className="min-w-0 flex-1">{label}</div>
    </div>
  );

  if (!hasChildren) {
    return <li>{row}</li>;
  }

  return (
    <li>
      <Collapsible
        open={isOpen}
        onOpenChange={(open) => onOpenChange(nodeKey, open)}
      >
        {row}
        <CollapsibleContent>
          <ul className="flex flex-col">
            {node.children.map((child, index) => {
              const childKey = outlineNodePathKey(nodeKey, index);
              return (
                <OutlineItem
                  key={childKey}
                  node={child}
                  nodeKey={childKey}
                  depth={depth + 1}
                  currentPage={currentPage}
                  openKeys={openKeys}
                  onOpenChange={onOpenChange}
                  onSelectPage={onSelectPage}
                />
              );
            })}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

interface LabelProps {
  node: PdfOutlineNode;
  isActive: boolean;
  onSelectPage(pageNumber: number): void;
}

// Linked entries render as a button that jumps to the page; unresolved entries
// render as plain, non-interactive text.
function Label({ node, isActive, onSelectPage }: LabelProps) {
  const className = cn(
    "block w-full truncate rounded-control py-1 ps-0.5 pe-2 text-start",
    isActive && "bg-accent text-accent-foreground",
  );

  if (node.pageNumber == null) {
    return (
      <Text
        size="meta"
        tone="muted"
        truncate
        className={cn(className, "cursor-default")}
      >
        {node.title}
      </Text>
    );
  }

  const pageNumber = node.pageNumber;

  return (
    <button
      type="button"
      onClick={() => onSelectPage(pageNumber)}
      className={cn(className, "hover:bg-accent/60")}
    >
      <Text size="meta" truncate as="span">
        {node.title}
      </Text>
    </button>
  );
}
