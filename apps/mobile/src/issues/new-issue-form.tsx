import type { SavedHost } from "@cocurdex/client-runtime";
import { Stack, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { hostConnection } from "@/connection";
import { NoteEditor, type NoteEditorHandle } from "@/notes";
import { layout, useThemeColors } from "@/theme";
import { keyboardHidden, ModalCloseButton, SheetAction } from "@/ui";
import {
  type IssueField,
  NO_WORKSPACE,
  useIssueFieldChips,
} from "./issue-field-chips";
import { useIssueView } from "./issue-queries";
import { defaultIssuePriority, defaultIssueStatus } from "./new-issue-defaults";

export function NewIssueForm({
  host,
  initialWorkspaceId,
}: {
  host: SavedHost;
  initialWorkspaceId: string | null;
}) {
  const { t } = useTranslation("issues");
  const router = useRouter();
  const colors = useThemeColors();
  const editor = useRef<NoteEditorHandle>(null);
  const view = useIssueView(host.hostId);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [workspaceId, setWorkspaceId] = useState(
    initialWorkspaceId ?? NO_WORKSPACE,
  );
  const [status, setStatus] = useState<string | null>(null);
  const [priority, setPriority] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [failed, setFailed] = useState(false);
  const data = view.data;
  const statusId = status ?? defaultIssueStatus(data?.statusOptions ?? []);
  const priorityId =
    priority ?? defaultIssuePriority(data?.priorityOptions ?? []);
  const interactive = host.scopes.includes("interact");
  const canCreate =
    !creating && title.trim() !== "" && data != null && interactive;

  const hideKeyboard = async () => {
    editor.current?.blur();
    await keyboardHidden();
  };

  const setters: Record<IssueField, (value: string) => void> = {
    workspace: setWorkspaceId,
    status: setStatus,
    priority: setPriority,
  };
  const fields = useIssueFieldChips({
    hostId: host.hostId,
    options: data ?? undefined,
    values: {
      workspace: workspaceId,
      status: statusId ?? null,
      priority: priorityId ?? null,
    },
    testIDPrefix: "new-issue",
    enabled: true,
    beforePick: hideKeyboard,
    onChange: (field, value) => setters[field](value),
  });

  const create = async () => {
    if (!canCreate || !data) return;
    setCreating(true);
    setFailed(false);
    try {
      const issue = await hostConnection(host.hostId).request("issue.create", {
        viewId: data.view.id,
        title: title.trim(),
        description: description.trim() || null,
        status: statusId,
        priority: priorityId,
        workspaceId: workspaceId === NO_WORKSPACE ? null : workspaceId,
      });
      void view.mutate();
      await hideKeyboard();
      router.replace({
        pathname: "/issue/[hostId]/[issueId]",
        params: { hostId: host.hostId, issueId: issue.id },
      });
    } catch {
      setCreating(false);
      setFailed(true);
    }
  };

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerTitle: () => fields.chip("workspace") }} />
      <ModalCloseButton />
      <SheetAction
        label={creating ? t("create.creating") : t("create.submit")}
        disabled={!canCreate}
        onPress={() => void create()}
      />
      <NoteEditor
        ref={editor}
        testID="new-issue-editor"
        hostId={host.hostId}
        body={{ kind: "markdown", markdown: "", onChange: setDescription }}
        title=""
        meta={null}
        titlePlaceholder={t("create.titlePlaceholder")}
        bodyPlaceholder={t("create.descriptionPlaceholder")}
        focusTitle
        editable={interactive}
        interactive={interactive}
        onTitle={setTitle}
        accessory={
          <>
            {failed ? (
              <Text style={[styles.failed, { color: colors.destructive }]}>
                {t("create.failed")}
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
