import { useRef, useState } from "react";
import {
  SidebarListRowLabel,
  Text,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
import { AppActivityTime } from "./activity-time";
import { AppPreviewCardTooltipContent } from "./preview-card-tooltip";

function RowTitleTooltipContent({
  title,
  timestamp,
}: {
  title: string;
  timestamp?: string;
}) {
  if (!timestamp) {
    return (
      <TooltipContent side="right" sideOffset={8}>
        {title}
      </TooltipContent>
    );
  }
  return (
    <AppPreviewCardTooltipContent>
      <Text size="body" weight="medium" className="min-w-0 whitespace-normal">
        {title}
      </Text>
      <AppActivityTime timestamp={timestamp} />
    </AppPreviewCardTooltipContent>
  );
}

export function AppSidebarRowTitle({
  title,
  timestamp,
  onOpen,
  onStartRename,
}: {
  title: string;
  timestamp?: string;
  onOpen: () => void;
  onStartRename: () => void;
}) {
  const labelRef = useRef<HTMLSpanElement | null>(null);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const isTruncated = () => {
    const label = labelRef.current;
    return label !== null && label.scrollWidth > label.clientWidth;
  };

  return (
    <Tooltip
      open={tooltipOpen}
      onOpenChange={(open) => {
        setTooltipOpen(open && (Boolean(timestamp) || isTruncated()));
      }}
      disableHoverablePopup
    >
      <TooltipTrigger asChild>
        <button
          type="button"
          className="flex h-6 min-w-0 flex-1 items-center overflow-hidden text-start"
          onClick={onOpen}
          onDoubleClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onStartRename();
          }}
        >
          <SidebarListRowLabel ref={labelRef}>{title}</SidebarListRowLabel>
        </button>
      </TooltipTrigger>
      <RowTitleTooltipContent timestamp={timestamp} title={title} />
    </Tooltip>
  );
}
