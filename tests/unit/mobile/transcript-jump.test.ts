import type { CondensedItem } from "@cocurdex/mobile/internal/session-detail/transcript-activity";
import {
  hasUnseenLatest,
  INITIAL_JUMP_STATE,
  isFarFromOldest,
  type JumpState,
  nextJumpState,
  promptOutline,
} from "@cocurdex/mobile/internal/session-detail/transcript-jump";
import { describe, expect, it } from "vitest";

const VIEWPORT = 800;
const CONTENT = 10_000;

function at(distanceFromEnd: number) {
  const offset = CONTENT - VIEWPORT - distanceFromEnd;
  return { offset, contentHeight: CONTENT, viewportHeight: VIEWPORT };
}

const scrolled: JumpState = { ...INITIAL_JUMP_STATE, userScrolled: true };

describe("nextJumpState", () => {
  it("shows nothing on a freshly opened transcript at the latest message", () => {
    expect(
      nextJumpState(INITIAL_JUMP_STATE, at(0), CONTENT - VIEWPORT, 20).kind,
    ).toBeNull();
  });

  it("shows nothing at the latest message after the viewer scrolls back", () => {
    expect(
      nextJumpState(scrolled, at(4), CONTENT - VIEWPORT, 20).kind,
    ).toBeNull();
  });

  it("follows reading direction after streaming stops", () => {
    const towardOlder = nextJumpState(
      scrolled,
      at(4000),
      CONTENT - VIEWPORT - 3000,
      20,
    );
    expect(towardOlder.kind).toBe("top");
    const towardLatest = nextJumpState(
      towardOlder,
      at(3000),
      CONTENT - VIEWPORT - 4000,
      20,
    );
    expect(towardLatest.kind).toBe("latest");
  });

  it("offers the latest message from the oldest end", () => {
    const oldest = CONTENT - VIEWPORT;
    expect(nextJumpState(scrolled, at(oldest), 50, 20).kind).toBe("latest");
  });

  it("shows nothing when the transcript fits on screen", () => {
    const short = { offset: 0, contentHeight: 600, viewportHeight: VIEWPORT };
    expect(nextJumpState(scrolled, short, 0, 3).kind).toBeNull();
  });

  it("keeps the same state object when nothing changed", () => {
    const state = nextJumpState(
      scrolled,
      at(4000),
      CONTENT - VIEWPORT - 3000,
      20,
    );
    expect(nextJumpState(state, at(4100), CONTENT - VIEWPORT - 4000, 20)).toBe(
      state,
    );
  });
});

describe("hasUnseenLatest", () => {
  it("flags items that arrived while the viewer was away from the latest", () => {
    const away = nextJumpState(
      scrolled,
      at(4000),
      CONTENT - VIEWPORT - 3000,
      20,
    );
    expect(hasUnseenLatest(away, 20)).toBe(false);
    expect(hasUnseenLatest(away, 21)).toBe(true);
  });

  it("clears once the viewer is back at the latest message", () => {
    const away = nextJumpState(
      scrolled,
      at(4000),
      CONTENT - VIEWPORT - 3000,
      20,
    );
    const back = nextJumpState(away, at(0), CONTENT - VIEWPORT - 4000, 22);
    expect(hasUnseenLatest(back, 22)).toBe(false);
  });
});

describe("promptOutline", () => {
  it("lists user prompts by their first line with their transcript index", () => {
    const items: CondensedItem[] = [
      { kind: "user", id: "u1", text: "  Review totals\nin cents", images: [] },
      {
        kind: "assistant",
        id: "a1",
        text: "Done",
        streaming: false,
        turnEnd: true,
      },
      { kind: "user", id: "u2", text: "Ship it", images: [] },
    ];
    expect(promptOutline(items)).toEqual([
      { id: "u1", text: "Review totals", index: 0 },
      { id: "u2", text: "Ship it", index: 2 },
    ]);
  });
});

describe("jump distance", () => {
  const viewport = 800;

  it("animates only within one screen of the oldest", () => {
    expect(
      isFarFromOldest({
        offset: 7800,
        contentHeight: 9000,
        viewportHeight: viewport,
      }),
    ).toBe(true);
    expect(
      isFarFromOldest({
        offset: 100,
        contentHeight: 9000,
        viewportHeight: viewport,
      }),
    ).toBe(false);
  });
});

it("returns to the reading direction when a stream stops without another scroll", () => {
  const streaming = nextJumpState(
    scrolled,
    at(4000),
    at(3000).offset,
    20,
    true,
  );
  expect(streaming.kind).toBe("latest");
  expect(
    nextJumpState(streaming, at(4000), at(4000).offset, 20, false).kind,
  ).toBe("top");
});

it("ignores small reverse movement", () => {
  const state = nextJumpState(scrolled, at(4000), at(3000).offset, 20);
  expect(nextJumpState(state, at(3997), at(4000).offset, 20).kind).toBe("top");
});
