/**
 * Resolves the renderer's surface color to a plain `#rrggbb` hex string so it
 * can be pushed to the native Electron BrowserWindow (`window:setSurfaceColor`).
 *
 * The window paints exposed regions with its `backgroundColor` during resize,
 * before the renderer repaints. If that color drifts from `--app-bg`, dark
 * mode flashes the light fallback. The catch is that `--app-bg` is authored in
 * `oklch()`, and Chromium serializes a computed `oklch()` background-color back
 * as `oklch(...)` — not `rgb()`. Electron's `setBackgroundColor` only accepts
 * `#rrggbb`, so every CSS Color 4 form the browser may emit must be converted.
 */

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function channelToHex(value: number): string {
  return Math.round(clamp01(value) * 255)
    .toString(16)
    .padStart(2, "0");
}

function rgbBytesToHex(r: number, g: number, b: number): string {
  const byte = (value: number) =>
    Math.round(Math.min(255, Math.max(0, value)))
      .toString(16)
      .padStart(2, "0");
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

/** Linear-light sRGB component -> gamma-encoded sRGB in [0, 1]. */
function linearToSrgb(value: number): number {
  const v = clamp01(value);
  return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
}

/** OKLab -> gamma-encoded sRGB hex (CSS Color 4 reference matrices). */
function oklabToHex(L: number, a: number, b: number): string {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const blue = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  return `#${channelToHex(linearToSrgb(r))}${channelToHex(
    linearToSrgb(g),
  )}${channelToHex(linearToSrgb(blue))}`;
}

/** Parses an `<alpha-value>`-free number, accepting an optional `%` suffix. */
function parseComponent(token: string, percentBase: number): number {
  const trimmed = token.trim();
  if (trimmed.endsWith("%")) {
    return (Number.parseFloat(trimmed) / 100) * percentBase;
  }
  return Number.parseFloat(trimmed);
}

/** Splits the body of a `fn(...)` color into its components, ignoring alpha. */
function colorComponents(body: string): string[] {
  // Both comma (`rgb(1, 2, 3)`) and modern space (`rgb(1 2 3 / 1)`) syntaxes.
  return body
    .replace(/\/.*$/, "")
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function expandHex(value: string): string {
  if (value.length === 3) {
    return value
      .split("")
      .map((digit) => digit + digit)
      .join("");
  }
  return value;
}

/**
 * Normalizes any CSS Color 4 string Chromium may report for a computed
 * background-color into `#rrggbb`. Returns `null` when the input cannot be
 * parsed, signalling the caller to leave the native surface color untouched.
 */
export function normalizeCssColorToHex(color: string): string | null {
  const input = color.trim();
  if (!input) {
    return null;
  }

  const hex = input.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (hex) {
    return `#${expandHex(hex[1]).toLowerCase()}`;
  }

  const rgb = input.match(/^rgba?\((.+)\)$/i);
  if (rgb) {
    const [r, g, b] = colorComponents(rgb[1]).map((part) =>
      parseComponent(part, 255),
    );
    if ([r, g, b].some(Number.isNaN)) {
      return null;
    }
    return rgbBytesToHex(r, g, b);
  }

  const srgb = input.match(/^color\(\s*srgb\s+(.+)\)$/i);
  if (srgb) {
    const [r, g, b] = colorComponents(srgb[1]).map((part) =>
      parseComponent(part, 1),
    );
    if ([r, g, b].some(Number.isNaN)) {
      return null;
    }
    return rgbBytesToHex(r * 255, g * 255, b * 255);
  }

  const oklab = input.match(/^oklab\((.+)\)$/i);
  if (oklab) {
    const [L, a, b] = colorComponents(oklab[1]).map((part, index) =>
      parseComponent(part, index === 0 ? 1 : 0.4),
    );
    if ([L, a, b].some(Number.isNaN)) {
      return null;
    }
    return oklabToHex(L, a, b);
  }

  const oklch = input.match(/^oklch\((.+)\)$/i);
  if (oklch) {
    const parts = colorComponents(oklch[1]);
    const L = parseComponent(parts[0] ?? "", 1);
    const C = parseComponent(parts[1] ?? "", 0.4);
    const hueToken = (parts[2] ?? "0").replace(/deg$/i, "");
    const H = Number.parseFloat(hueToken);
    if ([L, C, H].some(Number.isNaN)) {
      return null;
    }
    const hRad = (H * Math.PI) / 180;
    return oklabToHex(L, C * Math.cos(hRad), C * Math.sin(hRad));
  }

  return null;
}

/**
 * Reads a CSS custom property off a hidden probe element and returns its
 * resolved color as `#rrggbb`. Relies on the browser to expand `var()` chains
 * and any color-space conversion the property fallback performs.
 */
export function resolveCssVariableColorToHex(name: string): string | null {
  const probe = document.createElement("div");
  probe.style.position = "fixed";
  probe.style.inset = "0";
  probe.style.pointerEvents = "none";
  probe.style.visibility = "hidden";
  probe.style.backgroundColor = `var(${name})`;
  document.body.append(probe);

  const color = getComputedStyle(probe).backgroundColor;
  probe.remove();

  return normalizeCssColorToHex(color);
}
