import { GitBranch } from "lucide-react";
import { cn } from "@/lib";

interface AppGitBranchLabelProps {
  branch: string | null | undefined;
  className?: string;
  /** When set, the label becomes a button (e.g. open the git panel). */
  onClick?(): void;
  "aria-label"?: string;
}

export function AppGitBranchLabel({
  branch,
  className,
  onClick,
  "aria-label": ariaLabel,
}: AppGitBranchLabelProps) {
  if (!branch) {
    return null;
  }

  const content = (
    <>
      <GitBranch className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate">{branch}</span>
    </>
  );

  if (onClick) {
    return (
      <button
        aria-label={ariaLabel}
        className={cn(
          "flex min-w-0 max-w-full items-center gap-1.5 rounded-control text-inherit transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
        onClick={onClick}
        title={branch}
        type="button"
      >
        {content}
      </button>
    );
  }

  return (
    <span
      className={cn(
        "flex min-w-0 items-center gap-1.5 text-inherit",
        className,
      )}
      title={branch}
    >
      {content}
    </span>
  );
}
