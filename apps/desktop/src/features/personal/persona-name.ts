export function pickPersonaName(
  pool: readonly string[],
  usedNames: readonly string[],
  random: () => number = Math.random,
): string {
  const candidates = pool.map((name) => name.trim()).filter(Boolean);
  const used = new Set(
    usedNames.map((name) => name.trim().toLocaleLowerCase()),
  );
  const isFree = (name: string) => !used.has(name.toLocaleLowerCase());
  const free = candidates.filter(isFree);
  if (free.length > 0) {
    return free[Math.floor(random() * free.length)] ?? free[0] ?? "";
  }
  const base = candidates[Math.floor(random() * candidates.length)] ?? "";
  for (let suffix = 2; ; suffix += 1) {
    const name = `${base} ${suffix}`.trim();
    if (isFree(name)) return name;
  }
}
