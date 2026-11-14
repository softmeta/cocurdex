import type { JsonValue } from "@earendil-works/chord/json";
import type { ToolResultMessage } from "@earendil-works/pi-ai";
import {
  createFindTool,
  createGrepTool,
  createLsTool,
} from "@earendil-works/pi-coding-agent";
import {
  defineExtension,
  defineTool,
  type ToolRegistration,
} from "@earendil-works/pi-durable";

type SearchToolFactory =
  | typeof createLsTool
  | typeof createFindTool
  | typeof createGrepTool;

/**
 * pi's `ls`, `find`, and `grep` for durable conversations, which the durable coding tools lack.
 * They only read, so a resumed call runs again. Each call works in the conversation's `cwd`.
 */
function searchTool(create: SearchToolFactory) {
  const template = create(process.cwd());
  return defineTool({
    name: template.name,
    description: template.description,
    parameters: template.parameters as ToolRegistration["parameters"],
    replay: "safe",
    execute: async (args, api, context) => {
      const cwd = api.env?.cwd ?? (await api.agent(context)).cwd;
      if (!cwd) {
        return {
          isError: true,
          output: [{ type: "text", text: "No working directory" }],
        };
      }
      const result = await create(cwd).execute(
        api.callId,
        args as never,
        context.abortSignal,
      );
      return {
        output: result.content as ToolResultMessage["content"],
        details: (result.details ?? null) as JsonValue,
      };
    },
  }) as ToolRegistration;
}

export const SearchTools = defineExtension({
  name: "cocurdex-search-tools",
  tools: [
    searchTool(createLsTool),
    searchTool(createFindTool),
    searchTool(createGrepTool),
  ],
});
