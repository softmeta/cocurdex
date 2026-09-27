import { ListTree } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AppDropdownContent,
  AppDropdownItem,
  MarkdownRenderer,
} from "@/components";
import { Button, DropdownMenu, DropdownMenuTrigger } from "@/components/ui";

interface PreviewHeading {
  element: HTMLElement;
  key: string;
  level: number;
  text: string;
}

const HEADING_SELECTOR = "h1, h2, h3, h4";

const HEADING_INDENT_CLASS_NAMES: Record<number, string> = {
  1: "ps-2.5",
  2: "ps-5",
  3: "ps-8",
  4: "ps-11",
};

function collectHeadings(root: HTMLElement | null): PreviewHeading[] {
  if (!root) {
    return [];
  }
  return Array.from(root.querySelectorAll<HTMLElement>(HEADING_SELECTOR))
    .map((element, index) => ({
      element,
      key: String(index),
      level: Number(element.tagName.slice(1)),
      text: element.textContent?.trim() ?? "",
    }))
    .filter((heading) => heading.text !== "");
}

export function MarkdownPreview({ content }: { content: string }) {
  const { t } = useTranslation("editor");
  const contentRef = useRef<HTMLDivElement>(null);
  const [headings, setHeadings] = useState<PreviewHeading[]>([]);

  return (
    <div className="relative h-full">
      <div className="h-full overflow-auto p-6 pe-12" ref={contentRef}>
        <MarkdownRenderer
          content={content}
          tone="editor"
          className="space-y-4"
        />
      </div>
      <DropdownMenu
        onOpenChange={(open) => {
          if (open) {
            setHeadings(collectHeadings(contentRef.current));
          }
        }}
      >
        <DropdownMenuTrigger
          render={
            <Button
              aria-label={t("preview.toc")}
              className="absolute end-4 top-4 bg-background/80 text-muted-foreground"
              size="icon-sm"
              title={t("preview.toc")}
              variant="ghost"
            />
          }
        >
          <ListTree className="size-4" />
        </DropdownMenuTrigger>
        <AppDropdownContent align="end" className="max-w-80">
          {headings.length === 0 ? (
            <AppDropdownItem disabled>{t("preview.tocEmpty")}</AppDropdownItem>
          ) : (
            headings.map((heading) => (
              <AppDropdownItem
                className={HEADING_INDENT_CLASS_NAMES[heading.level]}
                key={heading.key}
                onClick={() =>
                  heading.element.scrollIntoView({ block: "start" })
                }
              >
                <span className="min-w-0 truncate">{heading.text}</span>
              </AppDropdownItem>
            ))
          )}
        </AppDropdownContent>
      </DropdownMenu>
    </div>
  );
}
