import { ListTree } from "lucide-react";
import { useId, useRef } from "react";
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
import {
  type OutlineTrackRow,
  outlineTrackPath,
  useOutlineTrack,
} from "./use-outline-track";

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

function OutlineTrack({
  activeIndex,
  rows,
}: {
  activeIndex: number;
  rows: OutlineTrackRow[];
}) {
  const clipId = `outline-track-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;
  const active = rows[activeIndex];
  const path = outlineTrackPath(rows);

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 size-full overflow-visible rtl:-scale-x-100"
    >
      <path d={path} fill="none" className="stroke-border" strokeWidth={1} />
      {active ? (
        <>
          <clipPath id={clipId}>
            <rect
              className="transition-[y,height] duration-200 ease-out"
              height={active.bottom - active.top}
              width="100%"
              x={0}
              y={active.top}
            />
          </clipPath>
          <path
            clipPath={`url(#${clipId})`}
            d={path}
            fill="none"
            className="stroke-primary/55 dark:stroke-primary"
            strokeWidth={2}
          />
        </>
      ) : null}
    </svg>
  );
}

export function DocumentOutlineRail({ activeKey, headings }: OutlineProps) {
  const { t } = useTranslation();
  const listRef = useRef<HTMLUListElement>(null);
  const rows = useOutlineTrack(listRef, headings);
  if (headings.length === 0) {
    return null;
  }
  const activeIndex = headings.findIndex(
    (heading) => heading.key === activeKey,
  );

  return (
    <nav
      aria-label={t("outline")}
      className="sticky top-6 mt-6 flex max-h-[60vh] w-56 shrink-0 flex-col self-start pe-4"
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
      <div className="min-h-0 overflow-y-auto">
        <div className="relative">
          <OutlineTrack activeIndex={activeIndex} rows={rows} />
          <ul ref={listRef}>
            {headings.map((heading) => (
              <li key={heading.key}>
                <button
                  className={cn(
                    "block w-full truncate py-0.5 pe-2 text-start text-meta text-muted-foreground transition-colors hover:text-foreground",
                    HEADING_INDENT_CLASS_NAMES[heading.level],
                    heading.key === activeKey && "text-foreground",
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
        </div>
      </div>
    </nav>
  );
}

export function DocumentOutlineMenu({ activeKey, headings }: OutlineProps) {
  const { t } = useTranslation();
  if (headings.length === 0) {
    return null;
  }

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
