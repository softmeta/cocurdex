import {
  countIssuePlace,
  type IssuePlace,
  workspacesWithIssues,
} from "@cocurdex/client-runtime";
import type {
  IssueActivityLookup,
  IssueRecord,
  WorkspaceRecord,
} from "@cocurdex/shared";
import { useTranslation } from "react-i18next";
import { CapsuleTabs } from "@/ui";
import { issuePlaceKey } from "./issue-place-key";

export function IssuePlaceTabs({
  issues,
  filtered,
  workspaces,
  place,
  activityOf,
  onSelect,
}: {
  issues: readonly IssueRecord[];
  filtered: readonly IssueRecord[];
  workspaces: readonly WorkspaceRecord[];
  place: IssuePlace;
  activityOf: IssueActivityLookup;
  onSelect(place: IssuePlace): void;
}) {
  const { t } = useTranslation("issues");
  const places: { place: IssuePlace; label: string }[] = [
    { place: { kind: "all" }, label: t("place.all") },
    {
      place: { kind: "agent", activity: "working" },
      label: t("place.agentWorking"),
    },
    {
      place: { kind: "agent", activity: "needsYou" },
      label: t("place.needsYou"),
    },
    ...workspacesWithIssues(workspaces, issues).map((workspace) => ({
      place: { kind: "workspace", workspaceId: workspace.id } as const,
      label: workspace.name,
    })),
  ];
  return (
    <CapsuleTabs
      testID="issue-place"
      tabs={places.map((entry) => ({
        key: issuePlaceKey(entry.place),
        label: entry.label,
        count:
          entry.place.kind === "all"
            ? undefined
            : countIssuePlace(filtered, entry.place, activityOf),
      }))}
      selectedKey={issuePlaceKey(place)}
      onSelect={(key) => {
        const next = places.find((entry) => issuePlaceKey(entry.place) === key);
        if (next) onSelect(next.place);
      }}
    />
  );
}
