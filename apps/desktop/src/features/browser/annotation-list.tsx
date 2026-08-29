import type { BrowserAnnotation } from "@cocurdex/shared";
import { useAtomValue, useSetAtom } from "jotai";
import { MousePointer2, Square, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  TITLEBAR_ICON_GLYPH_CLASS,
  TitlebarIconButton,
} from "@/app/layout/titlebar-icon-button";
import {
  annotationsAtom,
  clearAnnotationsAtom,
  removeAnnotationAtom,
} from "./browser-store";

function getElementAnnotationLabel(a: BrowserAnnotation): string | null {
  if (a.type === "element") {
    const parts: string[] = [];
    if (a.tagName) parts.push(a.tagName);
    if (a.selector) parts.push(a.selector);
    return parts.join(" ") || null;
  }

  return null;
}

export function AnnotationList() {
  const { t } = useTranslation("browser");
  const annotations = useAtomValue(annotationsAtom);
  const removeAnnotation = useSetAtom(removeAnnotationAtom);
  const clearAnnotations = useSetAtom(clearAnnotationsAtom);

  if (annotations.length === 0) {
    return null;
  }

  return (
    <div className="border-t border-editor-border">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-meta font-medium text-editor-fg-subtle">
          {t("annotations.title", { count: annotations.length })}
        </span>
        <TitlebarIconButton
          aria-label={t("actions.clearAnnotations")}
          onClick={clearAnnotations}
        >
          <Trash2 className={TITLEBAR_ICON_GLYPH_CLASS} />
        </TitlebarIconButton>
      </div>
      <div className="max-h-[160px] overflow-auto px-2 pb-2">
        {annotations.map((a) => {
          const label =
            getElementAnnotationLabel(a) ??
            (a.type === "element"
              ? t("annotations.element")
              : t("annotations.region", {
                  height: String(a.boundingBox.height),
                  width: String(a.boundingBox.width),
                }));

          return (
            <div
              key={a.id}
              className="group flex items-start gap-2 rounded-control px-2 py-1.5 text-xs transition-colors hover:bg-editor-tab-hover-bg"
            >
              <span className="mt-0.5 shrink-0 text-editor-fg-muted">
                {a.type === "element" ? (
                  <MousePointer2 className="size-3" />
                ) : (
                  <Square className="size-3" />
                )}
              </span>
              <span className="min-w-0 flex-1 truncate text-editor-fg-subtle">
                {label}
              </span>
              <button
                type="button"
                aria-label={t("actions.removeAnnotation")}
                className="shrink-0 rounded text-editor-fg-muted opacity-0 transition-opacity hover:text-editor-fg group-hover:opacity-100"
                onClick={() => removeAnnotation(a.id)}
              >
                <X className="size-3" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
