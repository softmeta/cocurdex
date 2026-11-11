import { useTranslation } from "react-i18next";
import { useActiveToolCallLabel } from "../tool-call/use-tool-call-trigger-parts";
import type { ActivityState } from "./chat-activity-state";
import { useSettledLabel } from "./use-settled-label";

export type LiveActivityText = {
  title: string;
  secondary: string;
  handling: boolean;
};

export function useLiveActivityText(
  activity: ActivityState | null | undefined,
): LiveActivityText {
  const { t } = useTranslation("agent");
  const tool = useActiveToolCallLabel(activity?.activeToolCall);
  const handling = activity?.kind === "usingTools";
  const wanted: LiveActivityText =
    tool && (tool.title || tool.secondary)
      ? { title: tool.title, secondary: tool.secondary ?? "", handling }
      : {
          title: activity ? t(`activity.${activity.kind}`) : "",
          secondary: "",
          handling,
        };
  return useSettledLabel(
    [wanted.title, wanted.secondary, String(handling)].join("\u0000"),
    wanted,
  );
}
