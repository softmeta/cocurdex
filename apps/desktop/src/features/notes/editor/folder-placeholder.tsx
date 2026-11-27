import type { NoteRecord } from "@cocurdex/shared";
import { Folder } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState, ScrollArea } from "@/components/ui";
import { cn } from "@/lib";
import { useCommitFolderRename } from "./note-editor-sync";

export function FolderPlaceholder({ note }: { note: NoteRecord }) {
  const { t } = useTranslation("notes");
  const [value, setValue] = useState(note.title);
  const commitRename = useCommitFolderRename(note.id);
  const skipCommitRef = useRef(false);

  const commit = async () => {
    if (skipCommitRef.current) {
      skipCommitRef.current = false;
      return;
    }
    const nextTitle = await commitRename(value, note.title);
    setValue(nextTitle);
  };

  return (
    <ScrollArea
      className="min-h-0 flex-1"
      viewportProps={{ className: "flex flex-col" }}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-10 pb-8">
        <input
          type="text"
          value={value}
          placeholder={t("editor.untitledPlaceholder")}
          aria-label={t("editor.folder.renameLabel")}
          className={cn(
            "h-8 w-full bg-transparent text-title font-semibold text-foreground placeholder:text-muted-foreground focus:outline-none",
          )}
          onChange={(event) => setValue(event.target.value)}
          onBlur={() => {
            void commit();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              (event.target as HTMLInputElement).blur();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              skipCommitRef.current = true;
              setValue(note.title);
              (event.target as HTMLInputElement).blur();
            }
          }}
        />
        <div className="mt-8 flex flex-1 items-start justify-center">
          <EmptyState
            icon={<Folder />}
            title={t("editor.folder.emptyTitle")}
            description={t("editor.folder.description")}
          />
        </div>
      </div>
    </ScrollArea>
  );
}
