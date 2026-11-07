import { Plug } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui";
import { hostScopes } from "@/lib";
import { openSettings } from "../settings-navigation";
import { permittedConnectionSections } from "../settings-sections";
import { ApplicationIcon } from "./application-icon";
import { useApplications } from "./application-queries";

function AppsEntry() {
  const { t } = useTranslation("settings");
  const { data } = useApplications();
  const addedIds = [
    ...new Set(
      (data ?? [])
        .filter((item) => item.enabled)
        .map((item) => item.applicationId),
    ),
  ];

  return (
    <Button
      className="h-6 gap-1.5 px-0.75 text-sidebar-fg-secondary hover:bg-sidebar-surface-hover hover:text-sidebar-fg"
      onClick={() => openSettings("apps")}
      size="sm"
      variant="ghost"
    >
      {addedIds.length ? (
        <span className="flex items-center gap-1">
          {addedIds.map((id) => (
            <ApplicationIcon applicationId={id} key={id} />
          ))}
        </span>
      ) : (
        <Plug className="size-3.5" />
      )}
      {t("sections.apps")}
    </Button>
  );
}

export function AppsEntryButton() {
  return permittedConnectionSections(hostScopes()).includes("apps") ? (
    <AppsEntry />
  ) : null;
}
