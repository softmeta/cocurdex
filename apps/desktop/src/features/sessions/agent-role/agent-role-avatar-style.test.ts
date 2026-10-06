import { normalizeAgentRoleAvatar } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { AGENT_ROLE_AVATAR_EMOJI_GROUPS } from "./agent-role-avatar-style";

describe("AGENT_ROLE_AVATAR_EMOJI_GROUPS", () => {
  it("only offers emoji the daemon keeps as an avatar", () => {
    const emojis = AGENT_ROLE_AVATAR_EMOJI_GROUPS.flatMap(
      (group) => group.emojis,
    );
    expect(new Set(emojis).size).toBe(emojis.length);
    for (const emoji of emojis) {
      expect(
        normalizeAgentRoleAvatar({ kind: "emoji", emoji, color: "gray" }),
      ).toEqual({ kind: "emoji", emoji, color: "gray" });
    }
  });
});
