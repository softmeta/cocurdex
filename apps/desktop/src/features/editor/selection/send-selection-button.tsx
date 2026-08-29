import { ArrowUpLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui";

interface SendSelectionButtonProps {
  disabled?: boolean;
  onClick(): void;
}

export function SendSelectionButton({
  disabled = false,
  onClick,
}: SendSelectionButtonProps) {
  const { t } = useTranslation("editor");

  return (
    <Button
      disabled={disabled}
      variant="outline"
      size="xs"
      type="button"
      onClick={onClick}
      className="border-editor-border bg-sidebar-surface text-xs text-editor-fg-subtle hover:bg-editor-tab-active-bg hover:text-editor-fg"
    >
      <ArrowUpLeft className="mr-1 size-3" />
      {t("actions.addToChat")}
    </Button>
  );
}
