import { useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui";
import {
  formatShortcutLabel,
  isModifierOnlyKey,
  type ShortcutCombo,
  shortcutComboFromKeyboardEvent,
} from "@/lib";
import { cn } from "@/lib/utils";

import type { ShortcutId } from "./shortcut-catalog";
import { ShortcutKeys } from "./shortcut-keys";
import { shortcutRecordingIdAtom } from "./shortcut-store";

interface ShortcutRecorderButtonProps {
  id: ShortcutId;
  combo: ShortcutCombo | null;
  isRecording: boolean;
  onChange(combo: ShortcutCombo | null): void;
  onCancelRecording(): void;
}

export function ShortcutRecorderButton({
  id,
  combo,
  isRecording,
  onChange,
  onCancelRecording,
}: ShortcutRecorderButtonProps) {
  const { t } = useTranslation("settings");
  const setRecordingId = useSetAtom(shortcutRecordingIdAtom);

  const startRecording = () => {
    setRecordingId(id);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!isRecording) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (isModifierOnlyKey(event.key)) {
      return;
    }

    const isBareEscape =
      event.key === "Escape" &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.shiftKey;
    if (isBareEscape) {
      onCancelRecording();
      return;
    }

    const isBareClear =
      (event.key === "Backspace" || event.key === "Delete") &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.shiftKey;
    if (isBareClear) {
      onChange(null);
      return;
    }

    const next = shortcutComboFromKeyboardEvent(event.nativeEvent);
    if (!next) {
      return;
    }
    onChange(next);
  };

  const handleBlur = () => {
    if (isRecording) {
      onCancelRecording();
    }
  };

  return (
    <Button
      type="button"
      variant={isRecording ? "default" : "outline"}
      size="sm"
      className={cn(
        "min-w-28 justify-center font-normal",
        isRecording && "ring-2 ring-ring/40",
      )}
      aria-label={
        isRecording
          ? t("shortcuts.recording")
          : t("shortcuts.editBinding", {
              binding: formatShortcutLabel(combo) || t("shortcuts.unbound"),
            })
      }
      onClick={() => {
        if (isRecording) {
          onCancelRecording();
          return;
        }
        startRecording();
      }}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    >
      {isRecording ? (
        <span className="text-meta">{t("shortcuts.recording")}</span>
      ) : (
        <ShortcutKeys combo={combo} unboundLabel={t("shortcuts.unbound")} />
      )}
    </Button>
  );
}
