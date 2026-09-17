import { desktopApi } from "@/lib";
import { splitTextByLinks, toLinkHref } from "./plain-text-links";

export function LinkifiedText({ text }: { text: string }) {
  let offset = 0;

  const nodes = splitTextByLinks(text).map((segment) => {
    const key = offset;

    if (segment.kind === "link") {
      offset += segment.url.length;
      const href = toLinkHref(segment.url);

      return (
        <a
          key={key}
          className="text-chat-link underline decoration-chat-link/40 underline-offset-2 transition-colors hover:text-chat-link-hover hover:decoration-current"
          href={href}
          onClick={(event) => {
            event.preventDefault();
            void desktopApi.openExternal(href);
          }}
          rel="noreferrer"
          target="_blank"
        >
          {segment.url}
        </a>
      );
    }

    offset += segment.text.length;

    return <span key={key}>{segment.text}</span>;
  });

  return <>{nodes}</>;
}
