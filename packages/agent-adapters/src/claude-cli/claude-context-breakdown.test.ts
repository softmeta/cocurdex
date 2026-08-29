import { describe, expect, it } from "vitest";
import { mapClaudeContextBreakdown } from "./claude-context-breakdown";

const updatedAt = "2026-08-13T00:00:00.000Z";

describe("mapClaudeContextBreakdown", () => {
  it("returns null when the response carries no window total", () => {
    expect(mapClaudeContextBreakdown(null, updatedAt)).toBeNull();
    expect(
      mapClaudeContextBreakdown({ maxTokens: 1000 }, updatedAt),
    ).toBeNull();
  });

  it("maps categories and detail rows", () => {
    const breakdown = mapClaudeContextBreakdown(
      {
        categories: [
          { name: "System prompt", tokens: 5500 },
          { name: "Free space", tokens: 0 },
        ],
        totalTokens: 136_000,
        maxTokens: 1_000_000,
        model: "claude-opus-5",
        memoryFiles: [{ path: "CLAUDE.md", type: "Project", tokens: 14 }],
        mcpTools: [{ name: "ctx_search", serverName: "ctx", tokens: 1200 }],
        skills: {
          totalSkills: 54,
          includedSkills: 54,
          tokens: 6800,
          skillFrontmatter: [
            { name: "tdd", source: "Project", tokens: 50 },
            { name: "run", source: "Built-in", tokens: 120 },
          ],
        },
      },
      updatedAt,
    );

    expect(breakdown).toMatchObject({
      totalTokens: 136_000,
      maxTokens: 1_000_000,
      model: "claude-opus-5",
      updatedAt,
      // Empty slices carry no information in a token panel.
      categories: [{ name: "System prompt", tokens: 5500 }],
    });
    expect(breakdown?.groups).toMatchObject([
      {
        id: "memoryFiles",
        tokens: 14,
        items: [{ name: "CLAUDE.md", detail: "Project", tokens: 14 }],
      },
      {
        id: "mcpTools",
        tokens: 1200,
        items: [{ name: "ctx_search", detail: "ctx", tokens: 1200 }],
      },
      // The reported group total wins over the sum of its rows: the SDK counts
      // frontmatter it does not enumerate.
      { id: "skills", tokens: 6800, summary: "54/54" },
    ]);
  });

  it("keeps count-only groups and drops empty ones", () => {
    const breakdown = mapClaudeContextBreakdown(
      {
        totalTokens: 100,
        maxTokens: 200,
        slashCommands: {
          totalCommands: 12,
          includedCommands: 3,
          tokens: 640,
        },
      },
      updatedAt,
    );

    expect(breakdown?.groups).toEqual([
      { id: "slashCommands", tokens: 640, summary: "3/12", items: [] },
    ]);
  });
});
