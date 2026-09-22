import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatDock } from "./chat-dock";
import { ChatDockActions } from "./chat-dock-actions";
import { useDockGeometry } from "./chat-dock-geometry";

const fixture = vi.hoisted(() => ({ info: vi.fn() }));
vi.mock("sonner", () => ({ toast: { info: fixture.info } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("./chat-window", () => ({
  ChatWindowButton: () => null,
  ChatWindowMenuItem: () => null,
}));
vi.mock("./sidebar", () => ({ LeftSidebar: () => null }));

const initialWidth = window.innerWidth;
function resize(width: number) {
  act(() => {
    Object.defineProperty(window, "innerWidth", {
      value: width,
      configurable: true,
    });
    window.dispatchEvent(new Event("resize"));
  });
}
afterEach(() => {
  resize(initialWidth);
  window.localStorage.clear();
  vi.clearAllMocks();
});

function DockFixture() {
  const [pinned, setPinned] = useState(false);
  const dock = useDockGeometry();
  return (
    <ChatDock
      visibility="open"
      pinned={pinned}
      dock={dock}
      onPinnedChange={setPinned}
      onOpen={() => {}}
      onClose={() => {}}
      onHideFab={() => {}}
    >
      <input aria-label="Draft" defaultValue="" />
    </ChatDock>
  );
}

describe("chat dock pin controls", () => {
  it("keeps the pin action discoverable and explains insufficient space without changing layout", () => {
    resize(789);
    const change = vi.fn();
    render(
      <ChatDockActions
        pinned={false}
        onPinnedChange={change}
        onClose={() => {}}
      />,
    );
    const pin = screen.getByRole("button", { name: "actions.pinChatDock" });
    expect(pin.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(pin);
    expect(fixture.info).toHaveBeenCalledWith("actions.pinChatDockNeedsSpace");
    expect(change).not.toHaveBeenCalled();
    resize(1100);
    fireEvent.click(pin);
    expect(change).toHaveBeenCalledWith(true);
  });

  it("preserves an unsent draft across pinning, narrow-window fallback, restoration and unpinning", () => {
    resize(1200);
    render(<DockFixture />);
    fireEvent.change(screen.getByRole("textbox", { name: "Draft" }), {
      target: { value: "Keep this unsent draft" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "actions.pinChatDock" }),
    );
    expect(
      screen
        .getByRole("button", { name: "actions.unpinChatDock" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    resize(789);
    expect(
      screen
        .getByRole("button", { name: "actions.unpinChatDock" })
        .getAttribute("aria-pressed"),
    ).toBeNull();
    expect(
      (screen.getByRole("textbox", { name: "Draft" }) as HTMLInputElement)
        .value,
    ).toBe("Keep this unsent draft");
    resize(1200);
    expect(
      screen
        .getByRole("button", { name: "actions.unpinChatDock" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(
      screen.getByRole("button", { name: "actions.unpinChatDock" }),
    );
    expect(
      (screen.getByRole("textbox", { name: "Draft" }) as HTMLInputElement)
        .value,
    ).toBe("Keep this unsent draft");
  });

  it("allows cancelling a suspended pin in a narrow window", () => {
    resize(789);
    const change = vi.fn();
    render(
      <ChatDockActions pinned onPinnedChange={change} onClose={() => {}} />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "actions.unpinChatDock" }),
    );
    expect(change).toHaveBeenCalledWith(false);
  });
});
