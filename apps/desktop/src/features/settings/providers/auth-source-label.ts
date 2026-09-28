import type { ProviderAuthState } from "@cocurdex/shared";
import type { TFunction } from "i18next";

export function providerAuthSourceLabel(
  t: TFunction<"settings">,
  auth: ProviderAuthState,
): string {
  if (auth.origin === "ambient" && auth.source) {
    return t("providers.auth.source.ambient", { source: auth.source });
  }
  if (auth.type === "oauth") {
    return t("providers.auth.source.oauth");
  }
  if (auth.origin === "stored") {
    return t("providers.auth.source.stored");
  }
  return t("providers.auth.connected");
}
