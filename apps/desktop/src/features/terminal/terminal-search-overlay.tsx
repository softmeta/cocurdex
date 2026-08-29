import { ArrowDown, ArrowUp, X } from "lucide-react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  TITLEBAR_ICON_GLYPH_CLASS,
  TitlebarIconButton,
} from "@/app/layout/titlebar-icon-button";
import { Input } from "@/components/ui";
import { cn } from "@/lib";
import { clearTerminalSearch, searchInTerminal } from "./terminal-registry";

interface TerminalSearchOverlayProps {
  terminalId: string;
  query: string;
  onQueryChange: (query: string) => void;
  onClose: () => void;
}

// Floating search bar wired to xterm's SearchAddon. Lives in the panel layer
// so it can use React state for the input + i18n; the registry just emits an
// "open" signal on Cmd+F.
export function TerminalSearchOverlay({
  terminalId,
  query,
  onQueryChange,
  onClose,
}: TerminalSearchOverlayProps) {
  const { t } = useTranslation("editor");
  const focusInput = useCallback((node: HTMLInputElement | null) => {
    node?.focus();
    node?.select();
  }, []);

  const runSearch = (direction: "next" | "previous") => {
    searchInTerminal(terminalId, query, direction);
  };

  const handleClose = () => {
    clearTerminalSearch(terminalId);
    onClose();
  };

  return (
    <div
      className={cn(
        "absolute top-3 right-3 z-10 flex items-center gap-1 rounded-control border border-editor-border bg-editor-pane px-2 py-1 shadow-sm",
      )}
      data-testid="terminal-search-overlay"
    >
      <Input
        aria-label={t("terminal.searchPlaceholder")}
        className="h-7 w-48"
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            runSearch(e.shiftKey ? "previous" : "next");
          } else if (e.key === "Escape") {
            e.preventDefault();
            handleClose();
          }
        }}
        placeholder={t("terminal.searchPlaceholder")}
        ref={focusInput}
        value={query}
      />
      <TitlebarIconButton
        aria-label={t("terminal.searchPrevious")}
        onClick={() => runSearch("previous")}
      >
        <ArrowUp className={TITLEBAR_ICON_GLYPH_CLASS} />
      </TitlebarIconButton>
      <TitlebarIconButton
        aria-label={t("terminal.searchNext")}
        onClick={() => runSearch("next")}
      >
        <ArrowDown className={TITLEBAR_ICON_GLYPH_CLASS} />
      </TitlebarIconButton>
      <TitlebarIconButton
        aria-label={t("terminal.searchClose")}
        onClick={handleClose}
      >
        <X className={TITLEBAR_ICON_GLYPH_CLASS} />
      </TitlebarIconButton>
    </div>
  );
}
