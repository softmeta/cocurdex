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
  label: string;
  className?: string;
  showTooltip?: boolean;
}

export function CopyButton({
  value,
  label,
  className,
  showTooltip = true,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (event: React.MouseEvent) => {
    event.stopPropagation();
    void navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      })
      .catch(() => {});
  };

  const button = (
    <button
      aria-label={label}
      className={cn(
        "app-no-drag flex size-4 shrink-0 items-center justify-center rounded-control text-editor-fg-subtle opacity-0 transition-opacity hover:text-editor-fg focus-visible:opacity-100 group-hover:opacity-100",
        className,
      )}
      onClick={handleCopy}
      type="button"
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
    </button>
  );

  if (!showTooltip) {
    return button;
  }

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent side="top" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
