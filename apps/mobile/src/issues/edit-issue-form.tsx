import type { SavedHost } from "@cocurdex/client-runtime";
import type { IssueRecord } from "@cocurdex/shared";
import { Stack, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, StyleSheet, Text, View } from "react-native";
import { NoteEditor, type NoteEditorHandle } from "@/notes";
import { layout, useThemeColors } from "@/theme";
import {
  keyboardHidden,
  ModalCloseButton,
  PendingIndicator,
  SheetAction,
} from "@/ui";
import {
  type IssueField,
  NO_WORKSPACE,
  useIssueFieldChips,
} from "./issue-field-chips";
import { type IssuePatch, issueTextPatch } from "./issue-patch";
import { useIssueDetail, useIssueView } from "./issue-queries";
import { useIssueUpdate } from "./issue-update";

export function EditIssueForm({
  host,
  issueId,
}: {
  host: SavedHost;
  issueId: string;
}) {
  const issue = useIssueDetail(host.hostId, issueId).data?.issue;
  if (!issue) return <PendingIndicator />;
  return <Editor host={host} issue={issue} />;
}

function fieldPatch(field: IssueField, value: string): IssuePatch {
  if (field === "workspace") {
    return { workspaceId: value === NO_WORKSPACE ? null : value };
  }
  return { [field]: value };
}

function textRevision(initial: IssueRecord, current: IssueRecord) {
  const textChanged =
    current.title !== initial.title ||
    current.description !== initial.description;
  return textChanged ? initial.revision : current.revision;
}

function Editor({ host, issue }: { host: SavedHost; issue: IssueRecord }) {
  const { t } = useTranslation("issues");
  const router = useRouter();
  const colors = useThemeColors();
  const update = useIssueUpdate(host, issue.id);
  const view = useIssueView(host.hostId, { cached: true }).data;
  const editor = useRef<NoteEditorHandle>(null);
  const [initial] = useState(issue);
  const [title, setTitle] = useState(issue.title);
  const [description, setDescription] = useState(issue.description ?? "");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const interactive = host.scopes.includes("interact");
  const patch = issueTextPatch(issue, title, description);
  const canSave =
    !saving &&
    title.trim() !== "" &&
    Object.keys(patch).length > 0 &&
    interactive;

  const hideKeyboard = async () => {
    editor.current?.blur();
    await keyboardHidden();
  };

  const fields = useIssueFieldChips({
    hostId: host.hostId,
    options: view ?? undefined,
    values: {
      workspace: issue.workspaceId ?? NO_WORKSPACE,
      status: issue.status,
      priority: issue.priority,
    },
    testIDPrefix: "edit-issue",
    enabled: interactive && view != null,
    beforePick: hideKeyboard,
    onChange: (field, value) =>
      void update(fieldPatch(field, value)).catch(() =>
        Alert.alert(t("update.failed")),
      ),
  });

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setFailed(false);
    try {
      await update(patch, textRevision(initial, issue));
      await hideKeyboard();
      router.back();
    } catch {
      setSaving(false);
      setFailed(true);
    }
  };

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerTitle: () => fields.chip("workspace") }} />
      <ModalCloseButton />
      <SheetAction
        label={saving ? t("edit.saving") : t("edit.save")}
        disabled={!canSave}
        onPress={() => void save()}
      />
      <NoteEditor
        ref={editor}
        testID="edit-issue-editor"
        hostId={host.hostId}
        body={{
          kind: "markdown",
          markdown: initial.description ?? "",
          onChange: setDescription,
        }}
        title={initial.title}
        meta={null}
        titlePlaceholder={t("create.titlePlaceholder")}
        bodyPlaceholder={t("create.descriptionPlaceholder")}
        focusTitle={false}
        editable={interactive}
        interactive={interactive}
        onTitle={setTitle}
        accessory={
          <>
            {failed ? (
              <Text style={[styles.failed, { color: colors.destructive }]}>
                {t("edit.failed")}
              </Text>
            ) : null}
            {fields.bar}
          </>
        }
      />
      {fields.menu}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  failed: {
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: layout.sideMargin,
  },
});
