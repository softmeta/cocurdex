import { describe, expect, it, vi } from "vitest";
import { denyWindowNavigation } from "./navigation-policy";

type NavigationListener = (event: { preventDefault: () => void }) => void;

function createFakeWebContents() {
  const listeners = new Map<string, NavigationListener>();
  const setWindowOpenHandler = vi.fn();
  return {
    webContents: {
      on: (channel: string, listener: NavigationListener) => {
        listeners.set(channel, listener);
      },
      setWindowOpenHandler,
    },
    setWindowOpenHandler,
    emit(channel: string) {
      const preventDefault = vi.fn();
      listeners.get(channel)?.({ preventDefault });
      return preventDefault;
    },
  };
}

describe("denyWindowNavigation", () => {
  it("prevents any will-navigate attempt on the window", () => {
    const fake = createFakeWebContents();
    denyWindowNavigation(
      fake.webContents as unknown as Parameters<typeof denyWindowNavigation>[0],
    );
    const preventDefault = fake.emit("will-navigate");
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it("denies window.open / target=_blank popups", () => {
    const fake = createFakeWebContents();
    denyWindowNavigation(
      fake.webContents as unknown as Parameters<typeof denyWindowNavigation>[0],
    );
    expect(fake.setWindowOpenHandler).toHaveBeenCalledTimes(1);
    const handler = fake.setWindowOpenHandler.mock.calls[0]?.[0] as () => {
      action: string;
    };
    expect(handler()).toEqual({ action: "deny" });
  });
});
