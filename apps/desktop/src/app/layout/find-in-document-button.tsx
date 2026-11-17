import { TextSearch } from "lucide-react";
import { useTranslation } from "react-i18next";
import { requestFind } from "@/components/app";
import { formatShortcutLabel } from "@/lib/shortcuts";
import { TitlebarIconButton } from "./titlebar-icon-button";

const FIND_SHORTCUT = { key: "f", primary: true };

export function FindInDocumentButton({ className }: { className?: string }) {
  const { t } = useTranslation("common");
  const label = t("find.label");
  return (
    <TitlebarIconButton
      aria-label={label}
      tooltip={`${label} (${formatShortcutLabel(FIND_SHORTCUT)})`}
      className={className}
      onClick={(event) => requestFind(event.currentTarget)}
    >
      <TextSearch className="size-3.5" />
    </TitlebarIconButton>
  );
}
