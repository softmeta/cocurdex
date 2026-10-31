export type DeckImageLoader = (hash: string) => Promise<Buffer>;

export async function loadDeckImages(
  hashes: readonly string[],
  loadImage: DeckImageLoader,
): Promise<Map<string, Buffer>> {
  const unique = [...new Set(hashes)];
  const loaded = await Promise.all(
    unique.map(async (hash) => [hash, await loadImage(hash)] as const),
  );
  return new Map(loaded);
}
