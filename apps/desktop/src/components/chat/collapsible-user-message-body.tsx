import { ChevronDown, ChevronUp } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib";
import { isLongUserMessageText } from "./collapsible-user-message";

export function CollapsibleUserMessageBody({
  children,
  text,
}: {
  children: ReactNode;
  text: string;
}) {
  const { t } = useTranslation("common");
  const [expanded, setExpanded] = useState(false);
  const shouldCollapse = isLongUserMessageText(text);

  if (!shouldCollapse) {
    return children;
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div
        className={cn(
          "min-w-0",
          !expanded &&
            "max-h-40 overflow-hidden [mask-image:linear-gradient(to_bottom,black_calc(100%-2.5rem),transparent)]",
        )}
      >
        {children}
      </div>
      <button
        aria-expanded={expanded}
        className="inline-flex items-center gap-1 self-start text-meta text-chat-fg-muted hover:text-chat-fg"
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >
        {expanded ? (
          <ChevronUp className="size-3.5" />
        ) : (
          <ChevronDown className="size-3.5" />
        )}
        {expanded
          ? t("message.showLess", { defaultValue: "Show less" })
          : t("message.showMore", { defaultValue: "Show more" })}
      </button>
    </div>
  );
}
