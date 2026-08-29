import {
  Children,
  isValidElement,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useSyncExternalStore,
} from "react";
import { cn } from "@/lib";
import { createMarkdownFileExistenceCache } from "./markdown-file-existence-cache";
import type {
  FilePathCandidate,
  MarkdownFilePathHandlers,
} from "./markdown-file-path";
import {
  scanFilePathCandidates,
  splitWorkspaceLinkLabel,
} from "./markdown-file-path";
import {
  getFilePathToneClass,
  getInlineCodeToneClass,
  type MarkdownRendererTone,
} from "./markdown-renderer-styles";

// Shared across streaming re-renders. Stale entries keep their last-good value
// while a mounted chip refreshes them, and transient probe failures stay
// retryable instead of becoming permanent negative results.
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
  // "code": styled inline-code chip (backtick tokens). "text": a path detected
  // inside plain prose — it must read as ordinary text, so a missing/unresolved
  // path renders with no chip styling at all, and a confirmed one is just a
  // colored, clickable inline link.
  variant?: "code" | "text";
}

// A token that denotes a file path. Existence is verified eagerly once it
// mounts so a confirmed path shows its link color by default; only a
// confirmed-existing path renders the clickable affordance, so misdetected
// tokens degrade to plain text (prose) or plain inline code.
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

  const baseClassName = isProse
    ? className
    : cn(
        "rounded-control border px-1.5 py-0.5 font-normal text-[0.92em]",
        getInlineCodeToneClass(tone),
        className,
      );

  if (!resolved) {
    if (isProse) {
      return children ?? null;
    }
    return <code className={baseClassName}>{children}</code>;
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
        baseClassName,
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

// Flatten streamdown link children (often a nested <code> chip) to plain text
// so we can re-render with a single MarkdownFilePathCode — avoids double chip
// nesting and keeps GitHub-style [`path`](path) visually identical to bare
// `path` tokens.
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

// Markdown `[label](workspace-path)` links rewritten to the private
// https://cocurdex.workspace/... form. Reuse the same chip as inline-code
// paths. Open target comes from the href (candidate); only path-looking
// spans inside the label are clickable — prose like "附近" / "起" stays plain.
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

        // Open the real workspace path from the href; prefer :line from the
        // label when the model put it there (`headless.rs:846`).
        const openCandidate: FilePathCandidate = {
          path: candidate.path,
          startLine: part.startLine ?? candidate.startLine,
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

// Linkify file paths that appear in plain prose (not inline code). Walks the
// top-level string leaves of a rendered subtree, splitting each on detected
// path candidates and wrapping the hits in a prose-variant chip. Non-string
// children (already-rendered elements like <strong>, <code>, <a>) pass through
// untouched, so we never descend into or double-process them.
export function linkifyFilePaths(
  children: ReactNode,
  handlers: MarkdownFilePathHandlers,
  tone: MarkdownRendererTone,
): ReactNode {
  return Children.map(children, (child) => {
    if (typeof child !== "string") {
      return child;
    }

    const matches = scanFilePathCandidates(child);
    if (matches.length === 0) {
      return child;
    }

    const parts: ReactNode[] = [];
    let cursor = 0;
    for (const match of matches) {
      if (match.index > cursor) {
        parts.push(child.slice(cursor, match.index));
      }
      const end = match.index + match.length;
      parts.push(
        // Key on the text offset within this child: stable across re-renders and
        // unique per child. Children.map adds its own per-child prefix.
        <MarkdownFilePathCode
          candidate={match.candidate}
          handlers={handlers}
          key={`fp-${match.index}`}
          tone={tone}
          variant="text"
        >
          {child.slice(match.index, end)}
        </MarkdownFilePathCode>,
      );
      cursor = end;
    }
    if (cursor < child.length) {
      parts.push(child.slice(cursor));
    }
    return parts;
  });
}
