import type { TFunction } from "i18next";
import type { AdapterStatusKind } from "./adapter-status";

export function agentSelectStatusLabel(
  kind: AdapterStatusKind | undefined,
  t: TFunction<"sessions">,
) {
  if (kind === "detecting") {
    return t("composer.agentStatus.detecting");
  }
  if (kind === "missing") {
    return t("composer.agentStatus.notInstalled");
  }
  if (kind === "outdated") {
    return t("composer.agentStatus.updateRequired");
  }
  if (kind === "error") {
    return t("composer.agentStatus.error");
  }
  return null;
}
