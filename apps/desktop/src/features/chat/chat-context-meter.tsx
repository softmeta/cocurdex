import type { AgentProviderSnapshot } from "@cocurdex/shared";
import { useAtomValue } from "jotai";
import {
  ContextUsageMeter,
  getSessionContextTokens,
  sessionUsageAtom,
} from "@/features/composer";
import { findProviderModel, providerModelsAtom } from "@/features/sessions";

export function ChatContextMeter({
  sessionId,
  snapshot,
}: {
  sessionId: string;
  snapshot: AgentProviderSnapshot | null | undefined;
}) {
  const usage = useAtomValue(sessionUsageAtom)[sessionId];
  const providerModels = useAtomValue(providerModelsAtom);
  const model = snapshot
    ? findProviderModel(providerModels, snapshot.providerId, snapshot.modelId)
    : null;

  return (
    <ContextUsageMeter
      contextLimit={
        model?.contextLimit ??
        snapshot?.modelContextWindow ??
        usage?.contextWindowSize ??
        null
      }
      used={usage ? getSessionContextTokens(usage) : null}
    />
  );
}
