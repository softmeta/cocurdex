import {
  DECK_THEME_IDS,
  type DeckContent,
  type DeckThemeId,
  type Slide,
} from "@cocurdex/shared";
import { Palette } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/ui";
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { ToolbarMenu } from "./deck-edit-menus";
import { SlideCanvas } from "./slide-canvas";

function sampleCover(title: string): Slide {
  return {
    id: "theme-preview",
    layout: "cover",
    slots: {
      title: { kind: "text", paragraphs: [{ runs: [{ text: title }] }] },
    },
    elements: [],
    notes: "",
  };
}

export function ThemeMenu({
  content,
  onChange,
}: {
  content: DeckContent;
  onChange: (theme: DeckThemeId) => void;
}) {
  const { t } = useTranslation("decks");
  const hintId = useId();
  const preview = content.slides[0] ?? sampleCover(t("themes.sample"));
  const previewContent = { ...content, slides: [preview] };
  return (
    <ToolbarMenu
      label={t("actions.theme")}
      icon={<Palette className="size-3.5" />}
    >
      <DropdownMenuRadioGroup
        value={content.theme}
        onValueChange={(value: DeckThemeId) => onChange(value)}
      >
        {DECK_THEME_IDS.map((id) => (
          <DropdownMenuRadioItem
            key={id}
            value={id}
            aria-label={t(`themes.${id}`)}
            aria-describedby={`${hintId}-${id}`}
            className="gap-2.5"
          >
            <span aria-hidden className="w-20 shrink-0">
              <SlideCanvas
                slide={preview}
                content={{ ...previewContent, theme: id }}
                className="rounded-dense ring-1 ring-foreground/10"
              />
            </span>
            <span className="flex min-w-0 flex-col">
              <span>{t(`themes.${id}`)}</span>
              <Text id={`${hintId}-${id}`} size="meta" tone="muted" truncate>
                {t(`themeHints.${id}`)}
              </Text>
            </span>
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </ToolbarMenu>
  );
}
