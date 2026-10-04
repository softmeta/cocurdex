import { FileText } from "lucide-react";

import type { ToolCallPreviewLocation } from "./tool-call-utils";

export function ToolCallResourceLinkList({
  links,
  onOpenToolLocation,
}: {
  links: ToolCallPreviewLocation[];
  onOpenToolLocation?: (location: ToolCallPreviewLocation) => void;
}) {
  return (
    <ul className="mb-1.5 flex flex-col gap-0.5">
      {links.map((link) => (
        <li key={link.filePath}>
          <button
            className="flex w-full min-w-0 items-center gap-2 rounded-control px-2 py-1 text-left font-mono text-chat-fg-secondary text-body transition-colors [font-variant-ligatures:none] hover:bg-chat-surface-tint-hover"
            onClick={() => onOpenToolLocation?.(link)}
            type="button"
          >
            <FileText className="size-3.5 shrink-0 text-chat-fg-muted" />
            <span className="min-w-0 truncate">{link.filePath}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
