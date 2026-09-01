import type { MouseEvent, ReactNode } from "react";
import { cn, desktopApi } from "@/lib";
import {
  extractNodeText,
  resolveAnchorTarget,
  scrollToAnchor,
  slugifyHeading,
} from "./markdown-anchor";
import {
  extractInlineCodeText,
  type MarkdownFilePathHandlers,
  parseFilePathCandidate,
  parseWorkspaceFileHref,
} from "./markdown-file-path";
import {
  linkifyFilePaths,
  MarkdownFilePathCode,
  MarkdownWorkspaceFileLink,
} from "./markdown-renderer-file-path";
import type { MarkdownRendererTone } from "./markdown-renderer-styles";
import {
  getInlineCodeToneClass,
  getLeadingClass,
  getToneMutedClass,
  getToneTextClass,
} from "./markdown-renderer-styles";
import { MarkdownTaskCheckbox } from "./markdown-renderer-task-checkbox";

export interface MarkdownComponentOptions {
  filePath?: MarkdownFilePathHandlers;
}

interface MarkdownElementNode {
  children?: MarkdownElementNode[];
  tagName?: string;
}

// Anchored headings scroll to `block: "start"`, which would tuck them under the
// chat's floating sticky-prompt overlay. `--md-anchor-offset` carries that
// overlay's height (set by the chat view, 0 elsewhere) so scroll-margin-top
// stops the heading just below it.
// Derive a github-slugger-compatible id from a heading's text so in-document
// TOC anchors (which the assistant emits using the same slug rule) can target it.
function headingId(node: unknown): string | undefined {
  const slug = slugifyHeading(extractNodeText(node));
  return slug || undefined;
}

function hasImageDescendant(node: unknown): boolean {
  if (!node || typeof node !== "object") {
    return false;
  }

  const elementNode = node as MarkdownElementNode;
  if (elementNode.tagName === "img") {
    return true;
  }

  return elementNode.children?.some(hasImageDescendant) ?? false;
}

function canOpenInSystemBrowser(href: string | undefined): href is string {
  return (
    href?.startsWith("http://") ||
    href?.startsWith("https://") ||
    href?.startsWith("file://") ||
    false
  );
}

// Block code (```lang ... ```) and Mermaid blocks are rendered by Streamdown's
// built-in CodeBlock (Shiki syntax highlighting) and MermaidBlock. We only
// customize the surrounding markdown elements (headings, lists, tables, inline
// code, etc.) so the chat surface tone tokens still apply.
export function createMarkdownComponents(
  tone: MarkdownRendererTone,
  options?: MarkdownComponentOptions,
) {
  return {
    h1({ children, node }: { children?: ReactNode; node?: unknown }) {
      return (
        <h1
          className={cn(
            "text-title leading-7 font-semibold scroll-mt-[var(--md-anchor-offset,0px)]",
            getToneTextClass(tone),
          )}
          id={headingId(node)}
        >
          {children}
        </h1>
      );
    },
    h2({ children, node }: { children?: ReactNode; node?: unknown }) {
      return (
        <h2
          className={cn(
            "text-display leading-6 font-semibold scroll-mt-[var(--md-anchor-offset,0px)]",
            getToneTextClass(tone),
          )}
          id={headingId(node)}
        >
          {children}
        </h2>
      );
    },
    h3({ children, node }: { children?: ReactNode; node?: unknown }) {
      return (
        <h3
          className={cn(
            "text-sm leading-6 font-semibold scroll-mt-[var(--md-anchor-offset,0px)]",
            getToneTextClass(tone),
          )}
          id={headingId(node)}
        >
          {children}
        </h3>
      );
    },
    h4({ children, node }: { children?: ReactNode; node?: unknown }) {
      return (
        <h4
          className={cn(
            "text-sm leading-6 font-semibold scroll-mt-[var(--md-anchor-offset,0px)]",
            getToneTextClass(tone),
          )}
          id={headingId(node)}
        >
          {children}
        </h4>
      );
    },
    h5({ children, node }: { children?: ReactNode; node?: unknown }) {
      return (
        <h5
          className={cn(
            "text-sm leading-6 font-semibold scroll-mt-[var(--md-anchor-offset,0px)]",
            getToneTextClass(tone),
          )}
          id={headingId(node)}
        >
          {children}
        </h5>
      );
    },
    h6({ children, node }: { children?: ReactNode; node?: unknown }) {
      return (
        <h6
          className={cn(
            "text-sm leading-6 font-semibold scroll-mt-[var(--md-anchor-offset,0px)]",
            getToneTextClass(tone),
          )}
          id={headingId(node)}
        >
          {children}
        </h6>
      );
    },
    p({ children, node }: { children?: ReactNode; node?: unknown }) {
      const className = cn(
        "min-w-0 max-w-full break-words whitespace-pre-wrap text-sm",
        getLeadingClass(tone),
        getToneTextClass(tone),
      );

      const handlers = options?.filePath;
      const content = handlers
        ? linkifyFilePaths(children, handlers, tone)
        : children;

      if (hasImageDescendant(node)) {
        return <div className={className}>{content}</div>;
      }

      return <p className={className}>{content}</p>;
    },
    ul({ children, className }: { children?: ReactNode; className?: string }) {
      return (
        <ul
          className={cn(
            "min-w-0 max-w-full space-y-1 pl-4 text-sm",
            className?.includes("contains-task-list") ? "list-none pl-0" : null,
            getLeadingClass(tone),
            getToneTextClass(tone),
          )}
        >
          {children}
        </ul>
      );
    },
    ol({ children }: { children?: ReactNode }) {
      return (
        <ol
          className={cn(
            "min-w-0 max-w-full space-y-1 pl-4 text-sm",
            getLeadingClass(tone),
            getToneTextClass(tone),
          )}
        >
          {children}
        </ol>
      );
    },
    li({ children, className }: { children?: ReactNode; className?: string }) {
      const handlers = options?.filePath;
      const content = handlers
        ? linkifyFilePaths(children, handlers, tone)
        : children;
      return (
        <li
          className={cn(
            "min-w-0 break-words",
            className?.includes("task-list-item") ? "list-none pl-0" : null,
          )}
        >
          {content}
        </li>
      );
    },
    table({ children }: { children?: ReactNode }) {
      return (
        <div
          className={cn(
            "my-1.5 min-w-0 max-w-full overflow-x-auto rounded-control border [&_code]:rounded-control [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.9em]",
            tone === "editor"
              ? "border-editor-border"
              : tone === "system"
                ? "border-chat-system-border"
                : "border-chat-border-soft",
          )}
        >
          <table className="w-full border-collapse text-left text-sm">
            {children}
          </table>
        </div>
      );
    },
    thead({ children }: { children?: ReactNode }) {
      return (
        <thead
          className={cn(
            "border-b text-xs uppercase tracking-[0.12em]",
            tone === "editor"
              ? "border-editor-border bg-editor-chrome text-editor-fg-muted"
              : tone === "system"
                ? "border-chat-system-border bg-chat-system-bg text-chat-system-fg"
                : "border-chat-border-soft bg-chat-surface-tint text-chat-fg-muted",
          )}
        >
          {children}
        </thead>
      );
    },
    tbody({ children }: { children?: ReactNode }) {
      return <tbody>{children}</tbody>;
    },
    tr({ children }: { children?: ReactNode }) {
      return (
        <tr className="border-b border-chat-border-soft/70 last:border-b-0">
          {children}
        </tr>
      );
    },
    th({ children }: { children?: ReactNode }) {
      return (
        <th className="px-3 py-2 align-top font-semibold break-words">
          {children}
        </th>
      );
    },
    td({ children }: { children?: ReactNode }) {
      return (
        <td
          className={cn(
            "px-3 py-2 align-top text-sm leading-[1.65] break-words",
            getToneTextClass(tone),
          )}
        >
          {children}
        </td>
      );
    },
    blockquote({ children }: { children?: ReactNode }) {
      return (
        <blockquote
          className={cn(
            "border-l pl-3 text-sm leading-[1.65]",
            tone === "assistant"
              ? "border-chat-border"
              : tone === "system"
                ? "border-chat-system-border"
                : tone === "editor"
                  ? "border-editor-border"
                  : "border-chat-border-accent",
            getToneMutedClass(tone),
          )}
        >
          {children}
        </blockquote>
      );
    },
    a({
      children,
      className,
      href,
    }: {
      children?: ReactNode;
      className?: string;
      href?: string;
    }) {
      const linkClassName = cn(
        "underline decoration-white/20 underline-offset-4 transition-colors hover:decoration-current",
        className?.includes("data-footnote-backref") ? "ml-1 text-xs" : null,
        tone === "assistant"
          ? "text-chat-link hover:text-chat-link-hover"
          : tone === "system"
            ? "text-chat-system-fg hover:text-chat-fg"
            : tone === "editor"
              ? "text-editor-fg hover:text-editor-fg"
              : "text-chat-link hover:text-chat-fg",
      );

      // Workspace-relative file links rewritten before render
      // (`https://cocurdex.workspace/open?path=...`). Same chip UI as bare
      // `path` tokens — open via filePathHandlers, never the OS browser.
      const workspaceFile = options?.filePath
        ? parseWorkspaceFileHref(href)
        : null;
      if (workspaceFile && options?.filePath) {
        return (
          <MarkdownWorkspaceFileLink
            candidate={workspaceFile}
            handlers={options.filePath}
            tone={tone}
          >
            {children}
          </MarkdownWorkspaceFileLink>
        );
      }

      // Harden rewrites in-document `#section` links to absolute URLs, so a
      // bare `startsWith("#")` check misses them and they leak out as external
      // `target="_blank"` links that never scroll. Resolve same-document anchors
      // explicitly and navigate them programmatically instead.
      const anchorTarget = resolveAnchorTarget(href);
      const isAnchorLink = anchorTarget !== null;
      const handleAnchorClick = (event: MouseEvent<HTMLAnchorElement>) => {
        event.preventDefault();
        scrollToAnchor(anchorTarget as string);
      };
      const handleExternalClick = (event: MouseEvent<HTMLAnchorElement>) => {
        if (!canOpenInSystemBrowser(href)) return;

        event.preventDefault();
        void desktopApi.openExternal(href);
      };

      return (
        <a
          className={linkClassName}
          href={href}
          onClick={isAnchorLink ? handleAnchorClick : handleExternalClick}
          rel={isAnchorLink ? undefined : "noreferrer"}
          target={isAnchorLink ? undefined : "_blank"}
        >
          {children}
        </a>
      );
    },
    input({
      checked,
      disabled,
      type,
    }: {
      checked?: boolean;
      disabled?: boolean;
      type?: string;
    }) {
      if (type !== "checkbox") {
        return null;
      }

      return (
        <MarkdownTaskCheckbox
          checked={checked}
          disabled={disabled}
          tone={tone}
        />
      );
    },
    // Inline code only — block code (```...```) is intercepted by Streamdown's
    // built-in CodeBlock before reaching this slot, so styling here is for the
    // single-backtick path.
    inlineCode({
      className: codeClassName,
      children,
      node: _node,
      ...props
    }: {
      className?: string;
      children?: ReactNode;
      node?: unknown;
    }) {
      const filePathHandlers = options?.filePath;
      if (filePathHandlers) {
        const text = extractInlineCodeText(children);
        const candidate = text ? parseFilePathCandidate(text) : null;
        if (candidate) {
          return (
            <MarkdownFilePathCode
              candidate={candidate}
              className={codeClassName}
              handlers={filePathHandlers}
              tone={tone}
            >
              {children}
            </MarkdownFilePathCode>
          );
        }
      }

      return (
        <code
          className={cn(
            "break-words rounded-control border px-1.5 py-0.5 font-normal text-[0.92em]",
            getInlineCodeToneClass(tone),
            codeClassName,
          )}
          {...props}
        >
          {children}
        </code>
      );
    },
    hr() {
      return (
        <div
          className={cn(
            "h-px",
            tone === "editor" ? "bg-editor-border" : "bg-chat-border-soft",
          )}
        />
      );
    },
    strong({ children }: { children?: ReactNode }) {
      return <strong className="font-semibold text-inherit">{children}</strong>;
    },
    em({ children }: { children?: ReactNode }) {
      return <em className="italic text-inherit">{children}</em>;
    },
    del({ children }: { children?: ReactNode }) {
      return <del className="line-through opacity-70">{children}</del>;
    },
    sup({ children }: { children?: ReactNode }) {
      return <sup className="text-[0.72em] leading-none">{children}</sup>;
    },
    section({
      children,
      dataFootnotes,
    }: {
      children?: ReactNode;
      dataFootnotes?: boolean;
    }) {
      return (
        <section
          className={cn(
            dataFootnotes ? "mt-3 border-t pt-2 text-body" : "text-sm",
            dataFootnotes && tone === "editor"
              ? "border-editor-border"
              : "border-chat-border-soft",
            getToneTextClass(tone),
          )}
        >
          {children}
        </section>
      );
    },
  };
}
