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
  if (origin.kind === "greeting") return null;
  if (origin.kind === "scriptRun") {
    return t("peerMessage.fromScriptRun", { name: origin.runName });
  }
  if (origin.kind === "delegation") {
    return t("delegation.from", { title: origin.sessionTitle });
  }
  if (origin.kind === "remoteHost") {
    return t("peerMessage.fromRemote", {
      sender: origin.senderName,
      host: origin.hostName,
    });
  }
  return t("peerMessage.from", { title: origin.sessionTitle });
}
