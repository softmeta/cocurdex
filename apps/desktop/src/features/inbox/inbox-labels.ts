import type { InboxItemKind } from "@cocurdex/shared";
import type { TFunction } from "i18next";

export function inboxKindLabel(t: TFunction<"personal">, kind: InboxItemKind) {
  switch (kind) {
    case "approval":
      return t("inbox.kind.approval");
    case "question":
      return t("inbox.kind.question");
    case "plan":
      return t("inbox.kind.plan");
    case "failed":
      return t("inbox.kind.failed");
    case "completed":
      return t("inbox.kind.completed");
    case "routine-failed":
      return t("inbox.kind.routineFailed");
    case "routine-needs-you":
      return t("inbox.kind.routineNeedsYou");
    case "routine-paused":
      return t("inbox.kind.routinePaused");
    case "routine-result":
      return t("inbox.kind.routineResult");
  }
}
