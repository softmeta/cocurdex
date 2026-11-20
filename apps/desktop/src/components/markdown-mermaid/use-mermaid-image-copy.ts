import { useTemporaryCopyStatus } from "@/components/media-preview";
import { copyMermaidImage } from "./mermaid-image";
import type { SizedMermaidSvg } from "./mermaid-svg";

const COPY_STATUS_MS = 1800;

export function useMermaidImageCopy() {
  const [status, showStatus] = useTemporaryCopyStatus(COPY_STATUS_MS);
  const copy = async (
    diagram: SizedMermaidSvg,
    backgroundSource: Element | null,
  ) => {
    try {
      await copyMermaidImage(diagram, backgroundSource);
      showStatus("copied");
    } catch {
      showStatus("failed");
    }
  };
  return { status, showStatus, copy };
}
