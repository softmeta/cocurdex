import { ArrowUpLeft, NotebookPen, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Text } from "@/components/ui";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  PDF_HIGHLIGHT_COLORS,
  type PdfHighlightColor,
} from "./pdf-annotations";
import { PDF_HIGHLIGHT_SWATCH_CSS } from "./pdf-highlight-layer";

interface PdfTextSelectionToolbarProps {
  mode: "text";
  canHighlight: boolean;
  // Last used color — shown with a stronger ring so the next pick is obvious.
  preferredColor: PdfHighlightColor;
  onAddToChat(): void;
  onAddToNote(): void;
  onHighlight(color: PdfHighlightColor): void;
}

interface PdfHighlightSelectionToolbarProps {
  mode: "highlight";
  onRemove(): void;
}

export type PdfSelectionToolbarProps =
  | PdfTextSelectionToolbarProps
  | PdfHighlightSelectionToolbarProps;

export function PdfSelectionToolbar(props: PdfSelectionToolbarProps) {
  const { t } = useTranslation("editor");

  if (props.mode === "highlight") {
    return (
      <div
        data-pdf-selection-toolbar
        className="flex items-center gap-0.5 rounded-overlay border border-editor-border bg-popover p-0.5 shadow-md"
      >
        <Button
          variant="ghost"
          size="xs"
          type="button"
          onClick={props.onRemove}
        >
          <Trash2 className="size-3.5" />
          <Text size="meta" as="span">
            {t("pdf.removeHighlight")}
          </Text>
        </Button>
      </div>
    );
  }

  const {
    canHighlight,
    preferredColor,
    onAddToChat,
    onAddToNote,
    onHighlight,
  } = props;

  return (
    <div
      data-pdf-selection-toolbar
      className="flex items-center gap-0.5 rounded-overlay border border-editor-border bg-popover p-0.5 shadow-md"
    >
      <Button variant="ghost" size="xs" type="button" onClick={onAddToChat}>
        <ArrowUpLeft className="size-3.5" />
        <Text size="meta" as="span">
          {t("actions.addToChat")}
        </Text>
      </Button>
      <Button variant="ghost" size="xs" type="button" onClick={onAddToNote}>
        <NotebookPen className="size-3.5" />
        <Text size="meta" as="span">
          {t("pdf.addToNote")}
        </Text>
      </Button>
      {canHighlight ? (
        <fieldset className="m-0 flex items-center gap-0.5 border-0 p-0 ps-0.5">
          <legend className="sr-only">{t("pdf.highlightColorGroup")}</legend>
          {PDF_HIGHLIGHT_COLORS.map((color) => {
            const isPreferred = color === preferredColor;
            return (
              <Tooltip key={color}>
                <TooltipTrigger
                  aria-label={t("pdf.highlightWithColor", {
                    color: t(`pdf.highlightColor.${color}`),
                  })}
                  aria-pressed={isPreferred}
                  className={cn(
                    "inline-flex size-6 items-center justify-center rounded-control text-editor-fg-subtle hover:bg-editor-tab-hover-bg hover:text-editor-fg",
                    isPreferred && "bg-editor-tab-active-bg text-editor-fg",
                  )}
                  onClick={() => onHighlight(color)}
                  type="button"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "size-3.5 rounded-full border border-black/15 shadow-sm",
                      isPreferred &&
                        "ring-2 ring-foreground/40 ring-offset-1 ring-offset-popover",
                    )}
                    style={{ backgroundColor: PDF_HIGHLIGHT_SWATCH_CSS[color] }}
                  />
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={6}>
                  {t("pdf.highlightWithColor", {
                    color: t(`pdf.highlightColor.${color}`),
                  })}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </fieldset>
      ) : null}
    </div>
  );
}
