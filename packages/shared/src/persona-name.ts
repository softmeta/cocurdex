import type { SupportedLocale } from "./locales";

export const PERSONA_NAME_POOLS: Record<SupportedLocale, readonly string[]> = {
  "en-US": [
    "Iris",
    "Milo",
    "Juno",
    "Otto",
    "Nora",
    "Felix",
    "Luna",
    "Theo",
    "Ivy",
    "Leo",
    "Hazel",
    "Jasper",
    "Ruby",
    "Oscar",
    "Mabel",
    "Rowan",
    "Clara",
    "Hugo",
    "Wren",
    "Ezra",
    "Ada",
    "Silas",
    "Vera",
    "Arlo",
    "June",
    "Remy",
    "Elsie",
    "Finn",
    "Pearl",
    "Kai",
  ],
  "zh-CN": [
    "阿青",
    "小满",
    "知秋",
    "南星",
    "青禾",
    "初夏",
    "安然",
    "云舒",
    "星野",
    "半夏",
    "清和",
    "若溪",
    "明川",
    "小鹿",
    "望舒",
    "听雨",
    "北辰",
    "沐阳",
    "一禾",
    "长安",
    "木木",
    "南风",
    "晴川",
    "小柚",
    "夏至",
    "白露",
    "落落",
    "子衿",
    "远山",
    "知微",
  ],
};

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
