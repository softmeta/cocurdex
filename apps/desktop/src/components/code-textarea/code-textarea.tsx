import { Fragment } from "react";
import { cn } from "@/lib";
import { shellTokenStyle, useShellTokenLines } from "./use-shell-token-lines";
import "./code-textarea.css";

interface CodeTextareaProps {
  "aria-label"?: string;
  className?: string;
  onChange(value: string): void;
  placeholder?: string;
  value: string;
}

// A textarea with syntax highlighting drawn underneath it. The two layers sit
// in one grid cell, so the scroll container is the wrapper and both scroll
// together; the textarea is on top and owns the caret, selection, and input.
export function CodeTextarea({
  "aria-label": ariaLabel,
  className,
  onChange,
  placeholder,
  value,
}: CodeTextareaProps) {
  const tokenLines = useShellTokenLines(value);

  const isHighlighted = tokenLines !== null;

  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(0,1fr)] resize-y overflow-y-auto rounded-control border border-border/70 bg-background/60 font-mono text-body shadow-none transition-colors has-[:focus-visible]:border-ring/60 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/20",
        className,
      )}
    >
      {tokenLines ? (
        <pre
          aria-hidden="true"
          className={cn(
            "code-textarea-layer col-start-1 row-start-1 m-0 min-w-0 px-2.5 py-2 break-words whitespace-pre-wrap pointer-events-none select-none overflow-hidden",
          )}
        >
          {tokenLines.map((line, lineIndex) => (
            // Tokens carry their own newlines in the inline flow, so lines are
            // joined with an explicit one to match the textarea's wrapping.
            // biome-ignore lint/suspicious/noArrayIndexKey: the layers are a pure render of `value`; lines never reorder or keep state
            <Fragment key={lineIndex}>
              {lineIndex > 0 ? "\n" : null}
              {line.map((token, tokenIndex) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: tokens are a pure render of `value` and never reorder
                <span key={tokenIndex} style={shellTokenStyle(token)}>
                  {token.content}
                </span>
              ))}
            </Fragment>
          ))}
        </pre>
      ) : null}
      <textarea
        aria-label={ariaLabel}
        className={cn(
          "code-textarea-layer col-start-1 row-start-1 m-0 min-w-0 px-2.5 py-2 break-words whitespace-pre-wrap w-full resize-none border-0 bg-transparent outline-none field-sizing-content placeholder:text-muted-foreground",
          isHighlighted
            ? "text-transparent caret-foreground selection:bg-foreground/25"
            : "text-foreground",
        )}
        placeholder={placeholder}
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
