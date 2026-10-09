import { useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { sessionListViewAtom } from "@/features/sessions/session-list-view";

export function SessionFilterEmpty({ className }: { className: string }) {
  const { t } = useTranslation("sessions");
  const setView = useSetAtom(sessionListViewAtom);

  return (
    <div className={className}>
      <span>{t("sidebar.view.noMatches")}</span>
      <button
        type="button"
        className="ms-2 text-sidebar-fg-muted underline-offset-2 hover:text-sidebar-fg hover:underline"
        onClick={() =>
          setView({ statuses: [], agents: [], environments: [], sources: [] })
        }
      >
        {t("sidebar.view.clearAllFilters")}
      </button>
    </div>
  );
}
