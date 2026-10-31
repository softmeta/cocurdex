import type { DeckContent } from "@cocurdex/shared";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { AppWindowOverlayHeader } from "@/components/app";
import { Button, ScrollArea, Text } from "@/components/ui";
import { useDocumentEvent } from "@/lib/react-hooks";
import { SlideCanvas } from "../slide-canvas";
import { slideIndexForKey } from "../slide-navigation";
import { formatElapsed } from "./format-elapsed";
import { useElapsedSeconds } from "./use-elapsed-seconds";
import { usePresenterChannel } from "./use-presenter-channel";

export interface PresenterSession {
  channel: string;
  externalDisplay: boolean;
  startedAt: number;
}

export function DeckPresenterView({
  content,
  session,
  startIndex,
  onExit,
}: {
  content: DeckContent;
  session: PresenterSession;
  startIndex: number;
  onExit: (lastIndex: number) => void;
}) {
  const { t } = useTranslation("decks");
  const count = content.slides.length;
  const [requestedIndex, setIndex] = useState(startIndex);
  const index = Math.min(requestedIndex, Math.max(0, count - 1));
  const elapsed = useElapsedSeconds(session.startedAt);
  const go = useCallback(
    (next: number) => setIndex(Math.min(Math.max(next, 0), count - 1)),
    [count],
  );

  const leave = useCallback(() => onExit(index), [onExit, index]);
  const endAudience = usePresenterChannel({
    channel: session.channel,
    content,
    index,
    onNavigate: go,
    onAudienceClosed: leave,
  });
  const exit = useCallback(() => {
    endAudience();
    leave();
  }, [endAudience, leave]);
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
        go(next);
      },
      [exit, go, index, count],
    ),
  );

  const slide = content.slides[index];
  const nextSlide = content.slides[index + 1];
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("presenter.label")}
      className="fixed inset-0 z-50 flex flex-col bg-background text-foreground"
    >
      <AppWindowOverlayHeader className="gap-4 border-border">
        <Text as="span" size="body" weight="medium" className="tabular-nums">
          {t("present.position", { current: index + 1, total: count })}
        </Text>
        <Text
          as="span"
          size="body"
          tone="muted"
          aria-label={t("presenter.elapsed")}
          className="tabular-nums"
        >
          {formatElapsed(elapsed)}
        </Text>
        <Text
          as="span"
          size="meta"
          tone="muted"
          className="min-w-0 flex-1 truncate"
        >
          {session.externalDisplay ? "" : t("presenter.moveAudienceHint")}
        </Text>
        <Button
          variant="outline"
          size="xs"
          className="app-no-drag"
          onClick={exit}
        >
          {t("presenter.end")}
        </Button>
      </AppWindowOverlayHeader>
      <div className="flex min-h-0 flex-1 gap-4 p-4">
        <section
          aria-label={t("presenter.current")}
          className="flex min-w-0 flex-[3] items-center justify-center [container-type:size]"
        >
          {slide ? (
            <SlideCanvas
              slide={slide}
              content={content}
              className="w-[min(100cqw,calc(100cqh*16/9))] rounded-dense shadow-md ring-1 ring-border"
            />
          ) : null}
        </section>
        <div className="flex min-w-0 flex-[2] flex-col gap-4">
          <section
            aria-label={t("presenter.upNext")}
            className="flex flex-col gap-2"
          >
            <Text as="h2" size="meta" tone="muted" weight="medium">
              {t("presenter.upNext")}
            </Text>
            {nextSlide ? (
              <SlideCanvas
                slide={nextSlide}
                content={content}
                className="w-full rounded-dense ring-1 ring-border"
              />
            ) : (
              <Text size="body" tone="muted">
                {t("presenter.lastSlide")}
              </Text>
            )}
          </section>
          <section
            aria-label={t("viewer.notes")}
            className="flex min-h-0 flex-1 flex-col gap-2"
          >
            <Text as="h2" size="meta" tone="muted" weight="medium">
              {t("viewer.notes")}
            </Text>
            <ScrollArea className="min-h-0 flex-1">
              <Text
                size="lg"
                className="whitespace-pre-wrap"
                tone={slide?.notes ? "default" : "muted"}
              >
                {slide?.notes || t("presenter.noNotes")}
              </Text>
            </ScrollArea>
          </section>
        </div>
      </div>
      <footer className="flex h-14 shrink-0 items-center justify-center gap-2 border-t border-border">
        <Button
          variant="outline"
          disabled={index === 0}
          onClick={() => go(index - 1)}
        >
          <ChevronLeft className="size-4 rtl:rotate-180" />
          {t("presenter.previous")}
        </Button>
        <Button
          variant="outline"
          disabled={index >= count - 1}
          onClick={() => go(index + 1)}
        >
          {t("presenter.next")}
          <ChevronRight className="size-4 rtl:rotate-180" />
        </Button>
      </footer>
    </div>,
    document.body,
  );
}
