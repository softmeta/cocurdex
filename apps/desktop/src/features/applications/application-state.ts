import type { ApplicationConnection } from "@cocurdex/shared";
import type { TFunction } from "i18next";

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
