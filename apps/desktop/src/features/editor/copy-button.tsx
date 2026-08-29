import { Check, Copy } from "lucide-react";
import { useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface CopyButtonProps {
  value: string;
  // Accessible name (and tooltip text when showTooltip is true).
  label: string;
  className?: string;
  // Default true. Turn off when the copy glyph alone is enough (e.g. next to a
  // branch name) so hover does not surface a redundant tip.
  showTooltip?: boolean;
}

// Hover-revealed copy affordance: writes `value` to the clipboard and briefly
// swaps to a check mark. Relies on an ancestor `.group` for the reveal.
export function CopyButton({
  value,
  label,
  className,
  showTooltip = true,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (event: React.MouseEvent) => {
    // Stop the click from reaching row-level handlers (e.g. collapse toggle).
    event.stopPropagation();
    void navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      })
      .catch(() => {});
  };

  const buttonClassName = cn(
    "app-no-drag flex size-4 shrink-0 items-center justify-center rounded-control text-editor-fg-subtle opacity-0 transition-opacity hover:text-editor-fg focus-visible:opacity-100 group-hover:opacity-100",
    className,
  );
  const icon = copied ? (
    <Check className="size-3" />
  ) : (
    <Copy className="size-3" />
  );

  if (!showTooltip) {
    return (
      <button
        aria-label={label}
        className={buttonClassName}
        onClick={handleCopy}
        type="button"
      >
        {icon}
      </button>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={label}
        className={buttonClassName}
        onClick={handleCopy}
        type="button"
      >
        {icon}
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
