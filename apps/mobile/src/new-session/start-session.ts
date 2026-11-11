import type { HostConnection } from "@cocurdex/client-runtime";
import { generateLocalSessionTitle } from "@cocurdex/client-runtime";
import type {
  CreateSessionPayload,
  ImageAttachment,
  NewSessionDefaults,
  SessionRecord,
  SessionRuntimeSelection,
} from "@cocurdex/shared";

export type StartConnection = Pick<HostConnection, "request" | "command">;

export interface StartRequest<Payload = CreateSessionPayload> {
  payload: Payload;
  prompt: string;
  attachments: ImageAttachment[];
  fallbackTitle: string;
}

interface UnsentStart {
  key: string;
  session: SessionRecord;
  messageId: string;
}

export function shownSessionPayload(
  workspaceId: string,
  defaults: NewSessionDefaults,
  agentRoleId: string | null = null,
  runtime?: SessionRuntimeSelection,
): CreateSessionPayload {
  return {
    workspaceId,
    agentType: defaults.agentType,
    model: defaults.model
      ? {
          providerId: defaults.model.providerId,
          modelId: defaults.model.modelId,
        }
      : null,
    permissionMode: defaults.permissionMode,
    agentRoleId,
    ...(runtime ? { runtime } : {}),
  };
}

export function createSessionStarter(connection: StartConnection) {
  return createConversationStarter(
    connection,
    (payload: CreateSessionPayload, title) =>
      connection.request("session.create", { ...payload, title }),
  );
}

export function createConversationStarter<Payload>(
  connection: StartConnection,
  createSession: (payload: Payload, title: string) => Promise<SessionRecord>,
) {
  let unsent: UnsentStart | null = null;

  const create = async (key: string, request: StartRequest<Payload>) => {
    const title = generateLocalSessionTitle(
      request.prompt,
      request.fallbackTitle,
    );
    const session = await createSession(request.payload, title);
    return { key, session, messageId: crypto.randomUUID() };
  };

  return async (request: StartRequest<Payload>) => {
    const key = JSON.stringify([
      request.payload,
      request.prompt,
      request.attachments.map((attachment) => attachment.id),
    ]);
    const pending = unsent?.key === key ? unsent : await create(key, request);
    unsent = pending;
    const { session, messageId } = pending;
    await connection.command(
      "session.send",
      {
        sessionId: session.id,
        messageId,
        content: request.prompt,
        attachments: request.attachments,
        thinkingLevel: session.providerSnapshot?.thinkingLevel ?? undefined,
      },
      { idempotencyKey: messageId },
    );
    unsent = null;
    if (session.title !== request.fallbackTitle) {
      void connection
        .request("session.refineTitle", {
          sessionId: session.id,
          message: request.prompt,
          fallbackTitle: session.title,
          expectedTitle: session.title,
        })
        .catch(() => undefined);
    }
    return { session, messageId };
  };
}
