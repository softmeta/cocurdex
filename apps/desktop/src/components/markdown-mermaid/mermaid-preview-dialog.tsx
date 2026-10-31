import { Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CodeBlockCopyButton } from "streamdown";
import {
  MediaPreviewDialog,
  PreviewToolbarButton,
} from "@/components/media-preview";
import { downloadMermaidSvg } from "./mermaid-download";
import type { SizedMermaidSvg } from "./mermaid-svg";

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

  return (
    <MediaPreviewDialog
      actions={
        <>
          <CodeBlockCopyButton
            className="flex size-6 items-center justify-center rounded-control text-chat-fg-muted hover:bg-muted hover:text-chat-fg dark:hover:bg-muted/50"
            code={code}
          />
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
      title={t("mermaid.title")}
    >
      <div
        aria-label={t("mermaid.title")}
        className="size-full [&>svg]:block [&>svg]:size-full"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Mermaid renders with securityLevel "strict", which sanitizes labels and disables scripts and click handlers.
        dangerouslySetInnerHTML={{ __html: diagram.svg }}
        role="img"
      />
    </MediaPreviewDialog>
  );
}
