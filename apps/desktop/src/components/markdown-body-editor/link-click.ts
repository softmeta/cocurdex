import {
  ENTITY_URI_PREFIX,
  type EntityRef,
  parseEntityRef,
} from "@cocurdex/shared";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { desktopApi } from "@/lib";
import { openEntity } from "@/lib/entity-events";

const EXTERNAL_LINK_PROTOCOLS = ["http:", "https:", "mailto:"];

export type LinkClickTarget =
  | { kind: "entity"; ref: EntityRef | null }
  | { kind: "external"; url: string };

export function resolveLinkClickTarget(href: string): LinkClickTarget | null {
  if (href.startsWith(ENTITY_URI_PREFIX)) {
    return { kind: "entity", ref: parseEntityRef(href) };
  }
  if (!URL.canParse(href)) return null;
  const url = new URL(href);
  return EXTERNAL_LINK_PROTOCOLS.includes(url.protocol)
    ? { kind: "external", url: url.href }
    : null;
}

export const LinkClick = Extension.create({
  name: "linkClick",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("linkClick"),
        props: {
          handleClick: (_view, _pos, event) => {
            const target = event.target;
            if (!(target instanceof Element)) return false;
            const href = target.closest("a")?.getAttribute("href") ?? "";
            const linkTarget = resolveLinkClickTarget(href);
            if (!linkTarget) return false;
            event.preventDefault();
            if (linkTarget.kind === "external") {
              void desktopApi.openExternal(linkTarget.url);
            } else if (linkTarget.ref) {
              openEntity(linkTarget.ref);
            }
            return true;
          },
        },
      }),
    ];
  },
});
