import type { MessageOrigin } from "@cocurdex/shared";
import type { TFunction } from "i18next";

export function messageOriginLabel(
  t: TFunction<"agent">,
  origin: MessageOrigin,
) {
  if (origin.kind === "scriptRun") {
    return t("peerMessage.fromScriptRun", { name: origin.runName });
  }
  return t("peerMessage.from", { title: origin.sessionTitle });
}
