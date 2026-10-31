import { loadFontList } from "../packaged-module";

let cachedFamilies: string[] | null = null;
let inflight: Promise<string[]> | null = null;

function normalizeFamilyName(name: string): string {
  return name.trim().replace(/^["']|["']$/g, "");
}

async function readFontFamilies(): Promise<string[]> {
  const { getFonts } = await loadFontList();
  const fonts = await getFonts({ disableQuoting: true });
  const unique = new Set<string>();
  for (const raw of fonts) {
    const name = normalizeFamilyName(raw);
    if (name) {
      unique.add(name);
    }
  }
  return [...unique].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
}

export function listFontFamilies(): Promise<string[]> {
  if (cachedFamilies) {
    return Promise.resolve(cachedFamilies);
  }
  inflight ??= readFontFamilies()
    .then((families) => {
      cachedFamilies = families;
      return families;
    })
    .catch(() => [])
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
