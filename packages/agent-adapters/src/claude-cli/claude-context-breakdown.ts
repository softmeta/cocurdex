import type {
  AgentContextBreakdownGroup,
  AgentContextBreakdownItem,
  AgentContextBreakdownRecord,
} from "@cocurdex/shared";

// The Claude Agent SDK's `getContextUsage()` response, narrowed to the fields
// Cocurdex renders. Declared structurally rather than imported so the mapper
// stays testable and survives optional fields disappearing between SDK
// releases — every section below is already optional upstream.
export interface ClaudeContextUsageResponse {
  categories?: { name: string; tokens: number }[];
  totalTokens?: number;
  maxTokens?: number;
  model?: string;
  memoryFiles?: { path: string; type: string; tokens: number }[];
  mcpTools?: { name: string; serverName: string; tokens: number }[];
  deferredBuiltinTools?: { name: string; tokens: number }[];
  systemTools?: { name: string; tokens: number }[];
  systemPromptSections?: { name: string; tokens: number }[];
  agents?: { agentType: string; source: string; tokens: number }[];
  slashCommands?: {
    totalCommands: number;
    includedCommands: number;
    tokens: number;
  };
  skills?: {
    totalSkills: number;
    includedSkills: number;
    tokens: number;
    skillFrontmatter?: { name: string; source: string; tokens: number }[];
  };
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function sumTokens(items: AgentContextBreakdownItem[]) {
  return items.reduce((total, item) => total + item.tokens, 0);
}

function toGroup(
  id: AgentContextBreakdownGroup["id"],
  items: AgentContextBreakdownItem[],
  extras?: { tokens?: number; summary?: string },
): AgentContextBreakdownGroup | null {
  const tokens = extras?.tokens ?? sumTokens(items);
  if (!items.length && !isPositiveInt(tokens)) {
    return null;
  }

  return {
    id,
    tokens,
    items,
    ...(extras?.summary ? { summary: extras.summary } : {}),
  };
}

/**
 * Map the SDK's context-usage response into the transport record.
 *
 * Returns `null` when the response carries no window totals — an agent that
 * cannot report its context composition should not push an empty panel.
 */
export function mapClaudeContextBreakdown(
  response: ClaudeContextUsageResponse | null | undefined,
  updatedAt: string,
): AgentContextBreakdownRecord | null {
  if (!response || !isPositiveInt(response.totalTokens)) {
    return null;
  }

  const groups = [
    toGroup(
      "memoryFiles",
      (response.memoryFiles ?? []).map((file) => ({
        name: file.path,
        tokens: file.tokens,
        detail: file.type,
      })),
    ),
    toGroup(
      "mcpTools",
      (response.mcpTools ?? []).map((tool) => ({
        name: tool.name,
        tokens: tool.tokens,
        detail: tool.serverName,
      })),
    ),
    toGroup(
      "skills",
      (response.skills?.skillFrontmatter ?? []).map((skill) => ({
        name: skill.name,
        tokens: skill.tokens,
        detail: skill.source,
      })),
      response.skills
        ? {
            tokens: response.skills.tokens,
            summary: `${response.skills.includedSkills}/${response.skills.totalSkills}`,
          }
        : undefined,
    ),
    toGroup(
      "agents",
      (response.agents ?? []).map((agent) => ({
        name: agent.agentType,
        tokens: agent.tokens,
        detail: agent.source,
      })),
    ),
    toGroup(
      "systemTools",
      (response.systemTools ?? []).map((tool) => ({
        name: tool.name,
        tokens: tool.tokens,
      })),
    ),
    toGroup(
      "deferredTools",
      (response.deferredBuiltinTools ?? []).map((tool) => ({
        name: tool.name,
        tokens: tool.tokens,
      })),
    ),
    toGroup(
      "systemPrompt",
      (response.systemPromptSections ?? []).map((section) => ({
        name: section.name,
        tokens: section.tokens,
      })),
    ),
    // Slash commands are reported as counts only — no per-command rows.
    toGroup("slashCommands", [], {
      tokens: response.slashCommands?.tokens ?? 0,
      summary: response.slashCommands
        ? `${response.slashCommands.includedCommands}/${response.slashCommands.totalCommands}`
        : undefined,
    }),
  ].filter((group): group is AgentContextBreakdownGroup => group !== null);

  return {
    categories: (response.categories ?? [])
      .filter((category) => isPositiveInt(category.tokens))
      .map((category) => ({ name: category.name, tokens: category.tokens })),
    groups,
    totalTokens: response.totalTokens,
    maxTokens: isPositiveInt(response.maxTokens) ? response.maxTokens : 0,
    ...(response.model ? { model: response.model } : {}),
    updatedAt,
  };
}
