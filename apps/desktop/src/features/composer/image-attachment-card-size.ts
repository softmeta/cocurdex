// Sent-message photo size: a compact IM thumbnail, not a full preview.
// Caps are CSS pixels.
const IMAGE_CARD_MAX_WIDTH = 160;
const IMAGE_CARD_MAX_HEIGHT = 192;

export function getImageCardSize(width: number, height: number) {
  if (width <= 0 || height <= 0) {
    return null;
  }

  const scale = Math.min(
    IMAGE_CARD_MAX_WIDTH / width,
    IMAGE_CARD_MAX_HEIGHT / height,
    1,
  );

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
