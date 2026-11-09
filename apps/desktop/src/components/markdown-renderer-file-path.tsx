import type { FilePathCandidate } from "@cocurdex/shared";
import {
  isValidElement,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useSyncExternalStore,
} from "react";
import { cn } from "@/lib";
import { createMarkdownFileExistenceCache } from "./markdown-file-existence-cache";
import type { MarkdownFilePathHandlers } from "./markdown-file-path";
import { splitWorkspaceLinkLabel } from "./markdown-file-path";
import {
  getFilePathToneClass,
  getInlineCodeToneClass,
  type MarkdownRendererTone,
} from "./markdown-renderer-styles";

const existenceCache = createMarkdownFileExistenceCache();

function probeExistence(
  handlers: MarkdownFilePathHandlers,
  absolutePath: string,
): Promise<boolean> {
  return existenceCache.probe(handlers.checkExists, absolutePath);
}

function getExistenceSnapshot(absolutePath: string | undefined): boolean {
  return existenceCache.getSnapshot(absolutePath);
}

function subscribeToExistence(
  handlers: MarkdownFilePathHandlers,
  absolutePath: string | undefined,
  listener: () => void,
) {
  if (!absolutePath) {
    return () => {};
  }

  const unsubscribe = existenceCache.subscribe(absolutePath, listener);
  void probeExistence(handlers, absolutePath);
  return unsubscribe;
}

interface MarkdownFilePathCodeProps {
  candidate: FilePathCandidate;
  handlers: MarkdownFilePathHandlers;
  tone: MarkdownRendererTone;
  className?: string;
  children?: ReactNode;
  variant?: "code" | "text";
}

export function MarkdownFilePathCode({
  candidate,
  handlers,
  tone,
  className,
  children,
  variant = "code",
}: MarkdownFilePathCodeProps) {
  const isProse = variant === "text";
  const resolved = handlers.resolve(candidate);
  const absolutePath = resolved?.absolutePath;
  const subscribe = useCallback(
    (listener: () => void) =>
      subscribeToExistence(handlers, absolutePath, listener),
    [absolutePath, handlers],
  );
  const getSnapshot = useCallback(
    () => getExistenceSnapshot(absolutePath),
    [absolutePath],
  );
  const exists = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  if (!resolved) {
    if (isProse) {
      return children ?? null;
    }
    return (
      <code
        className={cn(
          "break-words rounded-control px-1.5 py-0.5 font-normal text-[0.92em]",
          getInlineCodeToneClass(tone),
          className,
        )}
      >
        {children}
      </code>
    );
  }

  const handleClick = () => {
    if (exists) {
      handlers.open(resolved);
      return;
    }
    void probeExistence(handlers, resolved.absolutePath).then((ok) => {
      if (ok) {
        handlers.open(resolved);
      }
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleClick();
    }
  };

  const Tag = isProse ? "span" : "code";
  return (
    <Tag
      className={cn(
        !isProse &&
          "break-words rounded-control px-1.5 py-0.5 font-normal text-[0.92em]",
        !isProse && getInlineCodeToneClass(tone),
        className,
        exists && [
          getFilePathToneClass(tone),
          "cursor-pointer no-underline decoration-current/60 underline-offset-4 transition-colors hover:underline",
        ],
      )}
      onClick={handleClick}
      onKeyDown={exists ? handleKeyDown : undefined}
      role={exists ? "link" : undefined}
      tabIndex={exists ? 0 : undefined}
      title={exists ? handlers.openLabel : undefined}
    >
      {children}
    </Tag>
  );
}

function extractRenderableText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") {
    return "";
  }
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(extractRenderableText).join("");
  }
  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode };
    return extractRenderableText(props.children);
  }
  return "";
}

export function MarkdownWorkspaceFileLink({
  candidate,
  handlers,
  tone,
  children,
}: {
  candidate: FilePathCandidate;
  handlers: MarkdownFilePathHandlers;
  tone: MarkdownRendererTone;
  children?: ReactNode;
}) {
  const label = extractRenderableText(children).trim() || candidate.path;
  const parts = splitWorkspaceLinkLabel(label);

  if (parts.length === 0) {
    return (
      <MarkdownFilePathCode
        candidate={candidate}
        handlers={handlers}
        tone={tone}
      >
        {candidate.path}
      </MarkdownFilePathCode>
    );
  }

  let offset = 0;
  return (
    <>
      {parts.map((part) => {
        const key = `${part.kind}:${offset}:${part.text}`;
        offset += part.text.length;
        if (part.kind === "text") {
          return <span key={key}>{part.text}</span>;
        }

        const openCandidate: FilePathCandidate = {
          path: candidate.path,
          startLine: part.startLine ?? candidate.startLine,
          endLine: part.endLine ?? candidate.endLine,
          column: part.column ?? candidate.column,
        };
        return (
          <MarkdownFilePathCode
            candidate={openCandidate}
            handlers={handlers}
            key={key}
            tone={tone}
          >
            {part.text}
          </MarkdownFilePathCode>
        );
      })}
    </>
  );
}
