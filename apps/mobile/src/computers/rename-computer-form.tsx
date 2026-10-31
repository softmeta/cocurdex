import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TextInputInstance } from "react-native";
import { hosts, useSavedHosts } from "@/hosts";
import {
  FieldSection,
  Form,
  FormNote,
  FormTextField,
  keyboardHidden,
  ModalCloseButton,
  SheetAction,
} from "@/ui";

export function RenameComputerForm({ hostId }: { hostId: string }) {
  const { t } = useTranslation("hosts");
  const router = useRouter();
  const input = useRef<TextInputInstance>(null);
  const host = useSavedHosts().find((saved) => saved.hostId === hostId);
  const initialName = host?.name ?? "";
  const [name, setName] = useState(initialName);
  const trimmed = name.trim();
  const canSave =
    host !== undefined && trimmed !== "" && trimmed !== initialName;

  const save = async () => {
    if (!canSave) return;
    input.current?.blur();
    hosts.rename(hostId, trimmed);
    await keyboardHidden();
    router.back();
  };

  return (
    <>
      <ModalCloseButton />
      <SheetAction
        label={t("rename.save")}
        disabled={!canSave}
        onPress={() => void save()}
      />
      <Form adjustsForKeyboard>
        <FieldSection footer={<FormNote>{t("rename.footer")}</FormNote>}>
          <FormTextField
            ref={input}
            testID="rename-computer-name"
            placeholder={t("rename.placeholder")}
            defaultValue={initialName}
            autoFocus
            selectTextOnFocus
            returnKeyType="done"
            onSubmitEditing={() => void save()}
            onChangeText={setName}
          />
        </FieldSection>
      </Form>
    </>
  );
}
