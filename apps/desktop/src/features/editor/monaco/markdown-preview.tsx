import { useRef } from "react";
import { MarkdownRenderer } from "@/components";
import {
  DOCUMENT_OUTLINE_CONTAINER_CLASS,
  DocumentOutlineMenu,
  DocumentOutlineRail,
  useDocumentOutline,
} from "@/components/document-outline";
import { ScrollArea } from "@/components/ui";
import { cn } from "@/lib";

export function MarkdownPreview({ content }: { content: string }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const outline = useDocumentOutline(scrollerRef, contentRef);
  const hasOutline = outline.headings.length > 0;

  return (
    <div
      className={cn("relative flex h-full", DOCUMENT_OUTLINE_CONTAINER_CLASS)}
    >
      <ScrollArea
        className="h-full min-w-0 flex-1"
        viewportProps={{ className: "flex" }}
        viewportRef={scrollerRef}
      >
        <div
          className={cn(
            "min-w-0 flex-1 p-6",
            hasOutline && "@max-[896px]/outline:pe-12",
          )}
          ref={contentRef}
        >
          <MarkdownRenderer
            content={content}
            tone="editor"
            className="space-y-4"
          />
        </div>
        <DocumentOutlineRail
          activeKey={outline.activeKey}
          headings={outline.headings}
        />
      </ScrollArea>
      <DocumentOutlineMenu
        activeKey={outline.activeKey}
        headings={outline.headings}
      />
    </div>
  );
}
