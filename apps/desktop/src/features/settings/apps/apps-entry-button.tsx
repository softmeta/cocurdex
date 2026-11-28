import { Plug } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppRailIconButton } from "@/components/app";
import { hostScopes } from "@/lib";
import { openSettings } from "../settings-navigation";
import { permittedConnectionSections } from "../settings-sections";

export function AppsEntryButton() {
  const { t } = useTranslation("settings");
  if (!permittedConnectionSections(hostScopes()).includes("apps")) return null;
  return (
    <AppRailIconButton
      aria-label={t("sections.apps")}
      onClick={() => openSettings("apps")}
    >
      <Plug className="size-4" />
    </AppRailIconButton>
  );
}
