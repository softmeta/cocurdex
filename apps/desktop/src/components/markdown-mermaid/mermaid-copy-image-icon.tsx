import type { TFunction } from "i18next";
import { Check, Image as ImageIcon } from "lucide-react";
import type { CopyStatus } from "@/components/media-preview";

export function MermaidCopyImageIcon({
  status,
}: {
  status: CopyStatus | null;
}) {
  return status === "copied" ? (
    <Check className="size-3.5" />
  ) : (
    <ImageIcon className="size-3.5" />
  );
}

export function mermaidCopyImageLabel(
  t: TFunction<"common">,
  status: CopyStatus | null,
): string {
  if (status === "copied") return t("mermaid.copied");
  if (status === "failed") return t("mermaid.copyFailed");
  return t("mermaid.copyImage");
}
