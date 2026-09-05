import { Globe } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DropdownMenuCheckboxItem } from "@/components/ui";

export function WebSearchMenuItem() {
  const { t } = useTranslation("chat");
  return (
    <DropdownMenuCheckboxItem
      checked={false}
      disabled
      title={t("webSearch.unavailable", {
        defaultValue: "Web search is temporarily unavailable",
      })}
    >
      <Globe className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">
        {t("webSearch.label", { defaultValue: "Web search" })}
      </span>
    </DropdownMenuCheckboxItem>
  );
}
