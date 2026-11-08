import { NOTE_DOC_FIELD } from "@cocurdex/note-doc";
import type { NoteRecord } from "@cocurdex/shared";
import { offset } from "@floating-ui/dom";
import Collaboration from "@tiptap/extension-collaboration";
import DragHandle from "@tiptap/extension-drag-handle-react";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import { useAtomValue, useSetAtom, useStore } from "jotai";
import { Folder, GripVertical } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  buildMarkdownBodyExtensions,
  focusParagraphAtStart,
  TableControls,
} from "@/components/markdown-body-editor";
import "@/components/markdown-body-editor/markdown-body-editor.css";
import { EmptyState, Text } from "@/components/ui";
import { RelatedEntities } from "@/features/entity-links";
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
import { NoteTimestamps } from "./note-timestamps";
import { useHideDragHandleOnLayoutShift } from "./use-hide-drag-handle-on-layout-shift";

const NOTE_LINK_PREFIX = "note://";

const BLOCK_GRIP_OVERLAP = -6;
const TABLE_GRIP_GAP = 8;

function createDragHandlePosition() {
  const hovered = { isTable: false };
  return {
    hovered,
    config: {
      placement: "left-start" as const,
      strategy: "absolute" as const,
      middleware: [
        offset(() => ({
          mainAxis: hovered.isTable ? TABLE_GRIP_GAP : BLOCK_GRIP_OVERLAP,
        })),
      ],
    },
  };
}

export function NoteEditor() {
  const activeNote = useAtomValue(activeNoteAtom);
  const activeNoteId = useAtomValue(activeNoteIdAtom);
  const activeNoteDoc = useAtomValue(activeNoteDocAtom);

  if (!activeNoteId) {
    return null;
  }
  if (activeNote && activeNote.kind === "folder") {
    return <FolderPlaceholder key={activeNote.id} note={activeNote} />;
  }
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
    immediatelyRender: false,
    onCreate: ({ editor: created }) => {
      const insertMarkdown = (markdown: string) =>
        appendMarkdownToEditor(created, markdown);
      setInsertHandler(() => insertMarkdown);
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
      handleClick: (_view, _pos, event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
          return false;
        }
        const anchor = target.closest("a");
        if (!(anchor instanceof HTMLAnchorElement)) {
          return false;
        }
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

  const editorChromeRef = useHideDragHandleOnLayoutShift(editor);
  const [dragHandlePosition] = useState(createDragHandlePosition);

  return (
    <div
      ref={editorChromeRef}
      className="flex min-h-0 flex-1 flex-col overflow-y-auto"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-10 pt-4 pb-8">
        <div className="mb-4 flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <NoteTitleInput
              key={titleEpoch}
              noteId={note.id}
              initialTitle={note.title}
              editor={editor}
            />
            <SaveIndicator status={saveStatus} />
          </div>
          <NoteTimestamps
            createdAt={note.createdAt}
            updatedAt={note.updatedAt}
          />
        </div>
        {editor ? (
          <DragHandle
            editor={editor}
            computePositionConfig={dragHandlePosition.config}
            onNodeChange={({ node }) => {
              dragHandlePosition.hovered.isTable = node?.type.name === "table";
            }}
          >
            <div className="flex h-[calc(1.7*var(--text-body))] cursor-grab items-center pe-2 text-muted-foreground hover:text-foreground active:cursor-grabbing">
              <GripVertical className="size-4" />
            </div>
          </DragHandle>
        ) : null}
        <div className="relative flex flex-1 flex-col">
          <EditorContent editor={editor} className="relative flex-1" />
          {editor ? <TableControls editor={editor} /> : null}
        </div>
        <RelatedEntities entity={{ kind: "note", id: note.id }} />
      </div>
    </div>
  );
}

interface NoteTitleInputProps {
  noteId: string;
  initialTitle: string;
  editor: Editor | null;
}

function NoteTitleInput({ noteId, initialTitle, editor }: NoteTitleInputProps) {
  const { t } = useTranslation("notes");
  const [value, setValue] = useState(initialTitle);
  const rename = useDebouncedNoteRename({ noteId });

  return (
    <input
      type="text"
      value={value}
      placeholder={t("editor.untitledPlaceholder")}
      aria-label={t("editor.titleLabel")}
      className={cn(
        "min-w-0 flex-1 bg-transparent text-title font-semibold text-foreground placeholder:text-muted-foreground focus:outline-none",
      )}
      onChange={(event) => {
        const next = event.target.value;
        setValue(next);
        rename(next);
      }}
      onKeyDown={(event) => {
        if (!editor || event.nativeEvent.isComposing) return;
        if (event.key === "Enter") {
          event.preventDefault();
          focusParagraphAtStart(editor.state, editor.view.dispatch);
          editor.view.focus();
        } else if (event.key === "ArrowDown") {
          event.preventDefault();
          editor.commands.focus("start");
        }
      }}
    />
  );
}

function FolderPlaceholder({ note }: { note: NoteRecord }) {
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
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-10 pt-4 pb-8">
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
