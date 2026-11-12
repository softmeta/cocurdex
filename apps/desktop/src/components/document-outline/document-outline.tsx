import { ListTree } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppDropdownContent, AppDropdownItem } from "@/components/app";
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  Text,
} from "@/components/ui";
import { cn } from "@/lib";
import type { DocumentHeading } from "./use-document-outline";

const HEADING_INDENT_CLASS_NAMES: Record<number, string> = {
  1: "ps-3",
  2: "ps-3",
  3: "ps-6",
  4: "ps-9",
};

interface OutlineProps {
  activeKey: string | null;
  headings: DocumentHeading[];
}

function scrollToHeading(heading: DocumentHeading) {
  heading.element.scrollIntoView({ block: "start" });
}

function OutlineRail({ activeKey, headings }: OutlineProps) {
  const { t } = useTranslation();

  return (
    <nav
      aria-label={t("outline")}
      className="mt-6 flex max-h-[60%] w-56 shrink-0 flex-col self-start pe-4"
    >
      <Text
        as="div"
        size="meta"
        tone="muted"
        weight="medium"
        className="mb-2 shrink-0 ps-3"
      >
        {t("outline")}
      </Text>
      <ul className="min-h-0 overflow-y-auto border-s border-border/70">
        {headings.map((heading) => (
          <li key={heading.key}>
            <button
              className={cn(
                "-ms-px block w-full truncate border-s-2 border-transparent py-0.5 pe-2 text-start text-meta text-muted-foreground transition-colors hover:text-foreground",
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

function OutlineMenu({ activeKey, headings }: OutlineProps) {
  const { t } = useTranslation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={t("outline")}
            className="absolute end-4 top-4 bg-background/80 text-muted-foreground"
            size="icon-sm"
            title={t("outline")}
            variant="ghost"
          />
        }
      >
        <ListTree className="size-4" />
      </DropdownMenuTrigger>
      <AppDropdownContent
        align="end"
        className="max-h-[min(24rem,var(--available-height))]! max-w-72"
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

export function DocumentOutline({
  activeKey,
  headings,
  wide,
}: OutlineProps & { wide: boolean }) {
  if (headings.length === 0) {
    return null;
  }
  if (wide) {
    return <OutlineRail activeKey={activeKey} headings={headings} />;
  }
  return <OutlineMenu activeKey={activeKey} headings={headings} />;
}
