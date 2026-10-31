import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useDocumentEvent } from "@/lib/react-hooks";
import { SlideCanvas } from "../slide-canvas";
import { slideIndexForKey } from "../slide-navigation";
import { audienceChannelFromLocation } from "./audience-channel";
import { useAudienceChannel } from "./use-audience-channel";

function AudienceStage({ channel }: { channel: string }) {
  const { t } = useTranslation("decks");
  const { state, navigate, close } = useAudienceChannel(channel);
  const count = state?.content.slides.length ?? 0;
  const index = state?.index ?? 0;

  useDocumentEvent(
    "keydown",
    useCallback(
      (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          event.preventDefault();
          close();
          return;
        }
        const next = slideIndexForKey(event.key, index, count);
        if (next === null) return;
        event.preventDefault();
        navigate(next);
      },
      [close, navigate, index, count],
    ),
  );

  const slide = state?.content.slides[index];
  return (
    <main
      aria-label={t("present.audience")}
      className="flex h-dvh w-dvw items-center justify-center bg-black [container-type:size]"
    >
      {state && slide ? (
        <button
          type="button"
          aria-label={t("present.next")}
          className="flex size-full items-center justify-center outline-none"
          onClick={() => navigate(Math.min(index + 1, count - 1))}
        >
          <SlideCanvas
            slide={slide}
            content={state.content}
            className="w-[min(100cqw,calc(100cqh*16/9))]"
          />
        </button>
      ) : null}
      <output aria-live="polite" className="sr-only">
        {state
          ? t("present.position", { current: index + 1, total: count })
          : ""}
      </output>
    </main>
  );
}

export function DeckAudienceApp() {
  const channel = audienceChannelFromLocation(window.location.search);
  return channel ? <AudienceStage channel={channel} /> : null;
}
