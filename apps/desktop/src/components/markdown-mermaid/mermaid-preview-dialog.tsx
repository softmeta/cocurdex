import { Copy, Download } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  MediaPreviewDialog,
  PreviewToolbarButton,
} from "@/components/media-preview";
import { Text } from "@/components/ui";
import { MermaidCopyImageIcon } from "./mermaid-copy-image-icon";
import { downloadMermaidSvg } from "./mermaid-download";
import type { SizedMermaidSvg } from "./mermaid-svg";
import { useMermaidImageCopy } from "./use-mermaid-image-copy";

const MERMAID_SCALE_LIMITS = { max: 2, min: 0.75 };

export function MermaidPreviewDialog({
  code,
  diagram,
  onClose,
}: {
  code: string;
  diagram: SizedMermaidSvg;
  onClose(): void;
}) {
  const { t } = useTranslation("common");
  const diagramRef = useRef<HTMLDivElement>(null);
  const {
    status: copyStatus,
    showStatus: showCopyStatus,
    copy,
  } = useMermaidImageCopy();

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      showCopyStatus("copied");
    } catch {
      showCopyStatus("failed");
    }
  };

  return (
    <MediaPreviewDialog
      actions={
        <>
          <PreviewToolbarButton
            label={t("mermaid.copyCode")}
            onClick={() => void copyCode()}
            tooltipSide="bottom"
          >
            <Copy className="size-3.5" />
          </PreviewToolbarButton>
          <PreviewToolbarButton
            label={t("mermaid.copyImage")}
            onClick={() => void copy(diagram, diagramRef.current)}
            tooltipSide="bottom"
          >
            <MermaidCopyImageIcon status={null} />
          </PreviewToolbarButton>
          <PreviewToolbarButton
            label={t("mermaid.download")}
            onClick={() => downloadMermaidSvg(diagram.svg)}
            tooltipSide="bottom"
          >
            <Download className="size-3.5" />
          </PreviewToolbarButton>
        </>
      }
      contentSize={diagram}
      onClose={onClose}
      scaleLimits={MERMAID_SCALE_LIMITS}
      status={
        copyStatus ? (
          <output className="me-1">
            <Text className="text-chat-fg-muted" size="meta">
              {copyStatus === "copied"
                ? t("mermaid.copied")
                : t("mermaid.copyFailed")}
            </Text>
          </output>
        ) : null
      }
      title={t("mermaid.title")}
    >
      <div
        aria-label={t("mermaid.title")}
        className="size-full [&>svg]:block [&>svg]:size-full"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Mermaid renders with securityLevel "strict", which sanitizes labels and disables scripts and click handlers.
        dangerouslySetInnerHTML={{ __html: diagram.svg }}
        ref={diagramRef}
        role="img"
      />
    </MediaPreviewDialog>
  );
}
