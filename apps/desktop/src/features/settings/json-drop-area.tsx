import { FileUp } from "lucide-react";
import type { ReactNode } from "react";
import { Text } from "@/components/ui";
import { cn } from "@/lib";
import {
  type JsonTextHandler,
  useFileDropTarget,
  useJsonFileImport,
} from "./json-file-import";

export interface JsonDropMessages {
  invalidFile: string;
  dropActive: string;
  dropHint: string;
}

export function JsonDropArea({
  label,
  className,
  messages,
  onText,
  children,
}: {
  label?: string;
  className?: string;
  messages: JsonDropMessages;
  onText: JsonTextHandler;
  children: ReactNode;
}) {
  const { importFiles } = useJsonFileImport({
    invalidFileMessage: messages.invalidFile,
    onText,
  });
  const { isDraggingFile, dropHandlers } = useFileDropTarget(importFiles);

  return (
    <section
      aria-label={label}
      className="relative flex min-h-0 min-w-0 flex-1 flex-col"
      {...dropHandlers}
    >
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1",
          className,
          isDraggingFile && "opacity-30",
        )}
      >
        {children}
      </div>
      {isDraggingFile ? (
        <div
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-card border border-dashed border-foreground/40 bg-background/80 text-center"
          role="status"
        >
          <FileUp className="mb-2 size-6 text-muted-foreground" />
          <Text size="sm" weight="medium">
            {messages.dropActive}
          </Text>
          <Text size="xs" tone="muted">
            {messages.dropHint}
          </Text>
        </div>
      ) : null}
    </section>
  );
}
