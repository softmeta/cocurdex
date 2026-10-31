import {
  type DeckTheme,
  deckTheme,
  type ResolvedImage,
  type ResolvedItem,
  type ResolvedText,
  resolveEmptySlots,
  resolveSlide,
  TEXT_INSET,
} from "@cocurdex/deck";
import type {
  DeckContent,
  DeckTextTarget,
  Slide,
  TextParagraph,
} from "@cocurdex/shared";
import { ImageUp, Trash2 } from "lucide-react";
import { type KeyboardEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui";
import { cn } from "@/lib";
import { canPickLocalFiles } from "../local-file-picker";
import { SlideCanvas, slideItemKey } from "../slide-canvas";
import {
  fontStack,
  frameStyle,
  slideLength,
  themeColor,
} from "../slide-geometry";
import { SlideTextEditor } from "./slide-text-editor";

const VALIGN_JUSTIFY = {
  top: "flex-start",
  middle: "center",
  bottom: "flex-end",
} as const;

function isText(item: ResolvedItem): item is ResolvedText {
  return item.kind === "text";
}

function isElementImage(
  item: ResolvedItem,
): item is ResolvedImage & { source: { kind: "element"; elementId: string } } {
  return item.kind === "image" && item.source.kind === "element";
}

const DELETE_KEYS = new Set(["Delete", "Backspace"]);

function ImageTarget({
  item,
  onReplace,
  onDelete,
}: {
  item: ResolvedImage;
  onReplace: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation("decks");
  const label = item.alt
    ? t("editor.imageNamed", { name: item.alt })
    : t("editor.image");
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          data-slide-target={slideItemKey(item)}
          className="absolute rounded-dense outline-none transition-shadow hover:shadow-[0_0_0_1px_color-mix(in_oklab,var(--primary)_55%,transparent),0_0_0_2px_rgb(255_255_255/0.4)] focus-visible:shadow-[0_0_0_1px_var(--primary),0_0_0_2px_rgb(255_255_255/0.7)]"
          style={frameStyle(item.frame)}
          onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
            if (!DELETE_KEYS.has(event.key)) return;
            event.preventDefault();
            onDelete();
          }}
        />
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-44">
        {canPickLocalFiles() ? (
          <ContextMenuItem onClick={onReplace}>
            <ImageUp className="size-3.5" />
            {t("imageMenu.replace")}
          </ContextMenuItem>
        ) : null}
        <ContextMenuItem variant="destructive" onClick={onDelete}>
          <Trash2 className="size-3.5" />
          {t("imageMenu.delete")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function TextTarget({
  item,
  theme,
  label,
  onEdit,
}: {
  item: ResolvedText;
  theme: DeckTheme;
  label: { edit: string; placeholder: string };
  onEdit: () => void;
}) {
  const isEmpty = item.paragraphs.every((paragraph) =>
    paragraph.runs.every((run) => run.text.trim() === ""),
  );
  return (
    <button
      type="button"
      aria-label={label.edit}
      data-slide-target={slideItemKey(item)}
      className={cn(
        "absolute flex cursor-text flex-col rounded-dense outline-none transition-shadow hover:shadow-[0_0_0_1px_color-mix(in_oklab,var(--primary)_55%,transparent),0_0_0_2px_rgb(255_255_255/0.4)] focus-visible:shadow-[0_0_0_1px_var(--primary),0_0_0_2px_rgb(255_255_255/0.7)]",
        isEmpty && "border border-current border-dashed",
      )}
      style={{
        ...frameStyle(item.frame),
        padding: slideLength(TEXT_INSET),
        justifyContent: VALIGN_JUSTIFY[item.valign],
        textAlign: item.align,
        color: themeColor(theme, item.color),
        fontFamily: fontStack(item.font),
        fontSize: slideLength(item.fontSize),
        fontWeight: item.bold ? 700 : 400,
        lineHeight: item.lineHeight,
        opacity: isEmpty ? 0.45 : undefined,
      }}
      onClick={onEdit}
    >
      {isEmpty ? label.placeholder : null}
    </button>
  );
}

function placeholderKey(item: ResolvedText) {
  if (item.source.kind !== "slot") return "editor.placeholders.text";
  if (item.source.slot === "title") return "editor.placeholders.title";
  if (item.source.slot === "subtitle") return "editor.placeholders.subtitle";
  return "editor.placeholders.text";
}

function useTargetLabels() {
  const { t } = useTranslation("decks");
  return (item: ResolvedText) => {
    const name =
      item.source.kind === "slot"
        ? t(`editor.slots.${item.source.slot}`)
        : t("editor.slots.textBox");
    return {
      edit: t("editor.edit", { name }),
      name,
      placeholder: t(placeholderKey(item)),
    };
  };
}

export function EditableSlide({
  slide,
  content,
  className,
  onEditText,
  onReplaceImage,
  onDeleteElement,
}: {
  slide: Slide;
  content: DeckContent;
  className?: string;
  onEditText: (
    target: DeckTextTarget,
    paragraphs: TextParagraph[],
  ) => Promise<void>;
  onReplaceImage: (elementId: string) => void;
  onDeleteElement: (elementId: string) => void;
}) {
  const labels = useTargetLabels();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const theme = deckTheme(content.theme);
  const layers: ResolvedItem[] = [
    ...resolveEmptySlots(slide, content),
    ...resolveSlide(slide, content).items,
  ];
  const editing = layers
    .filter(isText)
    .find((item) => slideItemKey(item) === editingKey);
  const stopEditing = () => setEditingKey(null);

  return (
    <SlideCanvas
      slide={slide}
      content={content}
      className={className}
      hiddenItemKey={editing ? editingKey : null}
    >
      {layers.map((item) => {
        const key = slideItemKey(item);
        if (isElementImage(item)) {
          return (
            <ImageTarget
              key={key}
              item={item}
              onReplace={() => onReplaceImage(item.source.elementId)}
              onDelete={() => onDeleteElement(item.source.elementId)}
            />
          );
        }
        if (!isText(item) || key === editingKey) return null;
        if (item.source.kind === "decoration") return null;
        return (
          <TextTarget
            key={key}
            item={item}
            theme={theme}
            label={labels(item)}
            onEdit={() => setEditingKey(key)}
          />
        );
      })}
      {editing ? (
        <SlideTextEditor
          key={editingKey}
          item={editing}
          theme={theme}
          label={labels(editing).name}
          placeholder={labels(editing).placeholder}
          onCancel={stopEditing}
          onCommit={(paragraphs) => {
            void onEditText(
              slideItemKey(editing) as DeckTextTarget,
              paragraphs,
            ).finally(stopEditing);
          }}
        />
      ) : null}
    </SlideCanvas>
  );
}
