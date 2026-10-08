import { NOTE_DOC_FIELD } from "@cocurdex/note-doc";
import type { NoteRecord } from "@cocurdex/shared";
import { offset } from "@floating-ui/dom";
import Collaboration from "@tiptap/extension-collaboration";
import DragHandle from "@tiptap/extension-drag-handle-react";
import { EditorContent, useEditor } from "@tiptap/react";
import { useAtomValue, useSetAtom, useStore } from "jotai";
import { Folder, GripVertical } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { buildMarkdownBodyExtensions } from "@/components/markdown-body-editor";
import "@/components/markdown-body-editor/markdown-body-editor.css";
import { EmptyState, Text } from "@/components/ui";
import { parsePdfNoteCitationHref } from "@/features/pdf-reader/pdf-note-citation";
import { openPdfAtPageAtom } from "@/features/pdf-reader/pdf-reader-store";
import { cn, useMountEffect } from "@/lib";
import { appendMarkdownToEditor } from "../append-markdown-to-editor";
import {
  flushPendingNoteBodyInsert,
  noteBodyInsertHandlerAtom,
  pendingNoteBodyInsertAtom,
} from "../note-body-insert";
import { attachNoteDocSession, createNoteDoc } from "../note-doc-session";
import {
  type ActiveNoteDoc,
  activeNoteAtom,
  activeNoteDocAtom,
  activeNoteIdAtom,
  applyNoteDocSaveAtom,
  type NoteSaveStatus,
  noteSaveStatusAtom,
  noteTitleEpochAtom,
  openNoteAtom,
} from "../notes-store";
import {
  useCommitFolderRename,
  useDebouncedNoteRename,
} from "./note-editor-sync";
import { useHideDragHandleOnLayoutShift } from "./use-hide-drag-handle-on-layout-shift";

const NOTE_LINK_PREFIX = "note://";

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
  const activeNoteDoc = useAtomValue(activeNoteDocAtom);

  if (!activeNoteId) {
    return null;
  }
  // Folders have no body editor — only notes (files) open in the canvas.
  if (activeNote && activeNote.kind === "folder") {
    return <FolderPlaceholder key={activeNote.id} note={activeNote} />;
  }
  // While the newly selected note is loading, the previous note's record is
  // still in the atom. Rendering it would let the user type into the old
  // document while autosave targets the new note id — render blank instead.
  if (
    !activeNote ||
    activeNote.id !== activeNoteId ||
    activeNoteDoc?.noteId !== activeNote.id
  ) {
    return <div className="flex-1" />;
  }
  return (
    <NoteEditorBody
      key={activeNote.id}
      note={activeNote}
      initialDoc={activeNoteDoc}
    />
  );
}

function useNoteDocSession(noteId: string, initialDoc: ActiveNoteDoc) {
  const store = useStore();
  const [doc] = useState(() => createNoteDoc(initialDoc.state));

  useMountEffect(() =>
    attachNoteDocSession(noteId, doc, {
      onStatus: (status) => {
        if (store.get(activeNoteIdAtom) === noteId) {
          store.set(noteSaveStatusAtom, status);
        }
      },
      onSaved: (saved) => store.set(applyNoteDocSaveAtom, saved),
    }),
  );

  return doc;
}

function readNoteLinkTarget(href: string): string | null {
  return href.startsWith(NOTE_LINK_PREFIX)
    ? decodeURIComponent(href.slice(NOTE_LINK_PREFIX.length)) || null
    : null;
}

function NoteEditorBody({
  note,
  initialDoc,
}: {
  note: NoteRecord;
  initialDoc: ActiveNoteDoc;
}) {
  const { t } = useTranslation("notes");
  const saveStatus = useAtomValue(noteSaveStatusAtom);
  const titleEpoch = useAtomValue(noteTitleEpochAtom);
  const setInsertHandler = useSetAtom(noteBodyInsertHandlerAtom);
  const store = useStore();
  const doc = useNoteDocSession(note.id, initialDoc);

  const editor = useEditor({
    extensions: [
      ...buildMarkdownBodyExtensions(t("editor.placeholder"), {
        collaborative: true,
      }),
      Collaboration.configure({ document: doc, field: NOTE_DOC_FIELD }),
    ],
    // Required: avoids "can't access DOM" errors under jsdom / non-DOM render.
    immediatelyRender: false,
    onCreate: ({ editor: created }) => {
      const insertMarkdown = (markdown: string) =>
        appendMarkdownToEditor(created, markdown);
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
        const linkedNoteId = readNoteLinkTarget(attrHref);
        if (linkedNoteId) {
          event.preventDefault();
          void store.set(openNoteAtom, linkedNoteId);
          return true;
        }
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

  // DragHandle freezes its floating coords until the hovered node changes;
  // hide on editor-chrome resize so it re-anchors after sidebar/panel drags.
  const editorChromeRef = useHideDragHandleOnLayoutShift(editor);

  return (
    <div
      ref={editorChromeRef}
      className="flex min-h-0 flex-1 flex-col overflow-y-auto"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-10 py-8">
        <NoteTitleInput
          key={titleEpoch}
          noteId={note.id}
          initialTitle={note.title}
        />
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
        <EditorContent editor={editor} className="relative flex-1" />
      </div>
    </div>
  );
}

interface NoteTitleInputProps {
  noteId: string;
  initialTitle: string;
}

// Title lives outside the Tiptap document as a controlled input, debounced into
// the note's save queue.
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
