import { forwardRef, useImperativeHandle, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/ui";
import { cn } from "@/lib";
import type { SlashCommandItem } from "./slash-command-items";

function scrollIntoViewIfNeeded(node: HTMLButtonElement | null) {
  node?.scrollIntoView({ block: "nearest" });
}

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
      <div className="min-w-48 rounded-control bg-popover p-1 text-popover-foreground shadow-lg ring-1 shadow-black/20 ring-foreground/10">
        <Text tone="muted" className="block px-1.5 py-1">
          {t("slash.empty")}
        </Text>
      </div>
    );
  }

  return (
    <div
      role="listbox"
      aria-label={t("slash.label")}
      className="flex max-h-[min(20rem,var(--slash-menu-available-height,20rem))] min-w-48 flex-col overflow-y-auto rounded-control bg-popover p-1 text-popover-foreground shadow-lg ring-1 shadow-black/20 ring-foreground/10"
    >
      {items.map((item, index) => {
        const Icon = item.icon;
        const highlighted = index === activeIndex;
        return (
          <button
            type="button"
            role="option"
            aria-selected={highlighted}
            key={item.key}
            ref={highlighted ? scrollIntoViewIfNeeded : undefined}
            className={cn(
              "flex w-full shrink-0 cursor-default items-center gap-1.5 rounded-control px-1.5 py-1 text-start outline-hidden",
              highlighted && "bg-accent text-accent-foreground",
            )}
            onMouseDown={(event) => event.preventDefault()}
            onPointerEnter={() => setSelected(index)}
            onClick={() => onSelect(item)}
          >
            <Icon className="size-3.5 shrink-0 text-muted-foreground" />
            <Text className="min-w-0 flex-1" truncate>
              {t(`slash.items.${item.key}`)}
            </Text>
          </button>
        );
      })}
    </div>
  );
});

SlashCommandMenu.displayName = "SlashCommandMenu";
