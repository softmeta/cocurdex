import { useRef } from "react";
import { MarkdownRenderer } from "@/components";
import {
  DOCUMENT_OUTLINE_WIDE_MIN_WIDTH_PX,
  DocumentOutline,
  useDocumentOutline,
  useIsWiderThan,
} from "@/components/document-outline";
import { ScrollArea } from "@/components/ui";
import { cn } from "@/lib";

export function MarkdownPreview({ content }: { content: string }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const outline = useDocumentOutline(scrollerRef, contentRef);
  const isWide = useIsWiderThan(
    containerRef,
    DOCUMENT_OUTLINE_WIDE_MIN_WIDTH_PX,
  );
  const hasMenu = outline.headings.length > 0 && !isWide;

  return (
    <div className="relative flex h-full" ref={containerRef}>
      <ScrollArea className="h-full min-w-0 flex-1" viewportRef={scrollerRef}>
        <div className={cn("p-6", hasMenu && "pe-12")} ref={contentRef}>
          <MarkdownRenderer
            content={content}
            tone="editor"
            className="space-y-4"
          />
        </div>
      </ScrollArea>
      <DocumentOutline
        activeKey={outline.activeKey}
        headings={outline.headings}
        wide={isWide}
      />
    </div>
  );
}
