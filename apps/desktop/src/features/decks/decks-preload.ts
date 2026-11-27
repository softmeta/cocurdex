export async function preloadDecks() {
  const [{ getDefaultStore }, { decksLoadedAtom, loadDecksAtom }] =
    await Promise.all([import("jotai"), import("./decks-store")]);
  const store = getDefaultStore();
  if (!store.get(decksLoadedAtom)) await store.set(loadDecksAtom);
}
