import type { ComboboxRootHighlightEventDetails } from "@base-ui/react/combobox";
import type {
  ComponentProps,
  CSSProperties,
  ReactElement,
  ReactNode,
} from "react";
import { useMemo, useRef, useState } from "react";
import { FLYOUT_GAP, flyoutAnchor } from "@/components/ui/_flyout";
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import { TOOLTIP_DELAY_MS, Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib";
import {
  type AppDropdownTriggerAppearance,
  AppDropdownTriggerButton,
  AppDropdownTriggerLabel,
} from "./dropdown";
import { AppPreviewCardTooltipContent } from "./preview-card-tooltip";

/** One row in a searchable single-select list. */
export interface AppSearchableSelectOption {
  value: string;
  /** Plain text for filtering, a11y, and default display. */
  label: string;
  /** Extra text included in built-in filtering (ids, aliases). */
  keywords?: string;
  icon?: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
  preview?: ReactNode;
  disabled?: boolean;
  /** Optional style on the label span (e.g. font-family previews). */
  labelStyle?: CSSProperties;
  /** Stable group key; options with the same group are rendered together. */
  group?: string;
  /** Display heading for `group` (first option in the group wins). */
  groupLabel?: string;
}

export interface AppSearchableSelectProps {
  value: string;
  onValueChange(value: string): void;
  options: readonly AppSearchableSelectOption[];
  emptyText?: ReactNode;
  searchPlaceholder?: string;
  /** Shown on the trigger; defaults to the selected option label. */
  triggerLabel?: ReactNode;
  triggerAriaLabel?: string;
  appearance?: AppDropdownTriggerAppearance;
  disabled?: boolean;
  triggerClassName?: string;
  showChevron?: boolean;
  contentClassName?: string;
  align?: "start" | "center" | "end";
  side?: ComponentProps<typeof ComboboxContent>["side"];
  /**
   * Custom trigger element for Base UI `render` composition
   * (e.g. a pre-styled Button). Replaces the default pill trigger.
   */
  trigger?: ReactElement;
  /**
   * Extra content below the filtered list (still inside the popup).
   * Use for secondary actions or multi-axis runtime rows that should not
   * participate in Combobox filtering/selection.
   */
  footer?: ReactNode;
}

type SelectItem = AppSearchableSelectOption;

type HighlightedPreview = {
  content: ReactNode;
  anchor: Element;
};

function highlightedItem(popup: HTMLElement | null): Element | null {
  return popup?.querySelector("[data-highlighted]") ?? null;
}

type SelectGroup = {
  value: string;
  items: SelectItem[];
};

function itemToStringLabel(item: SelectItem | null | undefined): string {
  return item?.label ?? "";
}

function itemToStringValue(item: SelectItem | null | undefined): string {
  if (!item) return "";
  return [item.label, item.value, item.keywords].filter(Boolean).join(" ");
}

function AppSearchableSelectItem({ item }: { item: SelectItem }) {
  const multiLine = Boolean(item.description);
  return (
    <ComboboxItem
      value={item}
      disabled={item.disabled}
      className={multiLine ? "items-start py-1.5" : undefined}
    >
      {item.icon ? (
        <span className={cn("shrink-0", multiLine && "mt-0.5")}>
          {item.icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate",
            item.description ? "font-medium" : undefined,
          )}
          style={item.labelStyle}
          title={item.label}
        >
          {item.label}
        </span>
        {item.description ? (
          <span className="block text-meta leading-4 text-muted-foreground">
            {item.description}
          </span>
        ) : null}
      </span>
      {item.trailing}
    </ComboboxItem>
  );
}

/**
 * Canonical searchable single-select for the whole app.
 *
 * Built on official shadcn Base UI Combobox (`@/components/ui/combobox`).
 * All "trigger + search + pick one" UIs must use this component (or extend it),
 * not hand-rolled Popover/Command stacks. Short unsearchable lists use
 * AppSelect (shadcn Select) instead.
 */
export function AppSearchableSelect({
  value,
  onValueChange,
  options,
  emptyText,
  searchPlaceholder,
  triggerLabel,
  triggerAriaLabel,
  appearance = "outline",
  disabled = false,
  triggerClassName,
  showChevron,
  contentClassName,
  align = "start",
  side,
  trigger,
  footer,
}: AppSearchableSelectProps) {
  const selected = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );

  // Base UI Group shape: { value: heading, items: T[] }
  const items = useMemo((): SelectItem[] | SelectGroup[] => {
    const hasGroups = options.some((option) => option.group);
    if (!hasGroups) return [...options];

    const order: string[] = [];
    const map = new Map<string, SelectGroup>();
    for (const option of options) {
      const key = option.group ?? "";
      const heading = option.groupLabel ?? option.group ?? "";
      let bucket = map.get(key);
      if (!bucket) {
        bucket = { value: heading, items: [] };
        map.set(key, bucket);
        order.push(key);
      }
      bucket.items.push(option);
    }
    return order.flatMap((key) => {
      const group = map.get(key);
      return group ? [group] : [];
    });
  }, [options]);

  const popupRef = useRef<HTMLDivElement>(null);
  const previewTimerRef = useRef<number | null>(null);
  const previewWarmRef = useRef(false);
  const [preview, setPreview] = useState<HighlightedPreview | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const cancelPendingPreview = () => {
    if (previewTimerRef.current !== null) {
      window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
  };

  const openPreview = (content: ReactNode) => {
    requestAnimationFrame(() => {
      const anchor = highlightedItem(popupRef.current);
      if (!anchor) return;
      previewWarmRef.current = true;
      setPreview({ content, anchor });
      setPreviewOpen(true);
    });
  };

  const showPreview = (
    item: SelectItem | undefined,
    details: ComboboxRootHighlightEventDetails,
  ) => {
    cancelPendingPreview();
    const content = item?.preview;
    if (!content || details.reason === "none") {
      setPreviewOpen(false);
      return;
    }
    if (details.reason === "keyboard" || previewWarmRef.current) {
      openPreview(content);
      return;
    }
    setPreviewOpen(false);
    previewTimerRef.current = window.setTimeout(() => {
      previewTimerRef.current = null;
      openPreview(content);
    }, TOOLTIP_DELAY_MS);
  };

  const resetPreview = () => {
    cancelPendingPreview();
    previewWarmRef.current = false;
    setPreviewOpen(false);
  };

  const resolvedTriggerLabel =
    triggerLabel ?? selected?.label ?? searchPlaceholder ?? "";

  return (
    <Combobox
      disabled={disabled}
      items={items}
      value={selected}
      itemToStringLabel={itemToStringLabel}
      itemToStringValue={itemToStringValue}
      onValueChange={(next) => {
        // null/undefined when cleared; map back to our string value API.
        onValueChange(next?.value ?? "");
      }}
      onItemHighlighted={showPreview}
      onOpenChange={(open) => {
        if (!open) resetPreview();
      }}
    >
      <ComboboxTrigger
        aria-label={triggerAriaLabel}
        showChevron={showChevron}
        disabled={disabled}
        render={
          trigger ?? (
            <AppDropdownTriggerButton
              appearance={appearance}
              className={triggerClassName}
              disabled={disabled}
              // ComboboxTrigger already paints the chevron.
              showChevron={false}
              title={
                typeof resolvedTriggerLabel === "string"
                  ? resolvedTriggerLabel
                  : undefined
              }
            />
          )
        }
      >
        {typeof resolvedTriggerLabel === "string" ||
        typeof resolvedTriggerLabel === "number" ? (
          <AppDropdownTriggerLabel>
            {resolvedTriggerLabel}
          </AppDropdownTriggerLabel>
        ) : (
          resolvedTriggerLabel
        )}
      </ComboboxTrigger>
      <ComboboxContent
        ref={popupRef}
        align={align}
        className={contentClassName}
        side={side}
      >
        <ComboboxInput
          disabled={disabled}
          placeholder={searchPlaceholder}
          showTrigger={false}
        />
        <ComboboxEmpty>{emptyText}</ComboboxEmpty>
        <ComboboxList className="grid grid-cols-1">
          {(entry: SelectItem | SelectGroup) => {
            if (entry && typeof entry === "object" && "items" in entry) {
              const group = entry as SelectGroup;
              return (
                <ComboboxGroup
                  key={group.value || "default"}
                  className="grid grid-cols-1"
                  items={group.items}
                >
                  {group.value ? (
                    <ComboboxLabel>{group.value}</ComboboxLabel>
                  ) : null}
                  <ComboboxCollection>
                    {(item: SelectItem) => (
                      <AppSearchableSelectItem key={item.value} item={item} />
                    )}
                  </ComboboxCollection>
                </ComboboxGroup>
              );
            }
            const item = entry as SelectItem;
            return <AppSearchableSelectItem key={item.value} item={item} />;
          }}
        </ComboboxList>
        {footer}
      </ComboboxContent>
      <Tooltip open={previewOpen && preview !== null}>
        <AppPreviewCardTooltipContent
          anchor={preview ? flyoutAnchor(preview.anchor) : undefined}
          sideOffset={FLYOUT_GAP}
        >
          {preview?.content}
        </AppPreviewCardTooltipContent>
      </Tooltip>
    </Combobox>
  );
}
