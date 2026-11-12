import {
  getChatThinkingLevelOptions,
  resolveChatThinkingLevel,
  type SavedHost,
} from "@cocurdex/client-runtime";
import {
  type AgentThinkingLevel,
  createProviderSnapshotForModel,
  type SessionRecord,
  sessionConfigurationOf,
} from "@cocurdex/shared";
import { hostConnection } from "@/connection";
import { type ChatModel, useChatModels } from "./chat-models";
import { ChatRuntimeControls } from "./chat-runtime-controls";

export function ChatSessionRuntime({
  host,
  session,
  onFailed,
}: {
  host: SavedHost;
  session: SessionRecord;
  onFailed(): void;
}) {
  const models = useChatModels(host.hostId);
  const snapshot = session.providerSnapshot ?? null;
  const thinkingLevel = resolveChatThinkingLevel(
    getChatThinkingLevelOptions(snapshot),
    snapshot?.thinkingLevel,
    "off",
  );
  const selected =
    models.data?.find(
      ({ provider, model }) =>
        provider.id === snapshot?.providerId &&
        model.modelId === snapshot.modelId,
    ) ?? null;

  const configure = (providerSnapshot: NonNullable<typeof snapshot>) => {
    void hostConnection(host.hostId)
      .request("session.configure", {
        ...sessionConfigurationOf(session),
        providerSnapshot,
      })
      .catch(onFailed);
  };

  const chooseModel = (entry: ChatModel) => {
    const next = createProviderSnapshotForModel(entry);
    configure({
      ...next,
      thinkingLevel: resolveChatThinkingLevel(
        getChatThinkingLevelOptions(next),
        thinkingLevel,
        "off",
      ),
    });
  };

  const chooseThinkingLevel = (level: AgentThinkingLevel) => {
    if (snapshot) configure({ ...snapshot, thinkingLevel: level });
  };

  return (
    <ChatRuntimeControls
      models={models.data ?? []}
      selected={selected}
      snapshot={snapshot}
      thinkingLevel={thinkingLevel}
      onModel={chooseModel}
      onThinkingLevel={chooseThinkingLevel}
    />
  );
}
