import type { MessageOrigin } from "@cocurdex/shared";
import type { TFunction } from "i18next";

export function messageOriginLabel(
  t: TFunction<"agent">,
  origin: MessageOrigin,
) {
  if (origin.kind === "routine") {
    return t("peerMessage.fromRoutine", { name: origin.routineName });
  }
  if (origin.kind === "brief") {
    return t("peerMessage.fromBrief");
  }
  if (origin.kind === "scriptRun") {
    return t("peerMessage.fromScriptRun", { name: origin.runName });
  }
  return t("peerMessage.from", { title: origin.sessionTitle });
}
