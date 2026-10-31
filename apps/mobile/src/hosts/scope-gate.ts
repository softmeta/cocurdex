import type { SavedHost } from "@cocurdex/client-runtime";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";

export type GatedScope = "execute" | "interact";

export function useScopeGate(host: SavedHost | null) {
  const { t } = useTranslation("hosts");
  const scopeTitles: Record<GatedScope, string> = {
    execute: t("scope.execute"),
    interact: t("scope.interact"),
  };
  return (scope: GatedScope, action: () => void) => () => {
    if (!host || host.scopes.includes(scope)) {
      action();
      return;
    }
    Alert.alert(
      t("scope.missingTitle"),
      t("scope.missingMessage", {
        scope: scopeTitles[scope],
        host: host.name,
      }),
      [{ text: t("scope.ok") }],
    );
  };
}
