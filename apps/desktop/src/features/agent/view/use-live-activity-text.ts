import type { ActivityKind, ActivityState } from "@cocurdex/client-runtime";
import { useTranslation } from "react-i18next";
import { useChatPresentation } from "../chat-display";
import { useActiveToolCallLabel } from "../tool-call/use-tool-call-trigger-parts";
import { useSettledLabel } from "./use-settled-label";

export type LiveActivityText = {
  title: string;
  secondary: string;
  handling: boolean;
};

function liveActivityKind(
  kind: ActivityKind,
  presentation: ReturnType<typeof useChatPresentation>,
): ActivityKind {
  return presentation === "chat" && kind === "planning" ? "thinking" : kind;
}

export function useLiveActivityText(
  activity: ActivityState | null | undefined,
): LiveActivityText {
  const { t } = useTranslation("agent");
  const presentation = useChatPresentation();
  const tool = useActiveToolCallLabel(activity?.activeToolCall);
  const handling = activity?.kind === "usingTools";
  const wanted: LiveActivityText =
    tool && (tool.title || tool.secondary)
      ? { title: tool.title, secondary: tool.secondary ?? "", handling }
      : {
          title: activity
            ? t(`activity.${liveActivityKind(activity.kind, presentation)}`)
            : "",
          secondary: "",
          handling,
        };
  return useSettledLabel(
    [wanted.title, wanted.secondary, String(handling)].join("\u0000"),
    wanted,
  );
}
