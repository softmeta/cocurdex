import { useTranslation } from "react-i18next";
import { FileTypeIcon } from "@/components/file-type-icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import {
  type GitChangeEntry,
  gitChangeMarker,
  splitChangePath,
} from "./git-changes-model";

interface GitChangesFileListProps {
  entries: GitChangeEntry[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

// Flat alternative to the tree index: the same rows without the folder
// hierarchy, so a change set reads as one scannable column. Picking a row means
// the same thing it does in the tree — reveal that file in the diff stack.
//
// The index column is narrow, so a row carries only the file icon, the path and
// git's one-letter status; line counts and the change-type glyph belong to the
// diff cards, where there is room for them.
export function GitChangesFileList({
  entries,
  selectedPath,
  onSelect,
}: GitChangesFileListProps) {
  const { t } = useTranslation("editor");

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {entries.map((entry) => {
        const { dir, name } = splitChangePath(entry.path);
        const marker = gitChangeMarker(entry.changeType);
        const isSelected = entry.path === selectedPath;
        return (
          <button
            aria-current={isSelected ? "true" : undefined}
            className={cn(
              "flex w-full min-w-0 shrink-0 items-center gap-1.5 rounded-control px-1 py-1 text-start text-body transition-colors",
              "hover:bg-editor-tab-hover-bg",
              isSelected && "bg-editor-tab-hover-bg",
            )}
            key={entry.path}
            onClick={() => onSelect(entry.path)}
            title={entry.path}
            type="button"
          >
            <FileTypeIcon className="shrink-0" path={entry.path} />
            {/* The directory yields first: it only claims leftover space, and
                the file name keeps its width until the row is too small for the
                name alone. */}
            <span className="flex min-w-0 flex-1 items-center">
              {dir ? (
                <span className="min-w-0 flex-1 truncate text-editor-fg-muted">
                  {dir}
                </span>
              ) : null}
              <span className="min-w-0 truncate text-editor-fg">{name}</span>
            </span>
            <Text
              className={cn("shrink-0", marker.className)}
              size="meta"
              title={t(`git.changeType.${entry.changeType}`)}
            >
              {marker.letter}
            </Text>
          </button>
        );
      })}
    </div>
  );
}
