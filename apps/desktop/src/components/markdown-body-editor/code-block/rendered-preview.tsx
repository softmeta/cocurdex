import { MATH_LANGUAGE } from "@cocurdex/note-doc";
import type { RenderedLanguage } from "@cocurdex/note-doc/preview";
import katex from "katex";
import { type CSSProperties, useDeferredValue } from "react";
import { useTranslation } from "react-i18next";
import { useMermaidRender } from "@/components/markdown-mermaid";
import { Text } from "@/components/ui/text";

export interface RenderedPreviewProps {
  language: RenderedLanguage;
  source: string;
  onEdit?: () => void;
}

function PreviewError({
  message,
  onEdit,
}: {
  message: string;
  onEdit?: () => void;
}) {
  return (
    <button
      type="button"
      className="md-rendered-preview block w-full cursor-text px-3 py-2 text-left"
      onClick={onEdit}
    >
      <Text className="font-mono text-destructive" size="meta">
        {message}
      </Text>
    </button>
  );
}

function renderTex(source: string) {
  try {
    return {
      html: katex.renderToString(source, {
        displayMode: true,
        throwOnError: true,
      }),
      error: null,
    };
  } catch (error) {
    return { html: null, error: String((error as Error).message ?? error) };
  }
}

function MathPreview({
  source,
  onEdit,
}: Omit<RenderedPreviewProps, "language">) {
  const { t } = useTranslation("notes");
  const { html, error } = renderTex(source);
  if (error) return <PreviewError message={error} onEdit={onEdit} />;
  return (
    <button
      type="button"
      aria-label={t("codeBlock.editFormula")}
      className="md-rendered-preview block w-full cursor-text overflow-x-auto px-3 py-2 text-center"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: KaTeX builds this markup from TeX with trust disabled, which rejects \href, \url, and raw HTML.
      dangerouslySetInnerHTML={{ __html: html ?? "" }}
      onClick={onEdit}
    />
  );
}

function MermaidPreview({
  source,
  onEdit,
}: Omit<RenderedPreviewProps, "language">) {
  const { t } = useTranslation("notes");
  const { diagram, error } = useMermaidRender(source, source.trim() !== "");
  if (error) return <PreviewError message={error} onEdit={onEdit} />;
  if (!diagram) return null;
  return (
    <button
      type="button"
      aria-label={t("codeBlock.editDiagram")}
      className="md-rendered-preview flex w-full cursor-text items-center justify-center px-3 py-2 [&>svg]:block [&>svg]:h-auto [&>svg]:max-h-[max(min(60vh,30rem),calc(var(--mermaid-height)*0.75))] [&>svg]:max-w-full"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: Mermaid renders with securityLevel "strict", which sanitizes labels and disables scripts and click handlers.
      dangerouslySetInnerHTML={{ __html: diagram.svg }}
      onClick={onEdit}
      style={{ "--mermaid-height": `${diagram.height}px` } as CSSProperties}
    />
  );
}

export function RenderedPreview({
  language,
  source,
  onEdit,
}: RenderedPreviewProps) {
  const deferred = useDeferredValue(source);
  if (deferred.trim() === "") return null;
  return language === MATH_LANGUAGE ? (
    <MathPreview onEdit={onEdit} source={deferred} />
  ) : (
    <MermaidPreview onEdit={onEdit} source={deferred} />
  );
}
