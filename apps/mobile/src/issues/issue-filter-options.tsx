import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import { useThemeColors } from "@/theme";
import { Decorative } from "@/ui";
import type { IssueFilterField } from "./issue-filters";
import { IssuePriorityMark } from "./issue-priority-mark";
import { useIssueView } from "./issue-queries";
import { IssueStatusMark } from "./issue-status-mark";

export interface IssueFilterOption {
  value: string;
  label: string;
  leading?: ReactElement;
}

function LabelDot({ color }: { color: string | null }) {
  const colors = useThemeColors();
  return (
    <View
      style={[styles.dot, { backgroundColor: color ?? colors.mutedForeground }]}
    />
  );
}

export function useIssueFilterOptions(
  hostId: string,
): Record<IssueFilterField, IssueFilterOption[]> {
  const view = useIssueView(hostId, { cached: true }).data;
  return {
    statuses: (view?.statusOptions ?? []).map((status) => ({
      value: status.id,
      label: status.title,
      leading: (
        <Decorative>
          <IssueStatusMark category={status.category} label={status.title} />
        </Decorative>
      ),
    })),
    priorities: (view?.priorityOptions ?? []).map((priority) => ({
      value: priority.id,
      label: priority.title,
      leading: (
        <Decorative>
          <IssuePriorityMark priority={priority.id} label={priority.title} />
        </Decorative>
      ),
    })),
    labelIds: (view?.labels ?? []).map((label) => ({
      value: label.id,
      label: label.name,
      leading: <LabelDot color={label.color} />,
    })),
  };
}

export function useIssueFilterTitles(): Record<IssueFilterField, string> {
  const { t } = useTranslation("issues");
  return {
    statuses: t("field.status"),
    priorities: t("field.priority"),
    labelIds: t("field.labels"),
  };
}

const styles = StyleSheet.create({
  dot: { width: 10, height: 10, borderRadius: 5, marginHorizontal: 4 },
});
