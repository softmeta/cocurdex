import type { WebContents } from "electron";

const PADDING = 12;

export async function captureAnnotation(
  contents: WebContents,
  box: { x: number; y: number; width: number; height: number },
): Promise<string | undefined> {
  if (contents.isDestroyed() || box.width <= 0 || box.height <= 0) return;
  const x = Math.max(0, Math.floor(box.x - PADDING));
  const y = Math.max(0, Math.floor(box.y - PADDING));
  const image = await contents.capturePage({
    x,
    y,
    width: Math.ceil(box.x + box.width + PADDING) - x,
    height: Math.ceil(box.y + box.height + PADDING) - y,
  });
  return image.isEmpty() ? undefined : image.toDataURL();
}
