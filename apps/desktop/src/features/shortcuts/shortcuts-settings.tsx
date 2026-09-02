import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { RotateCcw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button, EmptyState, Input } from "@/components/ui";
import type { ShortcutCombo } from "@/lib";
import { cn } from "@/lib/utils";

import {
  SHORTCUT_CATALOG,
  type ShortcutCategory,
  type ShortcutDefinition,
  type ShortcutId,
  shortcutCategories,
} from "./shortcut-catalog";
import { ShortcutRecorderButton } from "./shortcut-recorder-button";
import {
  findShortcutConflicts,
  hasAnyShortcutOverrides,
  isShortcutCustomized,
  resolveShortcutCombo,
} from "./shortcut-resolve";
import {
  clearShortcutOverride,
  resetAllShortcutOverrides,
  setShortcutOverride,
  shortcutOverridesAtom,
  shortcutRecordingIdAtom,
} from "./shortcut-store";

interface ShortcutListItem {
  definition: ShortcutDefinition;
  title: string;
  description: string;
  categoryLabel: string;
}

export function ShortcutsSettingsPanel() {
  const { t } = useTranslation("settings");
  const [query, setQuery] = useState("");
  const [overrides, setOverrides] = useAtom(shortcutOverridesAtom);
  const recordingId = useAtomValue(shortcutRecordingIdAtom);
  const setRecordingId = useSetAtom(shortcutRecordingIdAtom);

  const conflicts = useMemo(
    () => findShortcutConflicts(overrides),
    [overrides],
  );
  const conflictById = useMemo(() => {
    const map = new Map<ShortcutId, ShortcutId[]>();
    for (const entry of conflicts) {
      map.set(entry.id, entry.conflictsWith);
    }
    return map;
  }, [conflicts]);

  const items = useMemo((): ShortcutListItem[] => {
    return SHORTCUT_CATALOG.map((definition) => ({
      definition,
      title: t(`shortcuts.actions.${definition.id}.title`),
      description: t(`shortcuts.actions.${definition.id}.description`),
      categoryLabel: t(
        `shortcuts.categories.${definition.category as ShortcutCategory}`,
      ),
    }));
  }, [t]);

  const filteredGroups = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const matched = normalized
      ? items.filter((item) => {
          const haystack = [
            item.title,
            item.description,
            item.categoryLabel,
            item.definition.id,
          ]
            .join(" ")
            .toLowerCase();
          return haystack.includes(normalized);
        })
      : items;

    return shortcutCategories
      .map((category) => ({
        category,
        label: t(`shortcuts.categories.${category}`),
        items: matched.filter((item) => item.definition.category === category),
      }))
      .filter((group) => group.items.length > 0);
  }, [items, query, t]);

  const canResetAll = hasAnyShortcutOverrides(overrides);
  const totalVisible = filteredGroups.reduce(
    (count, group) => count + group.items.length,
    0,
  );

  const stopRecording = () => {
    setRecordingId(null);
  };

  const handleBindingChange = (id: ShortcutId, combo: ShortcutCombo | null) => {
    setOverrides(setShortcutOverride(overrides, id, combo));
    setRecordingId(null);
  };

  const handleResetOne = (id: ShortcutId) => {
    setOverrides(clearShortcutOverride(overrides, id));
    if (recordingId === id) {
      setRecordingId(null);
    }
  };

  const handleResetAll = () => {
    setOverrides(resetAllShortcutOverrides());
    setRecordingId(null);
  };

  return (
    <div className="settings-panel-enter flex flex-col gap-4">
      <p className="text-body text-muted-foreground">
        {t("shortcuts.description")}
      </p>

      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("shortcuts.searchPlaceholder")}
            aria-label={t("shortcuts.searchPlaceholder")}
            className="ps-8"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={!canResetAll}
          onClick={handleResetAll}
          className="shrink-0"
        >
          <RotateCcw className="size-3.5" />
          {t("shortcuts.resetAll")}
        </Button>
      </div>

      <div className="overflow-hidden rounded-card border border-border/70 bg-card/45">
        {totalVisible === 0 ? (
          <div className="px-4 py-10">
            <EmptyState
              title={t("shortcuts.emptyTitle")}
              description={t("shortcuts.emptyDescription")}
            />
          </div>
        ) : (
          <div className="max-h-[min(28rem,calc(100vh-16rem))] overflow-y-auto">
            {filteredGroups.map((group) => (
              <section key={group.category}>
                <div className="sticky top-0 z-10 border-b border-border/30 bg-card/95 px-3 py-1.5 backdrop-blur-sm">
                  <div className="text-meta font-medium text-muted-foreground/70">
                    {group.label}
                  </div>
                </div>
                <ul className="divide-y divide-border/60">
                  {group.items.map((item) => {
                    const { definition } = item;
                    const combo = resolveShortcutCombo(
                      definition.id,
                      overrides,
                    );
                    const customized = isShortcutCustomized(
                      definition.id,
                      overrides,
                    );
                    const conflictIds = conflictById.get(definition.id) ?? [];
                    const hasConflict = conflictIds.length > 0;
                    const conflictLabel = hasConflict
                      ? t("shortcuts.conflict", {
                          action: conflictIds
                            .map((otherId) =>
                              t(`shortcuts.actions.${otherId}.title`),
                            )
                            .join(", "),
                        })
                      : undefined;

                    return (
                      <li
                        key={definition.id}
                        className={cn(
                          "flex items-center gap-3 px-3 py-1.5",
                          hasConflict && "bg-destructive/5",
                        )}
                        title={conflictLabel ?? item.description}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-body font-medium text-foreground">
                            {item.title}
                          </div>
                          {hasConflict ? (
                            <div className="truncate text-meta text-destructive">
                              {conflictLabel}
                            </div>
                          ) : null}
                        </div>
                        {customized ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="size-7 shrink-0 p-0 text-muted-foreground"
                            onClick={() => handleResetOne(definition.id)}
                            aria-label={t("shortcuts.reset")}
                          >
                            <RotateCcw className="size-3.5" />
                          </Button>
                        ) : null}
                        <ShortcutRecorderButton
                          id={definition.id}
                          combo={combo}
                          isRecording={recordingId === definition.id}
                          onChange={(next) =>
                            handleBindingChange(definition.id, next)
                          }
                          onCancelRecording={stopRecording}
                        />
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      <p className="text-meta text-muted-foreground">{t("shortcuts.hint")}</p>
    </div>
  );
}
