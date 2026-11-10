import type { SavedHost } from "@cocurdex/client-runtime";
import type { NoteSummary } from "@cocurdex/shared";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";
import { hostConnection } from "@/connection";
import { useScopeGate } from "@/hosts";
import {
  type AnchoredMenuItem,
  type MenuAnchor,
  useAnchoredMenu,
  useConfirm,
} from "@/ui";
import { createBlankNote } from "./create-note";
import { useNotes } from "./note-queries";

type NoteAction = "rename" | "subpage" | "delete";

const ACTION_ICONS: Record<
  NoteAction,
  NonNullable<AnchoredMenuItem["icon"]>
> = {
  rename: { ios: "pencil", android: "edit" },
  subpage: { ios: "doc.badge.plus", android: "note_add" },
  delete: { ios: "trash", android: "delete" },
};

const ACTIONS: readonly NoteAction[] = ["rename", "subpage", "delete"];

export function useNoteActions(host: SavedHost) {
  const { t } = useTranslation("notes");
  const router = useRouter();
  const gate = useScopeGate(host);
  const menu = useAnchoredMenu("note-actions");
  const { confirm, dialog } = useConfirm();
  const notes = useNotes(host.hostId);

  const remove = (note: NoteSummary) => {
    const list = notes.data;
    const request = hostConnection(host.hostId)
      .request("note.delete", { id: note.id, expectedRevision: note.revision })
      .then(() => undefined);
    notes
      .mutate(request, {
        ...(list
          ? { optimisticData: list.filter((entry) => entry.id !== note.id) }
          : {}),
        populateCache: false,
        revalidate: true,
        rollbackOnError: true,
      })
      .catch(() => Alert.alert(t("actions.failed")));
  };

  const addSubpage = (note: NoteSummary) =>
    createBlankNote(host.hostId, {
      parentId: note.id,
      workspaceId: note.workspaceId,
    })
      .then((created) =>
        router.push({
          pathname: "/note/[hostId]/[noteId]",
          params: { hostId: host.hostId, noteId: created.id, created: "1" },
        }),
      )
      .catch(() => Alert.alert(t("create.failed")));

  const labels: Record<NoteAction, string> = {
    rename: t("actions.rename"),
    subpage: t("actions.subpage"),
    delete: t("actions.delete"),
  };

  const handlers = (note: NoteSummary): Record<NoteAction, () => void> => ({
    rename: () =>
      router.push({
        pathname: "/rename-note/[hostId]/[noteId]",
        params: { hostId: host.hostId, noteId: note.id },
      }),
    subpage: () => void addSubpage(note),
    delete: () =>
      confirm({
        title: t("actions.deleteTitle", {
          title: note.title || t("editor.untitled"),
        }),
        message: t("actions.deleteMessage"),
        cancelLabel: t("actions.cancel"),
        confirmLabel: t("actions.delete"),
        destructive: true,
        onConfirm: () => remove(note),
      }),
  });

  const open = (note: NoteSummary, anchor: MenuAnchor) => {
    const noteHandlers = handlers(note);
    menu.open(anchor, {
      items: ACTIONS.map((action) => ({
        key: action,
        testID: `note-action-${action}`,
        label: labels[action],
        icon: ACTION_ICONS[action],
        group: action === "delete" ? "remove" : "change",
        destructive: action === "delete",
        presents: true,
        onPress: gate("interact", noteHandlers[action]),
      })),
    });
  };

  return { open, menu: menu.menu, dialog };
}
