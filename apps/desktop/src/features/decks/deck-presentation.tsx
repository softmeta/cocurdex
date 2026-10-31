import type { DeckContent } from "@cocurdex/shared";
import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useDocumentEvent } from "@/lib/react-hooks";
import { SlideCanvas } from "./slide-canvas";
import { slideIndexForKey } from "./slide-navigation";
import { useFullscreenPresentation } from "./use-fullscreen-presentation";

export function DeckPresentation({
  content,
  startIndex,
  onExit,
}: {
  content: DeckContent;
  startIndex: number;
  onExit: (lastIndex: number) => void;
}) {
  const { t } = useTranslation("decks");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [requestedIndex, setIndex] = useState(startIndex);
  const count = content.slides.length;
  const index = Math.min(requestedIndex, Math.max(0, count - 1));
  const exit = useCallback(() => onExit(index), [onExit, index]);

  useFullscreenPresentation(rootRef, exit);
  useDocumentEvent(
    "keydown",
    useCallback(
      (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          event.preventDefault();
          exit();
          return;
        }
        const next = slideIndexForKey(event.key, index, count);
        if (next === null) return;
        event.preventDefault();
        setIndex(next);
      },
      [exit, index, count],
    ),
  );

  const slide = content.slides[index];
  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={t("present.label")}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black [container-type:size]"
    >
      <button
        type="button"
        aria-label={t("present.next")}
        className="flex size-full items-center justify-center outline-none"
        onClick={() => setIndex(Math.min(index + 1, count - 1))}
      >
        {slide ? (
          <SlideCanvas
            slide={slide}
            content={content}
            className="w-[min(100cqw,calc(100cqh*16/9))]"
          />
        ) : null}
      </button>
      <output aria-live="polite" className="sr-only">
        {t("present.position", { current: index + 1, total: count })}
      </output>
    </div>,
    document.body,
  );
}
