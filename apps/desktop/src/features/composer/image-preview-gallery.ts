import type { ImageAttachment } from "@cocurdex/shared";

export function resolveImagePreviewGallery(
  attachment: ImageAttachment,
  gallery: readonly ImageAttachment[],
) {
  const index = gallery.findIndex((item) => item.id === attachment.id);
  if (gallery.length === 0 || index < 0) {
    return {
      canNavigate: false,
      index: 0,
      next: null,
      previous: null,
      total: 1,
    };
  }

  return {
    canNavigate: gallery.length > 1,
    index,
    next: index < gallery.length - 1 ? (gallery[index + 1] ?? null) : null,
    previous: index > 0 ? (gallery[index - 1] ?? null) : null,
    total: gallery.length,
  };
}

export function imagePreviewNeighbor(
  key: string,
  isRtl: boolean,
): "next" | "previous" | null {
  if (key === "ArrowLeft") {
    return isRtl ? "next" : "previous";
  }
  if (key === "ArrowRight") {
    return isRtl ? "previous" : "next";
  }
  return null;
}
