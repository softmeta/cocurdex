import type { SavedHost } from "@cocurdex/client-runtime";
import type { NoteSummary } from "@cocurdex/shared";
import { Stack } from "expo-router";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";
import { hostConnection } from "@/connection";
import { useLinkedEntitiesSheet } from "@/entity-links";
import { useHostSessions } from "@/sessions";
import {
  HeaderButtons,
  ListNotice,
  PendingIndicator,
  useAgeLabel,
  useOptionSheet,
  useTransitionSettled,
} from "@/ui";
import type { NoteSaveStatus } from "./editor/note-doc-session";
import { useNoteDocSession } from "./editor/note-doc-sessions";
import { NoteEditor, type NoteEditorHandle } from "./editor/note-editor";
import type { NoteOutline } from "./editor/note-editor-protocol";
import { useNote, useNotes } from "./note-queries";
import { parentNoteChoices } from "./note-sections";

function useSaveLabel(status: NoteSaveStatus, updatedAt: string | undefined) {
  const { t } = useTranslation("notes");
  const age = useAgeLabel(updatedAt ?? new Date().toISOString());
  if (status === "saving") return t("editor.status.saving");
  if (status === "saved") return t("editor.status.saved");
  if (status === "error") return t("editor.status.error");
  return updatedAt ? age : "";
}

const MIN_OUTLINE_HEADINGS = 3;

function useNoteOutline() {
  const { t } = useTranslation("notes");
  const openSheet = useOptionSheet();
  const editor = useRef<NoteEditorHandle>(null);
  const [outline, setOutline] = useState<NoteOutline | null>(null);
  const headings = outline?.headings ?? [];

  const open = () =>
    openSheet({
      title: t("editor.outline"),
      items: headings.map((heading, index) => ({
        key: String(index),
        label: heading.text,
        indent: Math.max(0, heading.level - 2),
        selected: index === outline?.active,
        testID: `note-outline-${index}`,
        onPress: () => editor.current?.scrollToHeading(index),
      })),
    });

  return {
    editor,
    open,
    shown: headings.length >= MIN_OUTLINE_HEADINGS,
    onOutline: setOutline,
  };
}

function useNoteProperties(
  host: SavedHost,
  noteId: string,
  notes: readonly NoteSummary[],
) {
  const { t } = useTranslation("notes");
  const openSheet = useOptionSheet();
  const { workspaces } = useHostSessions(host.hostId);
  const list = useNotes(host.hostId, { cached: true });
  const self = notes.find((entry) => entry.id === noteId);
  const workspaceName = (id: string | null) =>
    workspaces.find((entry) => entry.id === id)?.name ?? t("noWorkspace");
  const parentTitle = (id: string | null) =>
    notes.find((entry) => entry.id === id)?.title || t("editor.untitled");

  const move = async (parentId: string | null, workspaceId: string | null) => {
    try {
      await hostConnection(host.hostId).request("note.move", {
        id: noteId,
        parentId,
        workspaceId,
      });
      await list.mutate();
    } catch {
      Alert.alert(t("properties.moveFailed"));
    }
  };

  const pickWorkspace = () =>
    openSheet({
      title: t("workspace"),
      items: [null, ...workspaces.map((entry) => entry.id)].map((id) => ({
        key: id ?? "none",
        label: workspaceName(id),
        selected: self?.workspaceId === id,
        testID: `note-workspace-${id ?? "none"}`,
        onPress: () => void move(null, id),
      })),
    });

  const pickParent = () =>
    openSheet({
      title: t("properties.parent"),
      items: [
        {
          key: "none",
          label: t("properties.noParent"),
          selected: !self?.parentId,
          testID: "note-parent-none",
          onPress: () => void move(null, self?.workspaceId ?? null),
        },
        ...parentNoteChoices(notes, noteId).map((parent) => ({
          key: parent.id,
          label: parent.title || t("editor.untitled"),
          selected: self?.parentId === parent.id,
          testID: `note-parent-${parent.id}`,
          onPress: () => void move(parent.id, parent.workspaceId),
        })),
      ],
    });

  const open = () =>
    openSheet({
      title: t("properties.title"),
      items: [
        {
          key: "workspace",
          label: t("workspace"),
          supporting: workspaceName(self?.workspaceId ?? null),
          testID: "note-properties-workspace",
          onPress: pickWorkspace,
        },
        {
          key: "parent",
          label: t("properties.parent"),
          supporting: self?.parentId
            ? parentTitle(self.parentId)
            : t("properties.noParent"),
          testID: "note-properties-parent",
          onPress: pickParent,
        },
      ],
    });

  return { open, workspaceName };
}

export function NoteScreen({
  host,
  noteId,
  created,
}: {
  host: SavedHost;
  noteId: string;
  created: boolean;
}) {
  const { t } = useTranslation("notes");
  const note = useNote(host.hostId, noteId);
  const notes = useNotes(host.hostId, { cached: true }).data ?? [];
  const summary = notes.find((entry) => entry.id === noteId);
  const shown = note.data ?? summary;
  const doc = useNoteDocSession(host.hostId, noteId);
  const properties = useNoteProperties(host, noteId, notes);
  const outline = useNoteOutline();
  const saveLabel = useSaveLabel(doc.status, shown?.updatedAt);
  const settled = useTransitionSettled();
  const [editing, setEditing] = useState(created);
  const links = useLinkedEntitiesSheet(host.hostId, {
    kind: "note",
    id: noteId,
  });
  const interactive = host.scopes.includes("interact");
  const ready = settled && doc.loaded && shown !== undefined;

  const content = noteContent();
  return (
    <>
      <Stack.Screen options={{ title: "" }} />
      <HeaderButtons
        items={[
          {
            key: "outline",
            icon: { ios: "list.bullet.indent", android: "toc" },
            label: t("editor.outline"),
            hidden: !ready || !outline.shown,
            onPress: outline.open,
          },
          {
            key: "edit",
            icon: editing
              ? { ios: "checkmark", android: "check" }
              : { ios: "pencil", android: "edit" },
            label: editing ? t("editor.finishEditing") : t("editor.edit"),
            hidden: !interactive || !ready,
            onPress: () => setEditing(!editing),
          },
        ]}
      />
      {content}
    </>
  );

  function noteContent(): ReactNode {
    if (!settled) return <PendingIndicator />;
    if (note.data === null || doc.missing) {
      return <ListNotice title={t("missing")} />;
    }
    if (!doc.loaded || !shown) {
      if (doc.status !== "error" && !note.error) return <PendingIndicator />;
      return (
        <ListNotice
          title={t("unavailable.title", { host: host.name })}
          action={{
            label: t("unavailable.retry"),
            onPress: () => {
              void note.mutate();
              void doc.session.load();
            },
          }}
        />
      );
    }
    const meta = [properties.workspaceName(shown.workspaceId), saveLabel]
      .filter(Boolean)
      .join(" · ");
    return (
      <NoteEditor
        ref={outline.editor}
        hostId={host.hostId}
        body={{ kind: "doc", session: doc.session }}
        title={shown.title}
        meta={meta}
        editable={interactive && editing}
        interactive={interactive}
        focusTitle={created}
        onTitle={doc.setTitle}
        onProperties={properties.open}
        links={links.label}
        onLinks={links.open}
        onOutline={outline.onOutline}
      />
    );
  }
}
