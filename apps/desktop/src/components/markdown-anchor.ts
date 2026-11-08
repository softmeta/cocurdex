import { slug } from "github-slugger";

export function slugifyHeading(text: string): string {
  return slug(text);
}

interface HastTextNode {
  value?: string;
  children?: unknown[];
}

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
