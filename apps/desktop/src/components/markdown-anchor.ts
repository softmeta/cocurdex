// GitHub-flavored heading slugs and same-document anchor navigation.
//
// Streamdown does not inject heading `id`s (its default rehype chain only ships
// sanitize + harden), and its harden step rewrites relative `#section` links to
// absolute URLs (e.g. `file:///.../index.html#section`). Both break in-document
// table-of-contents links: the target heading has no id to scroll to, and the
// link no longer starts with `#`, so it gets treated as an external link.
//
// We solve both here: generate slugs with github-slugger (the de-facto standard
// the assistant follows when authoring TOC anchors) so heading ids match the
// emitted anchors across the full Unicode punctuation table — including
// full-width CJK punctuation like `（）` — and resolve same-document anchors
// whether the href is a bare hash or an absolute URL pointing at this document.

import { slug } from "github-slugger";

export function slugifyHeading(text: string): string {
  return slug(text);
}

interface HastTextNode {
  value?: string;
  children?: unknown[];
}

// Extract the plain text of a hast element/node tree for slug generation.
export function extractNodeText(node: unknown): string {
  if (!node || typeof node !== "object") {
    return "";
  }

  const textNode = node as HastTextNode;
  if (typeof textNode.value === "string") {
    return textNode.value;
  }

  return (textNode.children ?? []).map(extractNodeText).join("");
}

// Returns the decoded target id when `href` points to an anchor in the current
// document, otherwise null (external link). Handles both the bare `#section`
// form and the absolute-URL form harden rewrites links into.
export function resolveAnchorTarget(href: string | undefined): string | null {
  if (!href) {
    return null;
  }

  if (href.startsWith("#")) {
    return decodeURIComponent(href.slice(1)) || null;
  }

  if (typeof window === "undefined") {
    return null;
  }

  try {
    const url = new URL(href, window.location.href);
    const here = window.location;
    const sameDocument =
      url.hash !== "" &&
      url.origin === here.origin &&
      url.pathname === here.pathname;
    return sameDocument ? decodeURIComponent(url.hash.slice(1)) || null : null;
  } catch {
    return null;
  }
}

export function scrollToAnchor(targetId: string): void {
  if (typeof document === "undefined") {
    return;
  }

  const element = document.getElementById(targetId);
  element?.scrollIntoView?.({ behavior: "smooth", block: "start" });
}
