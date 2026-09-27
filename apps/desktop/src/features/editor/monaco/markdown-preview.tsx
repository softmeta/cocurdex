import { ListTree } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  AppDropdownContent,
  AppDropdownItem,
  compactDropdownContentClassName,
  MarkdownRenderer,
} from "@/components";
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  Text,
} from "@/components/ui";
import { cn } from "@/lib";
import {
  type PreviewHeading,
  usePreviewHeadings,
} from "./use-preview-headings";

const HEADING_INDENT_CLASS_NAMES: Record<number, string> = {
  1: "ps-3",
  2: "ps-3",
  3: "ps-6",
  4: "ps-9",
};

interface PreviewTocProps {
  activeKey: string | null;
  headings: PreviewHeading[];
}

function scrollToHeading(heading: PreviewHeading) {
  heading.element.scrollIntoView({ block: "start" });
}

function PreviewTocRail({ activeKey, headings }: PreviewTocProps) {
  const { t } = useTranslation("editor");

  return (
    <nav
      aria-label={t("preview.toc")}
      className="hidden w-56 shrink-0 overflow-y-auto py-6 pe-4 @4xl/preview:block"
    >
      <Text
        as="div"
        size="meta"
        tone="muted"
        weight="medium"
        className="mb-2 ps-3"
      >
        {t("preview.toc")}
      </Text>
      <ul className="border-s border-border/70">
        {headings.map((heading) => (
          <li key={heading.key}>
            <button
              className={cn(
                "-ms-px block w-full truncate border-s-2 border-transparent py-1 pe-2 text-start text-meta text-muted-foreground transition-colors hover:text-foreground",
                HEADING_INDENT_CLASS_NAMES[heading.level],
                heading.key === activeKey && "border-primary text-foreground",
              )}
              onClick={() => scrollToHeading(heading)}
              title={heading.text}
              type="button"
            >
              {heading.text}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function PreviewTocMenu({ activeKey, headings }: PreviewTocProps) {
  const { t } = useTranslation("editor");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={t("preview.toc")}
            className="absolute end-4 top-4 bg-background/80 text-muted-foreground @4xl/preview:hidden"
            size="icon-sm"
            title={t("preview.toc")}
            variant="ghost"
          />
        }
      >
        <ListTree className="size-4" />
      </DropdownMenuTrigger>
      <AppDropdownContent
        align="end"
        className={cn("max-w-72", compactDropdownContentClassName)}
      >
        {headings.map((heading) => (
          <AppDropdownItem
            className={HEADING_INDENT_CLASS_NAMES[heading.level]}
            key={heading.key}
            onClick={() => scrollToHeading(heading)}
            selected={heading.key === activeKey}
          >
            <span className="min-w-0 truncate">{heading.text}</span>
          </AppDropdownItem>
        ))}
      </AppDropdownContent>
    </DropdownMenu>
  );
}

export function MarkdownPreview({ content }: { content: string }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const { activeKey, headings } = usePreviewHeadings(scrollerRef, contentRef);
  const hasToc = headings.length > 1;

  return (
    <div className="@container/preview relative flex h-full">
      <div
        className={cn(
          "h-full min-w-0 flex-1 overflow-auto p-6",
          hasToc && "pe-12 @4xl/preview:pe-6",
        )}
        ref={scrollerRef}
      >
        <div ref={contentRef}>
          <MarkdownRenderer
            content={content}
            tone="editor"
            className="space-y-4"
          />
        </div>
      </div>
      {hasToc ? (
        <>
          <PreviewTocRail activeKey={activeKey} headings={headings} />
          <PreviewTocMenu activeKey={activeKey} headings={headings} />
        </>
      ) : null}
    </div>
  );
}
