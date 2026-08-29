import { useState } from "react";
import { Checkbox } from "@/components/ui";
import { cn } from "@/lib";
import type { MarkdownRendererTone } from "./markdown-renderer-styles";

interface MarkdownTaskCheckboxProps {
  checked?: boolean;
  disabled?: boolean;
  tone: MarkdownRendererTone;
}

export function MarkdownTaskCheckbox({
  checked = false,
  disabled,
  tone,
}: MarkdownTaskCheckboxProps) {
  const [isChecked, setIsChecked] = useState(checked);

  return (
    <Checkbox
      checked={isChecked}
      disabled={disabled}
      onCheckedChange={(checked) => setIsChecked(checked === true)}
      className={cn(
        "mr-2 size-3.5 align-[-0.125em]",
        tone === "editor" ? "text-editor-fg" : "text-chat-link",
      )}
      aria-label={isChecked ? "Mark task incomplete" : "Mark task complete"}
    />
  );
}
