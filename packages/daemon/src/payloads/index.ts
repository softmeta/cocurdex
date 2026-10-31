import type { DaemonMethod, DaemonRequest } from "@cocurdex/rpc";
import { z } from "zod";
import { deckPayloadSchemas } from "./deck-payloads";
import { hostPayloadSchemas } from "./host-payloads";
import { imagePayloadSchemas } from "./image-payloads";
import { issuePayloadSchemas } from "./issue-payloads";
import { mcpPayloadSchemas } from "./mcp-payloads";
import { memoryPayloadSchemas } from "./memory-payloads";
import { notePayloadSchemas } from "./note-payloads";
import type { PayloadSchemas } from "./primitives";
import { providerPayloadSchemas } from "./provider-payloads";
import { sessionPayloadSchemas } from "./session-payloads";
import { skillPayloadSchemas } from "./skill-payloads";
import { systemPayloadSchemas } from "./system-payloads";
import { workspacePayloadSchemas } from "./workspace-payloads";

export const daemonPayloadSchemas: PayloadSchemas = {
  ...deckPayloadSchemas,
  ...hostPayloadSchemas,
  ...imagePayloadSchemas,
  ...issuePayloadSchemas,
  ...mcpPayloadSchemas,
  ...memoryPayloadSchemas,
  ...notePayloadSchemas,
  ...providerPayloadSchemas,
  ...sessionPayloadSchemas,
  ...skillPayloadSchemas,
  ...systemPayloadSchemas,
  ...workspacePayloadSchemas,
};

export function parseDaemonRequest<M extends DaemonMethod>(
  request: DaemonRequest<M>,
): DaemonRequest<M> {
  const schema: z.ZodType | undefined = daemonPayloadSchemas[request.method];
  if (!schema || !("params" in request)) {
    return request;
  }
  const result = schema.safeParse(request.params);
  if (!result.success) {
    throw new Error(
      `Invalid ${request.method} payload: ${z.prettifyError(result.error)}`,
    );
  }
  return { ...request, params: result.data } as DaemonRequest<M>;
}
