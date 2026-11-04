import {
  DEFAULT_VIEW_DISPLAY,
  type IssueDisplayProperty,
} from "@cocurdex/shared";
import { atom } from "jotai";
import { workspacesAtom } from "@/features/workspaces";
import { activeViewAtom } from "./issues-store";

export const issueDisplayPropertiesAtom = atom(
  (get): ReadonlySet<IssueDisplayProperty> =>
    new Set(
      get(activeViewAtom)?.view.display.properties ??
        DEFAULT_VIEW_DISPLAY.properties,
    ),
);

export const issueIdentifiersByIdAtom = atom(
  (get) =>
    new Map(
      (get(activeViewAtom)?.issues ?? []).map((issue) => [
        issue.id,
        issue.identifier,
      ]),
    ),
);

export const workspaceNamesByIdAtom = atom(
  (get) =>
    new Map(
      get(workspacesAtom).map((workspace) => [workspace.id, workspace.name]),
    ),
);

export function formatIssueDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
