import { useLocalSearchParams } from "expo-router";
import { IssueFilterPicker, isIssueFilterField } from "@/issues";

export default function IssueFilterRoute() {
  const { field } = useLocalSearchParams<{ field: string }>();
  return isIssueFilterField(field) ? <IssueFilterPicker field={field} /> : null;
}
