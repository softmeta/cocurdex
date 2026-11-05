import { useSetAtom } from "jotai";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useResolvedShortcutLabel } from "@/features/shortcuts";
import { TitlebarIconButton } from "../titlebar-icon-button";
import { searchPaletteOpenAtom } from "./search-palette-store";

export function SearchPaletteButton() {
  const { t } = useTranslation("search");
  const openSearchPalette = useSetAtom(searchPaletteOpenAtom);
  const shortcut = useResolvedShortcutLabel("fileSearch");
  const label = t("openSearch");

  return (
    <TitlebarIconButton
      aria-label={label}
      cursor="default"
      onClick={() => openSearchPalette(true)}
      tooltip={shortcut ? `${label} (${shortcut})` : label}
    >
      <Search className="size-3.5" />
    </TitlebarIconButton>
  );
}
