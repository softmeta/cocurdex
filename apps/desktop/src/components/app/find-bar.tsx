import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { type Ref, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { IconButton } from "@/components/ui/icon-button";
import { Text } from "@/components/ui/text";

interface AppFindBarProps {
  query: string;
  matches?: { current: number; total: number };
  inputRef?: Ref<HTMLInputElement>;
  onQueryChange(query: string): void;
  onNext(): void;
  onPrevious(): void;
  onClose(): void;
}

export function AppFindBar({
  query,
  matches,
  inputRef,
  onQueryChange,
  onNext,
  onPrevious,
  onClose,
}: AppFindBarProps) {
  const { t } = useTranslation("common");
  const attachInput = useCallback(
    (node: HTMLInputElement | null) => {
      node?.focus();
      node?.select();
      if (typeof inputRef === "function") inputRef(node);
      else if (inputRef) inputRef.current = node;
    },
    [inputRef],
  );
  const hasQuery = query.length > 0;
  const canStep = matches ? matches.total > 0 : hasQuery;
  let countLabel: string | null = null;
  if (hasQuery && matches) {
    countLabel =
      matches.total === 0
        ? t("find.noResults")
        : t("find.matches", {
            current: String(matches.current),
            total: String(matches.total),
          });
  }

  return (
    <search
      aria-label={t("find.label")}
      className="absolute inset-e-3 top-3 z-20 flex h-10 w-80 max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-card bg-popover ps-3 pe-1 text-popover-foreground shadow-menu ring-1 ring-menu-ring"
    >
      <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <input
        ref={attachInput}
        type="text"
        aria-label={t("find.placeholder")}
        placeholder={t("find.placeholder")}
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (event.shiftKey) onPrevious();
            else onNext();
          } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }
        }}
        className="h-full min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-muted-foreground"
      />
      {countLabel ? (
        <Text
          size="meta"
          tone="muted"
          className="shrink-0 px-1 tabular-nums"
          aria-live="polite"
        >
          {countLabel}
        </Text>
      ) : null}
      <IconButton
        size="sm"
        aria-label={t("find.previous")}
        disabled={!canStep}
        onClick={onPrevious}
      >
        <ChevronUp className="size-4" />
      </IconButton>
      <IconButton
        size="sm"
        aria-label={t("find.next")}
        disabled={!canStep}
        onClick={onNext}
      >
        <ChevronDown className="size-4" />
      </IconButton>
      <IconButton size="sm" aria-label={t("find.close")} onClick={onClose}>
        <X className="size-4" />
      </IconButton>
    </search>
  );
}
