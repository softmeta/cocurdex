import { Text } from "@/components/ui";

interface SlashCommandPreviewProps {
  description: string;
}

export function SlashCommandPreview({ description }: SlashCommandPreviewProps) {
  return (
    <div className="w-70 shrink-0">
      <Text
        as="p"
        className="whitespace-pre-wrap break-words px-1.5 py-1 text-muted-foreground"
        size="meta"
      >
        {description}
      </Text>
    </div>
  );
}
