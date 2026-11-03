import { ChevronRight } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingsGroup } from "@/components/app";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Text,
} from "@/components/ui";
import { cn } from "@/lib";

export function MissingAdaptersGroup({
  children,
  count,
}: {
  children: ReactNode;
  count: number;
}) {
  const { t } = useTranslation("settings");
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className="flex h-8 items-center gap-1.5 px-1 text-start text-muted-foreground hover:text-foreground"
        type="button"
      >
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 transition-transform",
            open && "rotate-90",
          )}
        />
        <Text size="meta" weight="medium">
          {t("adapters.notInstalledGroup", { count })}
        </Text>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        <SettingsGroup>{children}</SettingsGroup>
      </CollapsibleContent>
    </Collapsible>
  );
}
