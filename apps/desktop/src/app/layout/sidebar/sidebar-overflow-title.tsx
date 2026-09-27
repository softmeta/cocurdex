const MARQUEE_PX_PER_SECOND = 60;
const MIN_MARQUEE_SECONDS = 0.6;

function syncMarqueeDuration(container: HTMLElement, text: HTMLElement) {
  const overflowPx = Math.max(0, text.scrollWidth - container.clientWidth);
  const seconds = Math.max(
    MIN_MARQUEE_SECONDS,
    overflowPx / MARQUEE_PX_PER_SECOND,
  );
  text.style.setProperty("--sidebar-marquee-duration", `${seconds}s`);
}

function observeMarqueeDistance(container: HTMLSpanElement | null) {
  const text = container?.firstElementChild;
  if (!(container && text instanceof HTMLElement)) {
    return;
  }
  const observer = new ResizeObserver(() =>
    syncMarqueeDuration(container, text),
  );
  observer.observe(container);
  observer.observe(text);
  return () => observer.disconnect();
}

export function SidebarOverflowTitle({ children }: { children: string }) {
  return (
    <span className="sidebar-overflow-title" ref={observeMarqueeDistance}>
      <span className="sidebar-overflow-title__text">{children}</span>
    </span>
  );
}
