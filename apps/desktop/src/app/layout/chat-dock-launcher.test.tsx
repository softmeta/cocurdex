import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ChatDockLauncher } from "./chat-dock-launcher";

vi.mock("@/features/shortcuts", () => ({
  useResolvedShortcutLabel: () => "⌘J",
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("chat launcher interactions", () => {
  it("activates the detached window on an ordinary click", () => {
    const onOpen = vi.fn();
    render(<ChatDockLauncher detached onOpen={onOpen} />);
    const button = screen.getByRole("button", {
      name: "actions.toggleDetachedChat",
    });
    fireEvent.mouseDown(button, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.mouseUp(window, { clientX: 100, clientY: 100 });
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("repositions without activating and accepts the next ordinary click", () => {
    const onOpen = vi.fn();
    render(<ChatDockLauncher detached onOpen={onOpen} />);
    const button = screen.getByRole("button", {
      name: "actions.toggleDetachedChat",
    });
    fireEvent.mouseDown(button, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.mouseMove(window, { clientX: 140, clientY: 140 });
    fireEvent.mouseUp(window, { clientX: 140, clientY: 140 });
    fireEvent.click(button);
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.mouseDown(button, { button: 0, clientX: 140, clientY: 140 });
    fireEvent.mouseUp(window, { clientX: 140, clientY: 140 });
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("hides the launcher without activating the chat window", () => {
    const onOpen = vi.fn();
    function Fixture() {
      const [hidden, setHidden] = useState(false);
      return hidden ? null : (
        <ChatDockLauncher
          detached
          onOpen={onOpen}
          onHideFab={() => setHidden(true)}
        />
      );
    }
    render(<Fixture />);
    fireEvent.click(
      screen.getByRole("button", { name: "actions.hideChatFab" }),
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(onOpen).not.toHaveBeenCalled();
  });
});
