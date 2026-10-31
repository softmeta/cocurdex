import {
  type DeckOp,
  type DeckRecord,
  type DeckSummary,
  isDeckConflictError,
} from "@cocurdex/shared";
import { atom, type Getter, type Setter } from "jotai";
import { decksApi } from "./decks-api";

export const deckSummariesAtom = atom<DeckSummary[]>([]);
export const decksLoadedAtom = atom(false);
export const activeDeckIdAtom = atom<string | null>(null);
export const activeDeckAtom = atom<DeckRecord | null>(null);
export const activeSlideIndexAtom = atom(0);

function clampSlideIndex(get: Getter, set: Setter, deck: DeckRecord | null) {
  const last = Math.max(0, (deck?.content.slides.length ?? 1) - 1);
  if (get(activeSlideIndexAtom) > last) set(activeSlideIndexAtom, last);
}

async function reloadActiveDeck(get: Getter, set: Setter) {
  const id = get(activeDeckIdAtom);
  if (!id) return;
  const deck = await decksApi.get({ id });
  if (get(activeDeckIdAtom) !== id) return;
  set(activeDeckAtom, deck);
  if (!deck) set(activeDeckIdAtom, null);
  clampSlideIndex(get, set, deck);
}

export const loadDecksAtom = atom(null, async (get, set) => {
  const summaries = await decksApi.list();
  set(deckSummariesAtom, summaries);
  set(decksLoadedAtom, true);
  const activeId = get(activeDeckIdAtom);
  const active = summaries.find((deck) => deck.id === activeId);
  if (activeId && active?.revision !== get(activeDeckAtom)?.revision) {
    await reloadActiveDeck(get, set);
  }
});

export const openDeckAtom = atom(null, async (get, set, id: string) => {
  if (get(activeDeckIdAtom) === id) return;
  set(activeDeckIdAtom, id);
  const deck = await decksApi.get({ id });
  if (get(activeDeckIdAtom) !== id) return;
  set(activeSlideIndexAtom, 0);
  set(activeDeckAtom, deck);
  if (!deck) set(activeDeckIdAtom, null);
});

export const selectSlideAtom = atom(null, (get, set, index: number) => {
  const count = get(activeDeckAtom)?.content.slides.length ?? 0;
  if (count === 0) return;
  set(activeSlideIndexAtom, Math.min(Math.max(index, 0), count - 1));
});

export const renameDeckAtom = atom(
  null,
  async (get, set, input: { id: string; title: string }) => {
    const current = get(deckSummariesAtom).find((deck) => deck.id === input.id);
    const { deck } = await decksApi.update({
      id: input.id,
      title: input.title,
      expectedRevision: current?.revision,
    });
    set(deckSummariesAtom, (summaries) =>
      summaries.map((summary) =>
        summary.id === deck.id
          ? { ...summary, title: deck.title, revision: deck.revision }
          : summary,
      ),
    );
    if (get(activeDeckIdAtom) === deck.id) set(activeDeckAtom, deck);
  },
);

export const editActiveDeckAtom = atom(
  null,
  async (get, set, ops: DeckOp[]): Promise<DeckRecord | null> => {
    const current = get(activeDeckAtom);
    if (!current) return null;
    try {
      const { deck } = await decksApi.edit({
        id: current.id,
        ops,
        expectedRevision: current.revision,
      });
      set(deckSummariesAtom, (summaries) =>
        summaries.map((summary) =>
          summary.id === deck.id
            ? {
                ...summary,
                revision: deck.revision,
                slideCount: deck.slideCount,
                updatedAt: deck.updatedAt,
              }
            : summary,
        ),
      );
      if (get(activeDeckIdAtom) !== deck.id) return deck;
      set(activeDeckAtom, deck);
      clampSlideIndex(get, set, deck);
      return deck;
    } catch (error) {
      if (isDeckConflictError(error)) await reloadActiveDeck(get, set);
      throw error;
    }
  },
);

export const deleteDeckAtom = atom(null, async (get, set, id: string) => {
  const current = get(deckSummariesAtom).find((deck) => deck.id === id);
  await decksApi.delete({ id, expectedRevision: current?.revision });
  set(deckSummariesAtom, (summaries) =>
    summaries.filter((deck) => deck.id !== id),
  );
  if (get(activeDeckIdAtom) === id) {
    set(activeDeckIdAtom, null);
    set(activeDeckAtom, null);
  }
});

export const importDeckAtom = atom(null, async (_get, set, path: string) => {
  const result = await decksApi.importPptx({ path });
  await set(loadDecksAtom);
  await set(openDeckAtom, result.deck.id);
  return result;
});

export const createDeckAtom = atom(null, async (_get, set, title: string) => {
  const { deck } = await decksApi.create({ title });
  const { deck: withCover } = await decksApi.edit({
    id: deck.id,
    ops: [{ op: "addSlide", layout: "cover" }],
    expectedRevision: deck.revision,
  });
  await set(loadDecksAtom);
  await set(openDeckAtom, withCover.id);
  return withCover;
});
