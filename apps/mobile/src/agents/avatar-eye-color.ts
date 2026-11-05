function channel(value: number) {
  const unit = value / 255;
  return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string) {
  const digits = hex.replace("#", "").slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((at) =>
    channel(Number.parseInt(digits.slice(at, at + 2), 16)),
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(first: string, second: string) {
  const [high, low] = [luminance(first), luminance(second)].sort(
    (a, b) => b - a,
  );
  return (high + 0.05) / (low + 0.05);
}

export function avatarEyeColor(fill: string, dark: string, light: string) {
  return contrast(fill, light) > contrast(fill, dark) ? light : dark;
}
