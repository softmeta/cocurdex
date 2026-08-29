import { cn } from "@/lib";

interface CocurdexMarkProps {
  className?: string;
  /** Welcome-surface hover: redraw the C, then blink the prompt caret. */
  interactive?: boolean;
}

/** App mark used on the boot splash and the empty-session greeting. */
export function CocurdexMark({
  className,
  interactive = false,
}: CocurdexMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={cn(
        "text-brand-mark",
        interactive && "cocurdex-mark-live",
        className,
      )}
      fill="none"
      role="presentation"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth={2.75}
      viewBox="0 0 24 24"
    >
      <path
        className="cocurdex-mark-body"
        d="M16 7.25h-5.25A3.25 3.25 0 0 0 7.5 10.5v3.25a3.25 3.25 0 0 0 3.25 3.25h.5"
        pathLength={1}
      />
      <path
        className="cocurdex-mark-caret"
        d="M14.25 13.5h2.25"
        pathLength={1}
      />
    </svg>
  );
}
