import type { BrowserAnnotation } from "@cocurdex/shared";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { consumeBrowserAnnotations } from "./chat-browser-context";

function useAnnotationLabel() {
  const { t } = useTranslation("browser");
  return (annotation: BrowserAnnotation) => {
    if (annotation.note) return annotation.note;
    if (annotation.textContent) return annotation.textContent;
    if (annotation.type === "element")
      return annotation.tagName
        ? `<${annotation.tagName}>`
        : t("annotations.element");
    return t("annotations.region", {
      width: String(annotation.boundingBox.width),
      height: String(annotation.boundingBox.height),
    });
  };
}

export function BrowserAnnotationChips({
  annotations,
}: {
  annotations: BrowserAnnotation[];
}) {
  const { t } = useTranslation("browser");
  const labelOf = useAnnotationLabel();
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {annotations.map((annotation, index) => (
        <span
          className="inline-flex max-w-64 items-center gap-1.5 rounded-full border border-chat-border bg-chat-surface-control py-1 ps-1 pe-2 text-meta text-chat-fg-muted"
          key={annotation.id}
          title={annotation.selector}
        >
          <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            {index + 1}
          </span>
          <span className="min-w-0 truncate">{labelOf(annotation)}</span>
          <button
            aria-label={t("actions.removeAnnotation")}
            className="flex size-4 shrink-0 items-center justify-center rounded-full hover:text-foreground"
            onClick={() => consumeBrowserAnnotations([annotation])}
            type="button"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
    </div>
  );
}
