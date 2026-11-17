import type { IssuePlace } from "@cocurdex/client-runtime";

export function issuePlaceKey(place: IssuePlace) {
  switch (place.kind) {
    case "all":
      return "all";
    case "agent":
      return place.activity;
    case "workspace":
      return `workspace-${place.workspaceId}`;
  }
}
