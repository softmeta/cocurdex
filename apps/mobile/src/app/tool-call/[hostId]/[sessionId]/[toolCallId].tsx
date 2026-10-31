import { useLocalSearchParams } from "expo-router";
import { ToolCallScreen } from "@/session-detail";

export default function ToolCallRoute() {
  const { hostId, sessionId, toolCallId } = useLocalSearchParams<{
    hostId: string;
    sessionId: string;
    toolCallId: string;
  }>();
  return (
    <ToolCallScreen
      hostId={hostId}
      sessionId={sessionId}
      toolCallId={toolCallId}
    />
  );
}
