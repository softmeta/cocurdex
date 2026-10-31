import { useLocalSearchParams } from "expo-router";
import { isListOptionField, ListOptionPicker } from "@/session-list-options";

export default function ListOptionRoute() {
  const { field } = useLocalSearchParams<{ field: string }>();
  return isListOptionField(field) ? <ListOptionPicker field={field} /> : null;
}
