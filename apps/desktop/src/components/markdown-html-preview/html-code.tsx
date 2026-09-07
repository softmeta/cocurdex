import { useCallback, useContext, useRef } from "react";
import {
  CodeBlock,
  type CustomRendererProps,
  StreamdownContext,
} from "streamdown";
import { ScrollArea } from "@/components/ui/scroll-area";
import { bindCodeTail } from "./code-tail";

export function HtmlCode({
  label,
  ...props
}: CustomRendererProps & { label: string }) {
  const context = useContext(StreamdownContext);
  const cleanup = useRef<(() => void) | undefined>(undefined);
  const bindScroll = useCallback((container: HTMLElement | null) => {
    cleanup.current?.();
    cleanup.current = undefined;
    if (!container) return;
    cleanup.current = bindCodeTail(container);
  }, []);
  return (
    <ScrollArea
      viewportRef={bindScroll}
      viewportProps={{
        role: "region",
        "aria-label": label,
        className: "[overflow-anchor:none]",
        style: { maxHeight: context.codeBlockMaxHeight || undefined },
      }}
    >
      <StreamdownContext.Provider value={{ ...context, codeBlockMaxHeight: 0 }}>
        <CodeBlock {...props} lineNumbers={false} />
      </StreamdownContext.Provider>
    </ScrollArea>
  );
}
