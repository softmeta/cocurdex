import { fireEvent, render } from "@testing-library/react";
import { act, createRef } from "react";
import { describe, expect, it } from "vitest";
import { PanScrollbar } from "./pan-scrollbar";

function renderPanScrollbar(clientWidth: number, scrollWidth: number) {
  const ref = createRef<HTMLDivElement>();
  const { container } = render(
    <div>
      <div ref={ref} style={{ overflowX: "auto" }}>
        <div style={{ width: scrollWidth }} />
      </div>
      <PanScrollbar viewportRef={ref} />
    </div>,
  );
  const viewport = ref.current;
  if (!viewport) {
    throw new Error("viewport missing");
  }
  Object.defineProperty(viewport, "clientWidth", {
    value: clientWidth,
    configurable: true,
  });
  Object.defineProperty(viewport, "scrollWidth", {
    value: scrollWidth,
    configurable: true,
  });
  const thumb = container.querySelector(
    "[data-slot=pan-scrollbar-thumb]",
  ) as HTMLElement;
  const track = container.querySelector(
    "[data-slot=pan-scrollbar]",
  ) as HTMLElement;
  return { container, ref, thumb, track, viewport };
}

describe("PanScrollbar", () => {
  it("hides the thumb when content fits the viewport", () => {
    const { thumb, viewport } = renderPanScrollbar(1000, 1000);
    act(() => {
      fireEvent.scroll(viewport);
    });
    expect(thumb.style.width).toBe("0px");
  });

  it("moves the thumb in proportion to scrollLeft", () => {
    const { thumb, viewport } = renderPanScrollbar(1000, 2000);
    act(() => {
      viewport.scrollLeft = 500;
      fireEvent.scroll(viewport);
    });
    expect(thumb.style.width).toBe("500px");
    expect(thumb.style.insetInlineStart).toBe("250px");
  });

  it("scrolls the viewport when the thumb is dragged", () => {
    const { track, viewport } = renderPanScrollbar(1000, 2000);
    act(() => {
      fireEvent.scroll(viewport);
    });
    track.getBoundingClientRect = () =>
      ({
        left: 0,
        right: 1000,
        width: 1000,
        top: 0,
        bottom: 8,
        height: 8,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    track.setPointerCapture = () => {};
    act(() => {
      fireEvent.pointerDown(track, { clientX: 250, pointerId: 1 });
      fireEvent.pointerMove(track, { clientX: 500, pointerId: 1 });
    });
    // Pointer moved 250px on the track at scale 0.5 -> 500px of scroll.
    expect(viewport.scrollLeft).toBe(500);
    act(() => {
      fireEvent.pointerUp(track, { pointerId: 1 });
    });
  });
});
