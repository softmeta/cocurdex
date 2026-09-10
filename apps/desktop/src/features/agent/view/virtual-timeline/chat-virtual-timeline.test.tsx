import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { type ComponentProps, createRef, useCallback, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatConversationItem } from "../chat-conversation-item";
import type { ConversationGroup } from "../chat-timeline";
import { ChatVirtualTimeline } from "./chat-virtual-timeline";
import type { ChatTimelineScrollHandle } from "./use-virtual-timeline";
import { installTimelineTestLayout } from "./virtual-timeline-test-dom";

vi.mock("../chat-conversation-item", () => ({
  ChatConversationItem: ({
    conversationGroup,
    setUserMessageRef,
  }: ComponentProps<typeof ChatConversationItem>) => (
    <div
      ref={(element) => {
        if (conversationGroup.prompt)
          setUserMessageRef(conversationGroup.prompt.id, element);
      }}
    >
      <button type="button">{conversationGroup.prompt?.content}</button>
    </div>
  ),
}));

let layout: ReturnType<typeof installTimelineTestLayout>;
beforeEach(() => {
  layout = installTimelineTestLayout();
});
afterEach(() => {
  cleanup();
  layout.restore();
});

function mountTimeline(count = 1000) {
  const groups: ConversationGroup[] = Array.from(
    { length: count },
    (_, index) => ({
      id: `conversation-${index}`,
      items: [],
      prompt: {
        id: `message-${index}`,
        sessionId: "session-1",
        role: "user",
        content: `Prompt ${index}`,
        attachments: [],
        createdAt: "2026-09-09T00:00:00.000Z",
      },
    }),
  );
  const viewportRef = createRef<HTMLDivElement>();
  const scrollRef = createRef<ChatTimelineScrollHandle>();
  const userMessageRefs = {
    current: {} as Record<string, HTMLDivElement | null>,
  };
  function Harness() {
    const [viewportElement, setViewportElement] =
      useState<HTMLDivElement | null>(null);
    const attachViewport = useCallback((element: HTMLDivElement | null) => {
      viewportRef.current = element;
      setViewportElement(element);
    }, []);
    return (
      <div data-testid="viewport" ref={attachViewport}>
        <ChatVirtualTimeline
          groups={groups}
          isRunning={false}
          latestMessageId={null}
          scrollRef={scrollRef}
          setUserMessageRef={(id, element) => {
            if (element) userMessageRefs.current[id] = element;
            else delete userMessageRefs.current[id];
          }}
          userMessageRefs={userMessageRefs}
          viewportElement={viewportElement}
        />
      </div>
    );
  }
  render(<Harness />);
  return {
    viewport: screen.getByTestId<HTMLDivElement>("viewport"),
    scrollRef,
    userMessageRefs,
  };
}

function getConversationRow(id: string) {
  const row = document.querySelector<HTMLElement>(
    `[data-conversation-id="${id}"]`,
  );
  if (!row) throw new Error(`Conversation ${id} is not mounted`);
  return row;
}

describe("virtual conversation rendering", () => {
  it.each([
    1, 3,
  ])("renders and navigates a short transcript with %i conversations", async (count) => {
    const { viewport, scrollRef, userMessageRefs } = mountTimeline(count);
    await screen.findByRole("button", { name: `Prompt ${count - 1}` });
    expect(screen.getAllByRole("button")).toHaveLength(count);
    act(() => {
      expect(scrollRef.current?.scrollToUserMessage("message-0")).toBe(true);
    });
    fireEvent.scroll(viewport);
    expect(
      userMessageRefs.current["message-0"]?.getBoundingClientRect().top,
    ).toBeGreaterThanOrEqual(0);
    expect(scrollRef.current?.getStickySelection()).toEqual({
      id: "message-0",
    });
  });

  it("handles an empty transcript without a navigation target", () => {
    const { scrollRef } = mountTimeline(0);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(scrollRef.current?.scrollToUserMessage("missing")).toBe(false);
  });

  it("keeps the viewport at the end when the last conversation grows", async () => {
    const { viewport } = mountTimeline();
    await screen.findByRole("button", { name: "Prompt 999" });
    act(() => {
      viewport.scrollTop = viewport.scrollHeight - viewport.clientHeight;
    });
    fireEvent.scroll(viewport);
    const distanceFromEnd =
      viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop;
    act(() => {
      layout.heights.set("conversation-999", 800);
      layout.emitResize(getConversationRow("conversation-999"));
    });
    await waitFor(() => {
      expect(
        viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop,
      ).toBeCloseTo(distanceFromEnd, 0);
    });
  });

  it("does not move the reader when the visible live conversation grows below them", async () => {
    layout.heights.set("conversation-999", 4000);
    const { viewport, scrollRef } = mountTimeline();
    await screen.findByRole("button", { name: "Prompt 0" });
    act(() => {
      scrollRef.current?.scrollToUserMessage("message-999");
    });
    fireEvent.scroll(viewport);
    act(() => {
      scrollRef.current?.cancelNavigation();
      viewport.scrollTop += 1000;
    });
    fireEvent.scroll(viewport);
    const position = viewport.scrollTop;
    act(() => {
      layout.heights.set("conversation-999", 8000);
      layout.emitResize(getConversationRow("conversation-999"));
    });
    await waitFor(() => expect(viewport.scrollTop).toBe(position));
  });

  it("mounts a bounded window and retains the final conversation", async () => {
    mountTimeline();
    await screen.findByRole("button", { name: "Prompt 0" });
    expect(
      screen.getByRole("button", { name: "Prompt 999" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button").length).toBeLessThan(12);
    expect(
      screen.queryByRole("button", { name: "Prompt 500" }),
    ).not.toBeInTheDocument();
  });

  it("mounts an offscreen jump target and corrects its measured position", async () => {
    const { viewport, scrollRef, userMessageRefs } = mountTimeline();
    await screen.findByRole("button", { name: "Prompt 0" });
    act(() => {
      expect(scrollRef.current?.scrollToUserMessage("message-500")).toBe(true);
    });
    fireEvent.scroll(viewport);
    await screen.findByRole("button", { name: "Prompt 500" });
    await waitFor(() => {
      expect(
        userMessageRefs.current["message-500"]?.getBoundingClientRect().top,
      ).toBeCloseTo(20, 0);
    });
    expect(scrollRef.current?.getStickySelection()).toEqual({
      id: "message-500",
    });

    const precedingRow = getConversationRow("conversation-499");
    act(() => {
      layout.heights.set("conversation-499", 800);
      layout.emitResize(precedingRow);
    });
    await waitFor(() => {
      expect(
        userMessageRefs.current["message-500"]?.getBoundingClientRect().top,
      ).toBeCloseTo(20, 0);
    });
  });

  it("releases a jump target when the user starts another scroll", async () => {
    const { viewport, scrollRef } = mountTimeline();
    await screen.findByRole("button", { name: "Prompt 0" });
    act(() => {
      scrollRef.current?.scrollToUserMessage("message-500");
    });
    fireEvent.scroll(viewport);
    await screen.findByRole("button", { name: "Prompt 500" });
    act(() => {
      scrollRef.current?.cancelNavigation();
      viewport.scrollTop = 1000;
    });
    fireEvent.scroll(viewport);
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Prompt 500" }),
      ).not.toBeInTheDocument(),
    );
    expect(scrollRef.current?.hasNavigationTarget()).toBe(false);
    expect(viewport.scrollTop).toBeLessThan(5000);
  });

  it("retains a focused control while its conversation scrolls out of view", async () => {
    const { viewport } = mountTimeline();
    const button = await screen.findByRole("button", { name: "Prompt 0" });
    act(() => {
      button.focus();
      viewport.scrollTop = 100_000;
    });
    fireEvent.scroll(viewport);
    await waitFor(() =>
      expect(screen.getAllByRole("button").length).toBeLessThan(12),
    );
    expect(button).toHaveFocus();
    expect(button).toBeInTheDocument();
  });
});
