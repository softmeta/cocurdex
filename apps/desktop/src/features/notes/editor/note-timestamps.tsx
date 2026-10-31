import { useTranslation } from "react-i18next";
import { Text, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui";
import { useActivityTimeLabel } from "@/lib/relative-time";

export function NoteTimestamps({
  createdAt,
  updatedAt,
}: {
  createdAt: string;
  updatedAt: string;
}) {
  const { t } = useTranslation("notes");
  const created = useActivityTimeLabel(createdAt);
  const updated = useActivityTimeLabel(updatedAt);
  if (!updated) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Text
          as="time"
          dateTime={updatedAt}
          size="meta"
          tone="muted"
          className="w-fit tabular-nums"
        >
          {t("editor.timestamps.edited", { time: updated.relative })}
        </Text>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start">
        <div className="flex flex-col gap-0.5 tabular-nums">
          {created ? (
            <span>
              {t("editor.timestamps.createdAt", { time: created.absolute })}
            </span>
          ) : null}
          <span>
            {t("editor.timestamps.editedAt", { time: updated.absolute })}
          </span>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
