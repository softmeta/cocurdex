import type { TFunction } from "i18next";
import { useAtomValue, useSetAtom } from "jotai";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { FileTypeIcon } from "@/components";
import { cn, useScrollIntoViewWhenActive } from "@/lib";
import {
  activePdfPathAtom,
  closePdfAtom,
  openPdfsAtom,
  setActivePdfAtom,
} from "./pdf-reader-store";

function getDisplayName(filePath: string) {
  const lastSep = Math.max(
    filePath.lastIndexOf("/"),
    filePath.lastIndexOf("\\"),
  );
  return lastSep >= 0 ? filePath.slice(lastSep + 1) : filePath;
}

interface PdfTabItemProps {
  filePath: string;
  isActive: boolean;
  onSelect(filePath: string): void;
  onClose(filePath: string): void;
  t: TFunction<"editor">;
}

function PdfTabItem({
  filePath,
  isActive,
  onSelect,
  onClose,
  t,
}: PdfTabItemProps) {
  // Keep the active tab visible when selected or opened while the row is
  // scrolled — the overflow container is the external system synced here.
  const ref = useScrollIntoViewWhenActive<HTMLDivElement>(isActive);

  const displayName = getDisplayName(filePath);

  return (
    <div
      ref={ref}
      className={cn(
        "group flex max-w-44 shrink-0 items-center gap-1.5 rounded-control px-2 py-0.5 text-meta transition-colors",
        isActive
          ? "bg-editor-tab-active-bg text-editor-fg"
          : "text-editor-fg-muted hover:bg-editor-tab-hover-bg hover:text-editor-fg-subtle",
      )}
    >
      <span className="relative size-3.5 shrink-0">
        <FileTypeIcon
          path={filePath}
          className={cn(
            "size-3.5 transition-opacity group-hover:opacity-0",
            !isActive && "opacity-60",
          )}
        />
        <button
          type="button"
          aria-label={t("actions.closeFile", { fileName: displayName })}
          onClick={(event) => {
            event.stopPropagation();
            onClose(filePath);
          }}
          className="absolute inset-0 flex items-center justify-center rounded-control text-editor-fg-muted opacity-0 transition-opacity hover:text-editor-fg group-hover:opacity-100"
        >
          <X className="size-3" />
        </button>
      </span>
      <button
        type="button"
        onClick={() => onSelect(filePath)}
        className="min-w-0 flex-1 truncate text-left"
      >
        {displayName}
      </button>
    </div>
  );
}

export function PdfTabs() {
  const { t } = useTranslation("editor");
  const openPdfs = useAtomValue(openPdfsAtom);
  const activePath = useAtomValue(activePdfPathAtom);
  const setActive = useSetAtom(setActivePdfAtom);
  const closePdf = useSetAtom(closePdfAtom);

  if (openPdfs.length === 0) {
    return null;
  }

  return (
    <div
      className="flex h-7 items-center border-b border-editor-border px-2"
      data-testid="pdf-tabs-bar"
    >
      <div className="scrollbar-hide flex min-w-0 flex-1 items-center gap-px overflow-x-auto">
        {openPdfs.map((filePath) => (
          <PdfTabItem
            key={filePath}
            filePath={filePath}
            isActive={filePath === activePath}
            onSelect={setActive}
            onClose={closePdf}
            t={t}
          />
        ))}
      </div>
    </div>
  );
}
