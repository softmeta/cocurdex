import type { ApplicationConnection } from "@cocurdex/shared";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppStatusDot } from "@/components";
import {
  applicationAccessLabel,
  applicationStateLabel,
  applicationStateTone,
} from "./application-state";

export function ApplicationConnectionRow({
  connection,
  onOpen,
}: {
  connection: ApplicationConnection;
  onOpen(): void;
}) {
  const { t } = useTranslation("personal");
  const state = applicationStateLabel(connection, t);
  return (
    <button
      type="button"
      data-application-id={connection.id}
      onClick={onOpen}
      className="group flex w-full items-center gap-3 py-3.5 text-start"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-body">{connection.displayName}</span>
        <span className="truncate text-meta text-muted-foreground">
          {applicationAccessLabel(connection, t)}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-meta text-muted-foreground">
        <AppStatusDot label={state} tone={applicationStateTone(connection)} />
        {state}
      </span>
      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground rtl:rotate-180" />
    </button>
  );
}
