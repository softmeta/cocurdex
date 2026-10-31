import type { ReactElement } from "react";
import type { OptionSheetRoute } from "./option-sheet-route";

export interface OptionSheetItem {
  key: string;
  label: string;
  supporting?: string;
  leading?: ReactElement;
  destructive?: boolean;
  selected?: boolean;
  testID?: string;
  onPress(): void;
}

export interface OptionSheetRequest {
  title: string;
  subtitle?: string | null;
  items: readonly OptionSheetItem[];
}

const requests = new Map<string, OptionSheetRequest>();
let presented = 0;
let selectingFrom: OptionSheetRoute | null = null;

export function presentOptionSheet(
  request: OptionSheetRequest,
  depth: number,
): string {
  if (depth === 1) requests.clear();
  presented += 1;
  const id = String(presented);
  requests.set(id, request);
  return id;
}

export function optionSheetRequest(id: string | undefined) {
  return id === undefined ? undefined : requests.get(id);
}

export function selectOptionFrom(
  route: OptionSheetRoute,
  item: OptionSheetItem,
) {
  const opened = presented;
  selectingFrom = route;
  try {
    item.onPress();
  } finally {
    selectingFrom = null;
  }
  return presented !== opened;
}

export function optionSheetOrigin(fallback: OptionSheetRoute) {
  return selectingFrom ?? fallback;
}
