import { useAtomValue } from "jotai";
import { Text } from "@/components/ui";
import { cn } from "@/lib";
import { issueLabelsByIdAtom } from "./issues-store";

export function IssueLabelChips({
  labelIds,
  className,
}: {
  labelIds: readonly string[];
  className?: string;
}) {
  const labelsById = useAtomValue(issueLabelsByIdAtom);
  const labels = labelIds.flatMap((id) => labelsById.get(id) ?? []);
  if (labels.length === 0) {
    return null;
  }
  return (
    <span
      className={cn("flex min-w-0 flex-wrap items-center gap-1", className)}
    >
      {labels.map((label) => (
        <Text
          key={label.id}
          as="span"
          size="meta"
          truncate
          className="inline-flex h-5 max-w-32 items-center gap-1 rounded-full border border-editor-border/70 px-1.5 text-editor-fg-muted"
        >
          <span
            className="size-1.5 shrink-0 rounded-full bg-editor-fg-subtle"
            style={label.color ? { backgroundColor: label.color } : undefined}
            aria-hidden
          />
          {label.name}
        </Text>
      ))}
    </span>
  );
}
