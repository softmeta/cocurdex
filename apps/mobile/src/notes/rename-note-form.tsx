import type { SavedHost } from "@cocurdex/client-runtime";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TextInputInstance } from "react-native";
import { hostConnection } from "@/connection";
import {
  FieldSection,
  Form,
  FormNote,
  FormTextField,
  keyboardHidden,
  ModalCloseButton,
  SheetAction,
} from "@/ui";
import { useNotes } from "./note-queries";

export function RenameNoteForm({
  host,
  noteId,
}: {
  host: SavedHost;
  noteId: string;
}) {
  const { t } = useTranslation("notes");
  const router = useRouter();
  const input = useRef<TextInputInstance>(null);
  const notes = useNotes(host.hostId, { cached: true });
  const note = notes.data?.find((candidate) => candidate.id === noteId);
  const initialTitle = note?.title ?? "";
  const [title, setTitle] = useState(initialTitle);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const trimmed = title.trim();
  const canSave =
    !saving &&
    note !== undefined &&
    trimmed !== initialTitle &&
    host.scopes.includes("interact");

  const save = async () => {
    if (!canSave) return;
    input.current?.blur();
    setSaving(true);
    setFailed(false);
    try {
      await hostConnection(host.hostId).request("note.update", {
        id: noteId,
        title: trimmed,
      });
      void notes.mutate();
      await keyboardHidden();
      router.back();
    } catch {
      setSaving(false);
      setFailed(true);
    }
  };

  return (
    <>
      <ModalCloseButton />
      <SheetAction
        label={saving ? t("rename.saving") : t("rename.save")}
        disabled={!canSave}
        onPress={() => void save()}
      />
      <Form adjustsForKeyboard>
        <FieldSection
          footer={
            failed ? (
              <FormNote tone="destructive">{t("rename.failed")}</FormNote>
            ) : null
          }
        >
          <FormTextField
            ref={input}
            testID="rename-note-title"
            placeholder={t("editor.untitled")}
            defaultValue={initialTitle}
            autoFocus
            selectTextOnFocus
            returnKeyType="done"
            onSubmitEditing={() => void save()}
            onChangeText={setTitle}
          />
        </FieldSection>
      </Form>
    </>
  );
}
