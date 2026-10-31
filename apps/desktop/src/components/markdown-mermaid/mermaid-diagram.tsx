import { Download, Maximize2 } from "lucide-react";
import { type CSSProperties, useState } from "react";
import { useTranslation } from "react-i18next";
import { CodeBlockCopyButton, type CustomRendererProps } from "streamdown";
import { PreviewToolbarButton } from "@/components/media-preview";
import { Text } from "@/components/ui/text";
import { useRenderReadinessHold } from "../render-readiness";
import { downloadMermaidSvg } from "./mermaid-download";
import { MermaidPreviewDialog } from "./mermaid-preview-dialog";
import { useMermaidRender } from "./use-mermaid-render";
import { useMermaidStreamFrame } from "./use-mermaid-stream-frame";

function MermaidSource({ code }: { code: string }) {
  return (
    <pre className="overflow-x-auto font-mono text-chat-fg-muted">
      <Text size="meta">{code}</Text>
    </pre>
  );
}

export function MermaidDiagram({ code, isIncomplete }: CustomRendererProps) {
  const { t } = useTranslation("common");
  const { diagram, error } = useMermaidRender(code, !isIncomplete);
  const [previewOpen, setPreviewOpen] = useState(false);
  useRenderReadinessHold(!isIncomplete && !diagram && !error);
  const svgContainerRef = useMermaidStreamFrame(
    diagram?.svg ?? null,
    isIncomplete,
  );

  if (error) {
    return (
      <div className="my-4 space-y-2 rounded-card bg-chat-code-block p-4">
        <Text as="p" className="font-mono text-destructive" size="meta">
          {error}
        </Text>
        <MermaidSource code={code} />
      </div>
    );
  }

  if (!diagram) {
    return null;
  }

  return (
    <div className="group/mermaid relative my-4">
      <div
        aria-label={t("mermaid.title")}
        ref={svgContainerRef}
        className="flex items-center justify-center [&>svg]:block [&>svg]:h-auto [&>svg]:max-h-[max(min(60vh,30rem),calc(var(--mermaid-height)*0.75))] [&>svg]:max-w-full"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Mermaid renders with securityLevel "strict", which sanitizes labels and disables scripts and click handlers.
        dangerouslySetInnerHTML={{ __html: diagram.svg }}
        role="img"
        style={{ "--mermaid-height": `${diagram.height}px` } as CSSProperties}
      />
      {isIncomplete ? null : (
        <div className="absolute end-1.5 top-1.5 flex items-center gap-0.5 rounded-full border border-chat-border-soft bg-chat-surface-raised p-0.5 opacity-0 shadow-chat-soft transition-opacity duration-150 group-focus-within/mermaid:opacity-100 group-hover/mermaid:opacity-100">
          <CodeBlockCopyButton
            className="flex size-6 items-center justify-center rounded-full text-chat-fg-muted hover:bg-muted hover:text-chat-fg dark:hover:bg-muted/50"
            code={code}
          />
          <PreviewToolbarButton
            className="rounded-full"
            label={t("mermaid.download")}
            onClick={() => downloadMermaidSvg(diagram.svg)}
          >
            <Download className="size-3.5" />
          </PreviewToolbarButton>
          <PreviewToolbarButton
            className="rounded-full"
            label={t("mermaid.openPreview")}
            onClick={() => setPreviewOpen(true)}
          >
            <Maximize2 className="size-3.5" />
          </PreviewToolbarButton>
        </div>
      )}
      {previewOpen ? (
        <MermaidPreviewDialog
          code={code}
          diagram={diagram}
          onClose={() => setPreviewOpen(false)}
        />
      ) : null}
    </div>
  );
}
