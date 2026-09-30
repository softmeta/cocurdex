import type { BrowserAnnotation } from "@cocurdex/shared";
import { importImageDataUrl } from "@/features/composer";
import { annotationScreenshotName } from "./browser-annotation-message";

export function buildBrowserAnnotationAttachments(
  annotations: BrowserAnnotation[],
) {
  return Promise.all(
    annotations.flatMap((annotation, index) =>
      annotation.regionScreenshot
        ? [
            importImageDataUrl(
              annotation.regionScreenshot,
              annotationScreenshotName(index),
            ),
          ]
        : [],
    ),
  );
}
