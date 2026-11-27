export async function preloadRoutines() {
  const { preloadRoutineList } = await import("./routines-queries");
  await preloadRoutineList();
}
