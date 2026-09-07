export function createPreviewScrollScript(followChanges: boolean) {
  return `(() => {
    const scrollToEnd = () => requestAnimationFrame(() => {
      const top = Math.max(
        document.documentElement.scrollHeight,
        document.body?.scrollHeight ?? 0
      );
      window.scrollTo({ top, behavior: "instant" });
    });
    const start = () => {
      scrollToEnd();
      if (${followChanges}) {
        const observer = new ResizeObserver(scrollToEnd);
        observer.observe(document.documentElement);
        if (document.body) observer.observe(document.body);
        window.addEventListener("pagehide", () => observer.disconnect(), { once: true });
      }
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      start();
    }
    window.addEventListener("load", scrollToEnd, { once: true });
  })();`;
}
