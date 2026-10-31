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
import { sessionsStore, useHostSessions } from "./sessions";

export function RenameSessionForm({
  host,
  sessionId,
}: {
  host: SavedHost;
  sessionId: string;
}) {
  const { t } = useTranslation("sessions");
  const router = useRouter();
  const input = useRef<TextInputInstance>(null);
  const session = useHostSessions(host.hostId).sessions.find(
    (candidate) => candidate.id === sessionId,
  );
  const initialTitle = session?.title ?? "";
  const [title, setTitle] = useState(initialTitle);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const trimmed = title.trim();
  const canSave =
    !saving &&
    session !== undefined &&
    trimmed !== "" &&
    trimmed !== initialTitle &&
    host.scopes.includes("interact");

  const save = async () => {
    if (!canSave) return;
    input.current?.blur();
    setSaving(true);
    setFailed(false);
    try {
      await hostConnection(host.hostId).request("session.updateTitle", {
        sessionId,
        title: trimmed,
        updatedAt: new Date().toISOString(),
      });
      void sessionsStore(host.hostId).reload();
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
            testID="rename-session-title"
            placeholder={t("rename.placeholder")}
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
