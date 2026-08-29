import type { NoteRecord } from "@cocurdex/shared";
import { offset } from "@floating-ui/dom";
import DragHandle from "@tiptap/extension-drag-handle-react";
import { EditorContent, useEditor } from "@tiptap/react";
import { useAtomValue, useSetAtom, useStore } from "jotai";
import { Folder, GripVertical } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { buildMarkdownBodyExtensions } from "@/components/markdown-body-editor";
import "@/components/markdown-body-editor/markdown-body-editor.css";
import { EmptyState, Spinner, Text } from "@/components/ui";
import { parsePdfNoteCitationHref } from "@/features/pdf-reader/pdf-note-citation";
import { openPdfAtPageAtom } from "@/features/pdf-reader/pdf-reader-store";
import { cn } from "@/lib";
import { appendMarkdownToEditor } from "../append-markdown-to-editor";
import {
  flushPendingNoteBodyInsert,
  noteBodyInsertHandlerAtom,
  pendingNoteBodyInsertAtom,
} from "../note-body-insert";
import {
  activeNoteAtom,
  activeNoteIdAtom,
  type NoteSaveStatus,
  noteContentEpochAtom,
  noteSaveStatusAtom,
} from "../notes-store";
import {
  useCommitFolderRename,
  useDebouncedNoteRename,
} from "./note-editor-sync";
import { useHideDragHandleOnLayoutShift } from "./use-hide-drag-handle-on-layout-shift";
import { useNoteAutosave } from "./use-note-autosave";

// left-start pins the handle to the block top. Negative mainAxis overlaps the
// handle into the block so mouseleave relatedTarget stays on the handle — a
// positive gap creates a dead zone where the grip vanishes before the cursor
// can reach it. Module-level so DragHandle does not re-register every render.
const DRAG_HANDLE_COMPUTE_POSITION = {
  placement: "left-start" as const,
  strategy: "absolute" as const,
  middleware: [offset({ mainAxis: -6 })],
};

export function NoteEditor() {
  const activeNote = useAtomValue(activeNoteAtom);
  const activeNoteId = useAtomValue(activeNoteIdAtom);

  if (!activeNoteId) {
    return null;
  }
  // Folders have no body editor — only notes (files) open in the canvas.
  if (activeNote && activeNote.kind === "folder") {
    return <FolderPlaceholder key={activeNote.id} note={activeNote} />;
  }
  // While the newly selected note is loading, the previous note's record is
  // still in the atom. Rendering it would let the user type into the old
  // document while autosave targets the new note id — show a spinner instead.
  if (!activeNote || activeNote.id !== activeNoteId) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }
  // Keyed by note id + content epoch so external disk reloads remount Tiptap
  // with the new body without leaking undo history across notes.
  return <NoteEditorBodyWithEpoch key={activeNote.id} note={activeNote} />;
}

function NoteEditorBodyWithEpoch({ note }: { note: NoteRecord }) {
  const contentEpoch = useAtomValue(noteContentEpochAtom);
  return <NoteEditorBody key={`${note.id}:${contentEpoch}`} note={note} />;
}

function NoteEditorBody({ note }: { note: NoteRecord }) {
  const { t } = useTranslation("notes");
  const saveStatus = useAtomValue(noteSaveStatusAtom);
  const setInsertHandler = useSetAtom(noteBodyInsertHandlerAtom);
  const store = useStore();
  // Parse once per mount; the component is remounted (keyed) per note.
  const [initialMarkdown] = useState(() => note.bodyMarkdown);

  const editor = useEditor({
    extensions: buildMarkdownBodyExtensions(t("editor.placeholder")),
    content: initialMarkdown,
    contentType: "markdown",
    // Required: avoids "can't access DOM" errors under jsdom / non-DOM render.
    immediatelyRender: false,
    onCreate: ({ editor: created }) => {
      const insertMarkdown = (markdown: string) => {
        if (!appendMarkdownToEditor(created, markdown)) {
          return false;
        }
        // Keep the jotai record in sync so a soft-refresh remount does not
        // reload a stale empty/old bodyMarkdown and wipe in-memory clips.
        const active = store.get(activeNoteAtom);
        if (active && typeof created.getMarkdown === "function") {
          store.set(activeNoteAtom, {
            ...active,
            bodyMarkdown: created.getMarkdown(),
          });
        }
        return true;
      };
      // Jotai treats bare function values as updaters — wrap so the handler
      // itself is stored as the atom value.
      setInsertHandler(() => insertMarkdown);
      // PDF (and others) may have stashed markdown while the body was unmounted.
      flushPendingNoteBodyInsert(
        insertMarkdown,
        () => store.get(pendingNoteBodyInsertAtom),
        () => store.set(pendingNoteBodyInsertAtom, null),
      );
    },
    onDestroy: () => {
      setInsertHandler(null);
    },
    editorProps: {
      attributes: {
        class: "md-body-prose focus:outline-none min-h-full",
      },
      // Intercept PDF citation links so they open the in-app reader instead of
      // navigating the Electron shell / browser (or spawning target=_blank).
      handleClick: (_view, _pos, event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
          return false;
        }
        const anchor = target.closest("a");
        if (!(anchor instanceof HTMLAnchorElement)) {
          return false;
        }
        // Prefer the raw attribute; `.href` can resolve oddly for custom schemes.
        const attrHref = anchor.getAttribute("href") ?? "";
        const resolvedHref = typeof anchor.href === "string" ? anchor.href : "";
        const isPdfCitation =
          attrHref.startsWith("cocurdex-pdf:") ||
          resolvedHref.startsWith("cocurdex-pdf:");
        if (!isPdfCitation) {
          return false;
        }
        // Always stop default navigation for our private scheme first.
        event.preventDefault();
        const citation = parsePdfNoteCitationHref(
          attrHref.startsWith("cocurdex-pdf:") ? attrHref : resolvedHref,
        );
        if (citation) {
          store.set(openPdfAtPageAtom, {
            filePath: citation.filePath,
            pageNumber: citation.pageNumber,
          });
        }
        return true;
      },
    },
  });

  useNoteAutosave(editor, note.id, note.revision);
  // DragHandle freezes its floating coords until the hovered node changes;
  // hide on editor-chrome resize so it re-anchors after sidebar/panel drags.
  const editorChromeRef = useHideDragHandleOnLayoutShift(editor);

  return (
    <div
      ref={editorChromeRef}
      className="flex min-h-0 flex-1 flex-col overflow-y-auto"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-10 py-8">
        <NoteTitleInput noteId={note.id} initialTitle={note.title} />
        <div className="mt-1 mb-4 h-4">
          <SaveIndicator status={saveStatus} />
        </div>
        {editor ? (
          <DragHandle
            editor={editor}
            computePositionConfig={DRAG_HANDLE_COMPUTE_POSITION}
          >
            {/*
              Match .md-body-prose first-line height (line-height 1.7 × body
              size) so left-start + items-center optically centers the grip on
              the first line. pe-* widens the hit target toward the text so the
              cursor can cross from the block onto the handle without a gap.
            */}
            <div className="flex h-[calc(1.7*var(--text-body))] cursor-grab items-center pe-2 text-muted-foreground hover:text-foreground active:cursor-grabbing">
              <GripVertical className="size-4" />
            </div>
          </DragHandle>
        ) : null}
        <EditorContent editor={editor} className="flex-1" />
      </div>
    </div>
  );
}

interface NoteTitleInputProps {
  noteId: string;
  initialTitle: string;
}

// Title lives outside the Tiptap document as a controlled input, debounced into
// notes:rename (frontmatter). File path stays stable so links remain valid.
function NoteTitleInput({ noteId, initialTitle }: NoteTitleInputProps) {
  const { t } = useTranslation("notes");
  const [value, setValue] = useState(initialTitle);
  const rename = useDebouncedNoteRename({ noteId });

  return (
    <input
      type="text"
      value={value}
      placeholder={t("editor.untitledPlaceholder")}
      className={cn(
        "w-full bg-transparent text-title font-semibold text-foreground placeholder:text-muted-foreground focus:outline-none",
      )}
      onChange={(event) => {
        const next = event.target.value;
        setValue(next);
        rename(next);
      }}
    />
  );
}

function FolderPlaceholder({ note }: { note: NoteRecord }) {
  const { t } = useTranslation("notes");
  const [value, setValue] = useState(note.title);
  const commitRename = useCommitFolderRename(note.id);
  // Escape resets the field and skips the blur commit that would re-apply dirty text.
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
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-10 py-8">
        <input
          type="text"
          value={value}
          placeholder={t("editor.untitledPlaceholder")}
          aria-label={t("editor.folder.renameLabel")}
          className={cn(
            "w-full bg-transparent text-title font-semibold text-foreground placeholder:text-muted-foreground focus:outline-none",
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
    </div>
  );
}

function SaveIndicator({ status }: { status: NoteSaveStatus }) {
  const { t } = useTranslation("notes");
  if (status === "idle") {
    return null;
  }
  if (status === "saving") {
    return (
      <Text size="meta" tone="muted">
        {t("editor.save.saving")}
      </Text>
    );
  }
  if (status === "saved") {
    return (
      <Text size="meta" tone="muted">
        {t("editor.save.saved")}
      </Text>
    );
  }
  return (
    <Text size="meta" tone="destructive">
      {t("editor.save.error")}
    </Text>
  );
}
