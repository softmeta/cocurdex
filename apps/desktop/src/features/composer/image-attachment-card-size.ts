const IMAGE_CARD_MAX_WIDTH = 160;
const IMAGE_CARD_MAX_HEIGHT = 192;
export const COMPOSER_IMAGE_CARD_MAX_WIDTH = 176;
export const COMPOSER_IMAGE_CARD_MAX_HEIGHT = 72;

export function getImageCardSize(
  width: number,
  height: number,
  maxWidth = IMAGE_CARD_MAX_WIDTH,
  maxHeight = IMAGE_CARD_MAX_HEIGHT,
) {
  if (width <= 0 || height <= 0) {
    return null;
  }

  const scale = Math.min(maxWidth / width, maxHeight / height, 1);

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
