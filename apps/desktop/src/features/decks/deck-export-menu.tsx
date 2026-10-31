import type { DeckExportFormat } from "@cocurdex/shared";
import { Download, FileText, Presentation } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TitlebarIconButton } from "@/app/layout/titlebar-icon-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function DeckExportMenu({
  onExport,
}: {
  onExport: (format: DeckExportFormat) => void;
}) {
  const { t } = useTranslation("decks");
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <TitlebarIconButton
            active={open}
            aria-expanded={open}
            aria-label={t("actions.export")}
          >
            <Download className="size-3.5" />
          </TitlebarIconButton>
        }
      />
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuItem onClick={() => onExport("pptx")}>
          <Presentation className="size-3.5" />
          {t("actions.exportPptx")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onExport("pdf")}>
          <FileText className="size-3.5" />
          {t("actions.exportPdf")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
