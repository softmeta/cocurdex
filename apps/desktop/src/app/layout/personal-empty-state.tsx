import { Contact } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/ui";

export function PersonalEmptyState() {
  const { t } = useTranslation("personal");
  return (
    <div className="flex h-full items-center justify-center">
      <EmptyState
        description={t("empty.description")}
        icon={<Contact />}
        title={t("empty.title")}
      />
    </div>
  );
}
