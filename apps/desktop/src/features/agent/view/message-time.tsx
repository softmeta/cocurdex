import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui";
import { i18n } from "@/i18n";
import { cn } from "@/lib";

function formatShortTime(date: Date) {
  return new Intl.DateTimeFormat(i18n.language, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function formatExactTime(date: Date) {
  return new Intl.DateTimeFormat(i18n.language, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function MessageTime({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const date = new Date(value);
  return (
    <Tooltip disableHoverablePopup>
      <TooltipTrigger asChild>
        <time
          className={cn("text-xs tabular-nums", className)}
          dateTime={value}
        >
          {formatShortTime(date)}
        </time>
      </TooltipTrigger>
      <TooltipContent side="top">{formatExactTime(date)}</TooltipContent>
    </Tooltip>
  );
}
