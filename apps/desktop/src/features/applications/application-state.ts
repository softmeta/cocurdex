import type { ApplicationConnection } from "@cocurdex/shared";
import type { TFunction } from "i18next";
import type { AppStatusTone } from "@/components";

export function applicationStateLabel(
  connection: ApplicationConnection,
  t: TFunction<"personal">,
): string {
  if (!connection.enabled)
    return t("apps.disabled", { defaultValue: "Disabled" });
  if (!connection.status)
    return t("apps.notChecked", { defaultValue: "Not checked" });
  if (connection.status.state === "connected")
    return t("apps.connected", { defaultValue: "Connected" });
  if (connection.status.state === "needs-auth")
    return t("apps.needsAuth", { defaultValue: "Authorization required" });
  return t("apps.failed", { defaultValue: "Connection failed" });
}

export function isApplicationConnected(connection: ApplicationConnection) {
  return connection.status?.state === "connected";
}

export function applicationStateTone(
  connection: ApplicationConnection,
): AppStatusTone {
  if (!connection.enabled) return "muted";
  if (!connection.status) return "faint";
  if (connection.status.state === "connected") return "success";
  if (connection.status.state === "needs-auth") return "attention";
  return "danger";
}

export function applicationAccessLabel(
  connection: ApplicationConnection,
  t: TFunction<"personal">,
): string {
  if (connection.allPersonas) return t("apps.allAssistants");
  if (connection.personaIds.length === 0) return t("apps.noAssistants");
  return t("apps.assistantCount", { count: connection.personaIds.length });
}
