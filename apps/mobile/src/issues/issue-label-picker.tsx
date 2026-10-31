import type { SavedHost } from "@cocurdex/client-runtime";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";
import {
  CloseButton,
  Form,
  FormRow,
  FormSection,
  ListNotice,
  SelectedMark,
} from "@/ui";
import { toggledLabelIds } from "./issue-patch";
import { useIssueDetail, useIssueView } from "./issue-queries";
import { useIssueUpdate } from "./issue-update";

export function IssueLabelPicker({
  host,
  issueId,
}: {
  host: SavedHost;
  issueId: string;
}) {
  const { t } = useTranslation("issues");
  const router = useRouter();
  const issue = useIssueDetail(host.hostId, issueId).data?.issue;
  const labels = useIssueView(host.hostId, { cached: true }).data?.labels ?? [];
  const update = useIssueUpdate(host, issueId);

  const toggle = (labelId: string) => {
    if (!issue) return;
    update({ labelIds: toggledLabelIds(issue.labelIds, labelId) }).catch(() =>
      Alert.alert(t("update.failed")),
    );
  };

  return (
    <>
      <CloseButton
        accessibilityLabel={t("filter.close")}
        onPress={() => router.dismiss()}
      />
      {labels.length === 0 ? (
        <ListNotice title={t("labels.empty")} />
      ) : (
        <Form>
          <FormSection>
            {labels.map((label) => {
              const selected = issue?.labelIds.includes(label.id) ?? false;
              return (
                <FormRow
                  key={label.id}
                  testID={`issue-label-${label.id}`}
                  selected={selected}
                  trailing={<SelectedMark selected={selected} />}
                  onPress={() => toggle(label.id)}
                >
                  {label.name}
                </FormRow>
              );
            })}
          </FormSection>
        </Form>
      )}
    </>
  );
}
