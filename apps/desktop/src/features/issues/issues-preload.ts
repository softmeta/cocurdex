export async function preloadIssues() {
  const [{ getDefaultStore }, { issuesLoadedAtom, loadIssuesAtom }] =
    await Promise.all([import("jotai"), import("./issues-store")]);
  const store = getDefaultStore();
  if (!store.get(issuesLoadedAtom)) await store.set(loadIssuesAtom);
}
