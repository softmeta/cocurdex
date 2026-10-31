import type { EntityRef } from "@cocurdex/shared";
import useSWR, { mutate } from "swr";
import { desktopApi, requestDaemon } from "@/lib";
import { useMountEffect } from "@/lib/react-hooks";

const LINK_LIST_METHOD = "link.list";
const LINK_CANDIDATES_KEY = "link.candidates";
const LINK_AREAS = new Set(["links", "notes", "issues", "decks", "agent"]);

function isLinkKey(key: unknown) {
  return (
    key === LINK_CANDIDATES_KEY ||
    (Array.isArray(key) && key[0] === LINK_LIST_METHOD)
  );
}

export function revalidateEntityLinks() {
  return mutate(isLinkKey);
}

function useEntityLinksRevalidation() {
  useMountEffect(() =>
    desktopApi.onDataChanged((event) => {
      if (event.areas.some((area) => LINK_AREAS.has(area))) {
        void revalidateEntityLinks();
      }
    }),
  );
}

export function useEntityLinks(ref: EntityRef) {
  useEntityLinksRevalidation();
  return useSWR(
    [LINK_LIST_METHOD, ref.kind, ref.id],
    () => requestDaemon("link.list", { ref }),
    { dedupingInterval: 0 },
  );
}

export function useEntityLinkCandidates() {
  return useSWR(LINK_CANDIDATES_KEY, () => requestDaemon("link.candidates"), {
    dedupingInterval: 0,
  });
}
