import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui";
import { cn } from "@/lib";

export type SettingsPane = "list" | "detail";

export function SettingsMasterDetail({
  detail,
  list,
  pane,
  onBack,
}: {
  detail: ReactNode;
  list: ReactNode;
  pane: SettingsPane;
  onBack(): void;
}) {
  const { t } = useTranslation("settings");

  return (
    <div className="@container/master-detail flex min-h-0 min-w-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 gap-6">
        <div
          className={cn(
            "min-h-0 min-w-0 flex-1 flex-col @3xl/master-detail:w-72 @3xl/master-detail:flex-none",
            pane === "list" && "flex",
            pane === "detail" && "hidden @3xl/master-detail:flex",
          )}
          data-settings-pane="list"
        >
          {list}
        </div>
        <div
          className={cn(
            "min-h-0 min-w-0 flex-1 flex-col gap-3",
            pane === "detail" && "flex",
            pane === "list" && "hidden @3xl/master-detail:flex",
          )}
          data-settings-pane="detail"
        >
          <div className="flex shrink-0 @3xl/master-detail:hidden">
            <Button size="sm" type="button" variant="ghost" onClick={onBack}>
              <ChevronLeft className="size-3.5 rtl:-scale-x-100" />
              {t("masterDetail.back")}
            </Button>
          </div>
          {detail}
        </div>
      </div>
    </div>
  );
}
