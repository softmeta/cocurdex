export async function preloadMemory() {
  const { preloadMemoryLibrary } = await import(
    "./library/memory-library-queries"
  );
  await preloadMemoryLibrary();
}
