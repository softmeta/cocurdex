import { SLIDE_LAYOUT_IDS, type SlideLayoutId } from "@cocurdex/shared";
import { LayoutTemplate, Plus } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { TitlebarIconButton } from "@/app/layout/titlebar-icon-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ToolbarMenu({
  label,
  icon,
  disabled,
  children,
}: {
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        disabled={disabled}
        render={
          <TitlebarIconButton
            active={open}
            aria-expanded={open}
            aria-label={label}
            disabled={disabled}
          >
            {icon}
          </TitlebarIconButton>
        }
      />
      <DropdownMenuContent align="end" className="min-w-44">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function useLayoutLabel() {
  const { t } = useTranslation("decks");
  return (layout: SlideLayoutId) => t(`layouts.${layout}`);
}

export function AddSlideMenu({
  onAdd,
}: {
  onAdd: (layout: SlideLayoutId) => void;
}) {
  const { t } = useTranslation("decks");
  const layoutLabel = useLayoutLabel();
  return (
    <ToolbarMenu
      label={t("actions.addSlide")}
      icon={<Plus className="size-3.5" />}
    >
      {SLIDE_LAYOUT_IDS.map((layout) => (
        <DropdownMenuItem key={layout} onClick={() => onAdd(layout)}>
          {layoutLabel(layout)}
        </DropdownMenuItem>
      ))}
    </ToolbarMenu>
  );
}

export function LayoutMenu({
  layout,
  disabled,
  onChange,
}: {
  layout: SlideLayoutId | null;
  disabled: boolean;
  onChange: (layout: SlideLayoutId) => void;
}) {
  const { t } = useTranslation("decks");
  const layoutLabel = useLayoutLabel();
  return (
    <ToolbarMenu
      label={t("actions.layout")}
      icon={<LayoutTemplate className="size-3.5" />}
      disabled={disabled}
    >
      <DropdownMenuRadioGroup
        value={layout ?? ""}
        onValueChange={(value: SlideLayoutId) => onChange(value)}
      >
        {SLIDE_LAYOUT_IDS.map((id) => (
          <DropdownMenuRadioItem key={id} value={id}>
            {layoutLabel(id)}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </ToolbarMenu>
  );
}
