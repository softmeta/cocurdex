interface PreviewTransport {
  open(html: string, streaming: boolean): Promise<string | null>;
  update(
    url: string,
    html: string,
    streaming: boolean,
    source: string,
  ): Promise<boolean>;
  onError(error: unknown): void;
}

export function createBrowserPreviewStream(transport: PreviewTransport) {
  let url: string | null = null;
  let pending: { html: string; streaming: boolean; source: string } | null =
    null;
  let previous: string | null = null;
  let running = false;
  let stopped = false;

  const flush = async () => {
    if (running || stopped) return;
    running = true;
    try {
      while (pending !== null && !stopped) {
        const { html, streaming, source } = pending;
        pending = null;
        if (url === null) {
          url = await transport.open(html, streaming);
          if (url === null) stopped = true;
        } else if (!(await transport.update(url, html, streaming, source))) {
          stopped = true;
        }
      }
    } catch (error) {
      stopped = true;
      transport.onError(error);
    } finally {
      running = false;
    }
  };

  return {
    push(html: string, streaming = false, source = html) {
      if (stopped || html === previous) return;
      previous = html;
      pending = { html, streaming, source };
      void flush();
    },
    stop() {
      stopped = true;
      pending = null;
    },
  };
}
