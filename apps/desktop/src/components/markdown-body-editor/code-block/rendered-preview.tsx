import { MATH_LANGUAGE } from "@cocurdex/note-doc";
import type { RenderedLanguage } from "@cocurdex/note-doc/preview";
import katex from "katex";
import { Download, Maximize2 } from "lucide-react";
import { type CSSProperties, useDeferredValue, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  downloadMermaidSvg,
  MermaidCopyImageIcon,
  MermaidPreviewDialog,
  mermaidCopyImageLabel,
  useMermaidImageCopy,
  useMermaidRender,
} from "@/components/markdown-mermaid";
import { IconButton } from "@/components/ui";
import { Text } from "@/components/ui/text";

export interface RenderedPreviewProps {
  language: RenderedLanguage;
  source: string;
}

function PreviewError({ message }: { message: string }) {
  return (
    <div className="md-rendered-preview px-3 py-2 text-left">
      <Text className="font-mono text-destructive" size="meta">
        {message}
      </Text>
    </div>
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

function MathPreview({ source }: { source: string }) {
  const { t } = useTranslation("notes");
  const { html, error } = renderTex(source);
  if (error) return <PreviewError message={error} />;
  return (
    <div
      aria-label={t("codeBlock.formula")}
      className="md-rendered-preview overflow-x-auto px-3 py-2 text-center"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: KaTeX builds this markup from TeX with trust disabled, which rejects \href, \url, and raw HTML.
      dangerouslySetInnerHTML={{ __html: html ?? "" }}
      role="img"
    />
  );
}

function useDiagram(source: string) {
  return useMermaidRender(source, source.trim() !== "");
}

function MermaidPreview({ source }: { source: string }) {
  const { t } = useTranslation("notes");
  const { diagram, error } = useDiagram(source);
  if (error) return <PreviewError message={error} />;
  if (!diagram) return null;
  return (
    <div
      aria-label={t("codeBlock.diagram")}
      className="md-rendered-preview flex items-center justify-center px-3 py-2 [&>svg]:block [&>svg]:h-auto [&>svg]:max-h-[max(min(60vh,30rem),calc(var(--mermaid-height)*0.75))] [&>svg]:max-w-full"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: Mermaid renders with securityLevel "strict", which sanitizes labels and disables scripts and click handlers.
      dangerouslySetInnerHTML={{ __html: diagram.svg }}
      role="img"
      style={{ "--mermaid-height": `${diagram.height}px` } as CSSProperties}
    />
  );
}

export function RenderedPreview({ language, source }: RenderedPreviewProps) {
  const deferred = useDeferredValue(source);
  if (deferred.trim() === "") return null;
  return language === MATH_LANGUAGE ? (
    <MathPreview source={deferred} />
  ) : (
    <MermaidPreview source={deferred} />
  );
}

export function DiagramActions({ source }: { source: string }) {
  const { t } = useTranslation("common");
  const { diagram } = useDiagram(source);
  const [previewOpen, setPreviewOpen] = useState(false);
  const imageCopy = useMermaidImageCopy();
  return (
    <>
      <IconButton
        aria-label={mermaidCopyImageLabel(t, imageCopy.status)}
        disabled={!diagram}
        onClick={(event) => {
          if (!diagram) return;
          const preview = event.currentTarget
            .closest("[data-code-language]")
            ?.querySelector("[role='img']");
          void imageCopy.copy(diagram, preview ?? null);
        }}
        size="xs"
      >
        <MermaidCopyImageIcon status={imageCopy.status} />
      </IconButton>
      <IconButton
        aria-label={t("mermaid.download")}
        disabled={!diagram}
        onClick={() => diagram && downloadMermaidSvg(diagram.svg)}
        size="xs"
      >
        <Download className="size-3.5" />
      </IconButton>
      <IconButton
        aria-label={t("mermaid.openPreview")}
        disabled={!diagram}
        onClick={() => setPreviewOpen(true)}
        size="xs"
      >
        <Maximize2 className="size-3.5" />
      </IconButton>
      {previewOpen && diagram ? (
        <MermaidPreviewDialog
          code={source}
          diagram={diagram}
          onClose={() => setPreviewOpen(false)}
        />
      ) : null}
    </>
  );
}
