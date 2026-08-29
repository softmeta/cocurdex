import { formatShortcut, type ShortcutCombo } from "@/lib";
import { cn } from "@/lib/utils";

export function ShortcutKeys({
  combo,
  className,
  unboundLabel,
}: {
  combo: ShortcutCombo | null;
  className?: string;
  unboundLabel: string;
}) {
  if (!combo) {
    return (
      <span className={cn("text-meta text-muted-foreground", className)}>
        {unboundLabel}
      </span>
    );
  }

  // formatShortcut order is primary → alt → shift → key; zip with fixed roles.
  const parts = formatShortcut(combo);
  const roleOrder = ["primary", "alt", "shift", "key"] as const;
  // Skip roles for missing modifiers by aligning from the end (key is always last).
  const keyLabel = parts[parts.length - 1] ?? "";
  const modifierLabels = parts.slice(0, -1);
  const modifierRoles = roleOrder.slice(0, 3).filter((_, index) => {
    if (index === 0) return Boolean(combo.primary);
    if (index === 1) return Boolean(combo.alt);
    return Boolean(combo.shift);
  });

  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {modifierLabels.map((part, index) => (
        <kbd
          key={modifierRoles[index] ?? part}
          className="inline-flex h-5 min-w-5 items-center justify-center rounded-control border border-border/80 bg-muted/60 px-1 font-mono text-meta font-medium text-foreground"
        >
          {part}
        </kbd>
      ))}
      <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-control border border-border/80 bg-muted/60 px-1 font-mono text-meta font-medium text-foreground">
        {keyLabel}
      </kbd>
    </span>
  );
}
