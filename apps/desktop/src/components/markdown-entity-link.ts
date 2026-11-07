import {
  ENTITY_URI_PREFIX,
  type EntityRef,
  entityUri,
  parseEntityRef,
} from "@cocurdex/shared";

const ENTITY_LINK_ORIGIN = "https://cocurdex.entity/";

type HtmlNode = {
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HtmlNode[];
};

function rewriteEntityAnchors(node: HtmlNode) {
  const href = node.properties?.href;
  if (
    node.tagName === "a" &&
    typeof href === "string" &&
    href.startsWith(ENTITY_URI_PREFIX)
  ) {
    const entity = parseEntityRef(href);
    if (entity && node.properties) {
      node.properties.href =
        ENTITY_LINK_ORIGIN + entityUri(entity).slice(ENTITY_URI_PREFIX.length);
    }
  }
  node.children?.forEach(rewriteEntityAnchors);
}

export function rehypeEntityLinks() {
  return rewriteEntityAnchors;
}

export function parseEntityLinkHref(
  href: string | undefined,
): EntityRef | null {
  if (!href?.startsWith(ENTITY_LINK_ORIGIN)) return null;
  return parseEntityRef(
    ENTITY_URI_PREFIX + href.slice(ENTITY_LINK_ORIGIN.length),
  );
}
