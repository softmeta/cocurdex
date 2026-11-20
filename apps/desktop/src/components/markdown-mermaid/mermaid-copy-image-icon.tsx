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
