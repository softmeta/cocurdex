import { getFonts } from "font-list";

/**
 * Process-lifetime cache. Installed fonts rarely change while the app is open;
 * avoid re-scanning on every Appearance panel mount.
 */
let cachedFamilies: string[] | null = null;
let inflight: Promise<string[]> | null = null;

function normalizeFamilyName(name: string): string {
  return name.trim().replace(/^["']|["']$/g, "");
}

/**
 * List unique installed font family names for the Appearance pickers.
 * Sorted with locale-aware compare. Empty array on failure (renderer falls back).
 */
export async function listSystemFontFamilies(): Promise<string[]> {
  if (cachedFamilies) {
    return cachedFamilies;
  }
  if (inflight) {
    return inflight;
  }

  inflight = (async () => {
    try {
      // disableQuoting: return bare family names; we quote for CSS ourselves.
      const fonts = await getFonts({ disableQuoting: true });
      const unique = new Set<string>();
      for (const raw of fonts) {
        const name = normalizeFamilyName(raw);
        if (name) {
          unique.add(name);
        }
      }
      const sorted = [...unique].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" }),
      );
      cachedFamilies = sorted;
      return sorted;
    } catch {
      return [];
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}
