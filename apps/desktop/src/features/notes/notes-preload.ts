export async function preloadNotes() {
  const [{ getDefaultStore }, { loadNotesAtom, notesLoadedAtom }] =
    await Promise.all([import("jotai"), import("./notes-store")]);
  const store = getDefaultStore();
  if (!store.get(notesLoadedAtom)) await store.set(loadNotesAtom);
}
