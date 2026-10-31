import type { DeckRecord } from "@cocurdex/shared";
import { useAtomValue, useSetAtom } from "jotai";
import { ImagePlus, MonitorPlay, Play, Presentation } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { TitlebarIconButton } from "@/app/layout/titlebar-icon-button";
import { EmptyState, Text } from "@/components/ui";
import { exportDeckWithFeedback } from "./deck-actions";
import { AddSlideMenu, LayoutMenu } from "./deck-edit-menus";
import { DeckExportMenu } from "./deck-export-menu";
import { DeckFilmstrip } from "./deck-filmstrip";
import { DeckPresentation } from "./deck-presentation";
import { ThemeMenu } from "./deck-theme-menu";
import { activeSlideIndexAtom, selectSlideAtom } from "./decks-store";
import { canPickLocalFiles } from "./local-file-picker";
import {
  DeckPresenterView,
  type PresenterSession,
} from "./presenter/deck-presenter-view";
import { startPresenterSession } from "./presenter/start-presenter-session";
import { EditableSlide } from "./slide-editor/editable-slide";
import { SlideNotesEditor } from "./slide-notes-editor";
import { useDeckEditing } from "./use-deck-editing";

type PresentationState =
  | { kind: "idle" }
  | { kind: "fullscreen" }
  | { kind: "starting" }
  | { kind: "presenter"; session: PresenterSession };

export function DeckViewer({
  deck,
  leading,
}: {
  deck: DeckRecord;
  leading?: ReactNode;
}) {
  const { t } = useTranslation("decks");
  const activeIndex = useAtomValue(activeSlideIndexAtom);
  const selectSlide = useSetAtom(selectSlideAtom);
  const [presentation, setPresentation] = useState<PresentationState>({
    kind: "idle",
  });
  const slides = deck.content.slides;
  const slide = slides[activeIndex];
  const editing = useDeckEditing(deck);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-1 ps-2 pe-1.5">
        {leading}
        <Text
          size="meta"
          weight="medium"
          className="min-w-0 flex-1 truncate ps-1 text-editor-fg"
        >
          {deck.title || t("sidebar.untitled")}
        </Text>
        {slides.length > 0 ? (
          <Text
            as="span"
            size="meta"
            tone="muted"
            className="shrink-0 tabular-nums"
          >
            {t("viewer.position", {
              current: activeIndex + 1,
              total: slides.length,
            })}
          </Text>
        ) : null}
        <AddSlideMenu onAdd={editing.addSlide} />
        <LayoutMenu
          layout={slide?.layout ?? null}
          disabled={!slide}
          onChange={editing.setLayout}
        />
        {canPickLocalFiles() ? (
          <TitlebarIconButton
            aria-label={t("actions.insertImage")}
            disabled={!slide}
            onClick={editing.insertImage}
          >
            <ImagePlus className="size-3.5" />
          </TitlebarIconButton>
        ) : null}
        <ThemeMenu content={deck.content} onChange={editing.setTheme} />
        <TitlebarIconButton
          aria-label={t("actions.present")}
          disabled={slides.length === 0 || presentation.kind !== "idle"}
          onClick={() => setPresentation({ kind: "fullscreen" })}
        >
          <Play className="size-3.5" />
        </TitlebarIconButton>
        <TitlebarIconButton
          aria-label={t("actions.presenterView")}
          disabled={slides.length === 0 || presentation.kind !== "idle"}
          onClick={() => {
            setPresentation({ kind: "starting" });
            void startPresenterSession().then((session) => {
              if (session) {
                setPresentation({ kind: "presenter", session });
                return;
              }
              setPresentation({ kind: "idle" });
              toast.error(t("errors.audienceWindow"));
            });
          }}
        >
          <MonitorPlay className="size-3.5" />
        </TitlebarIconButton>
        <DeckExportMenu
          onExport={(format) =>
            void exportDeckWithFeedback(deck.id, format, t("errors.export"))
          }
        />
      </div>
      {slide ? (
        <>
          <section
            aria-label={t("viewer.slide", { number: activeIndex + 1 })}
            className="flex min-h-0 flex-1 items-center justify-center p-4 [container-type:size]"
          >
            <EditableSlide
              key={slide.id}
              slide={slide}
              content={deck.content}
              className="w-[min(100cqw,calc(100cqh*16/9))] rounded-dense shadow-md ring-1 ring-border"
              onEditText={(target, paragraphs) =>
                editing.editText(slide.id, target, paragraphs)
              }
              onReplaceImage={(elementId) =>
                editing.replaceImage(slide.id, elementId)
              }
              onDeleteElement={(elementId) =>
                editing.deleteElement(slide.id, elementId)
              }
            />
          </section>
          <SlideNotesEditor
            slide={slide}
            onCommit={(notes) => editing.setNotes(slide.id, notes)}
          />
          <DeckFilmstrip
            content={deck.content}
            activeIndex={activeIndex}
            onSelect={selectSlide}
            onSlideAction={editing.slideAction}
          />
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon={<Presentation />}
            title={t("viewer.emptyDeck.title")}
            description={t("viewer.emptyDeck.description")}
          />
        </div>
      )}
      {presentation.kind === "fullscreen" ? (
        <DeckPresentation
          content={deck.content}
          startIndex={activeIndex}
          onExit={(lastIndex) => {
            setPresentation({ kind: "idle" });
            selectSlide(lastIndex);
          }}
        />
      ) : null}
      {presentation.kind === "presenter" ? (
        <DeckPresenterView
          content={deck.content}
          session={presentation.session}
          startIndex={activeIndex}
          onExit={(lastIndex) => {
            setPresentation({ kind: "idle" });
            selectSlide(lastIndex);
          }}
        />
      ) : null}
    </div>
  );
}
