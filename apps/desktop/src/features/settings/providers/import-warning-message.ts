import type { ProviderImportWarning } from "@cocurdex/shared";
import type { TFunction } from "i18next";

export function providerImportWarningMessage(
  t: TFunction<"settings">,
  warning: ProviderImportWarning,
): string {
  const options = { id: warning.providerId };
  const messageByCode = {
    authHeaderNoKey: t(
      "providers.importJson.warnings.authHeaderNoKey",
      options,
    ),
    commandApiKey: t("providers.importJson.warnings.commandApiKey", options),
    envApiKey: t("providers.importJson.warnings.envApiKey", options),
    oauthIgnored: t("providers.importJson.warnings.oauthIgnored", options),
  } as const;
  return messageByCode[warning.code];
}
