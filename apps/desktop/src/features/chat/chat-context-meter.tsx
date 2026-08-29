import type { ConversationMessageRecord } from "@cocurdex/shared";
import { useAtomValue } from "jotai";
import { ContextUsageMeter } from "@/features/composer";
import { findProviderModel, providerModelsAtom } from "@/features/sessions";

interface ConversationContextMeterProps {
  providerId: string | null;
  modelId: string | null;
  messages: ConversationMessageRecord[];
}

// Context usage for chat mode, mirroring the agent-mode ContextWindowIndicator
// ring. The model itself is shown by the adjacent ModelPicker, so the meter
// renders the ring only. "Used" is the last assistant turn's total tokens —
// its input already covers the full prompt history, so input + output is the
// live context size.
function lastTurnTokens(messages: ConversationMessageRecord[]): number | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const usage = messages[i].usage;
    if (!usage) continue;
    if (usage.totalTokens != null) return usage.totalTokens;
    const input = usage.inputTokens ?? 0;
    const output = usage.outputTokens ?? 0;
    if (input > 0 || output > 0) return input + output;
  }
  return null;
}

export function ConversationContextMeter({
  providerId,
  modelId,
  messages,
}: ConversationContextMeterProps) {
  const providerModels = useAtomValue(providerModelsAtom);
  const model =
    providerId && modelId
      ? findProviderModel(providerModels, providerId, modelId)
      : null;

  return (
    <ContextUsageMeter
      contextLimit={model?.contextLimit ?? null}
      used={lastTurnTokens(messages)}
    />
  );
}
