import { forwardRef, useImperativeHandle, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/ui";
import { cn } from "@/lib";
import type { SlashCommandItem } from "./slash-command-items";

export interface SlashCommandMenuHandle {
  // Returns true if the key was handled (so Suggestion swallows it).
  onKeyDown: (event: KeyboardEvent) => boolean;
}

interface SlashCommandMenuProps {
  items: SlashCommandItem[];
  onSelect: (item: SlashCommandItem) => void;
}

// Floating list rendered by the Suggestion plugin. Owns arrow-key navigation
// and Enter selection; positioning is handled by the caller via Floating UI.
export const SlashCommandMenu = forwardRef<
  SlashCommandMenuHandle,
  SlashCommandMenuProps
>(({ items, onSelect }, ref) => {
  const { t } = useTranslation("notes");
  const [selected, setSelected] = useState(0);
  // Clamp so a shrinking filtered set (as the user keeps typing) never leaves
  // the highlight out of range — avoids a reset effect that depends on `items`.
  const activeIndex = items.length > 0 ? selected % items.length : 0;

  useImperativeHandle(ref, () => ({
    onKeyDown: (event) => {
      if (items.length === 0) {
        return false;
      }
      if (event.key === "ArrowDown") {
        setSelected((current) => (current + 1) % items.length);
        return true;
      }
      if (event.key === "ArrowUp") {
        setSelected((current) => (current + items.length - 1) % items.length);
        return true;
      }
      if (event.key === "Enter") {
        const item = items[activeIndex];
        if (item) {
          onSelect(item);
        }
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) {
    return (
      <div className="min-w-52 rounded-overlay border border-editor-border bg-popover p-2 shadow-md">
        <Text size="xs" tone="muted">
          {t("slash.empty")}
        </Text>
      </div>
    );
  }

  return (
    <div className="min-w-52 rounded-overlay border border-editor-border bg-popover p-1 shadow-md">
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <button
            type="button"
            key={item.key}
            className={cn(
              "flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-start",
              index === activeIndex
                ? "bg-editor-tab-active-bg"
                : "hover:bg-editor-tab-hover-bg",
            )}
            onPointerEnter={() => setSelected(index)}
            onClick={() => onSelect(item)}
          >
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <Text size="xs">{t(`slash.items.${item.key}`)}</Text>
          </button>
        );
      })}
    </div>
  );
});

SlashCommandMenu.displayName = "SlashCommandMenu";
