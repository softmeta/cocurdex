import type {
  EntityLink,
  EntityLinkRelation,
  EntityRef,
} from "@cocurdex/shared";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { entityLinkHref } from "@/markdown";
import { FormRow, FormSection } from "@/ui";
import { useEntityLinks } from "./entity-links-queries";

function linkKey(link: EntityLink) {
  return `${link.relation}:${link.target.kind}:${link.target.id}`;
}

function useRelationLabels(): Record<EntityLinkRelation, string> {
  const { t } = useTranslation("common");
  return {
    related: t("links.relation.related"),
    mentions: t("links.relation.mentions"),
    "mentioned-by": t("links.relation.mentioned-by"),
    blocks: t("links.relation.blocks"),
    "blocked-by": t("links.relation.blocked-by"),
    "duplicate-of": t("links.relation.duplicate-of"),
    "duplicated-by": t("links.relation.duplicated-by"),
    parent: t("links.relation.parent"),
    child: t("links.relation.child"),
    "worked-on-by": t("links.relation.worked-on-by"),
    "works-on": t("links.relation.works-on"),
  };
}

export function useLinkedEntityRows(
  hostId: string,
  entity: EntityRef,
  hideLink?: (link: EntityLink) => boolean,
) {
  const { t } = useTranslation("common");
  const router = useRouter();
  const relations = useRelationLabels();
  const { data = [] } = useEntityLinks(hostId, entity);
  return data
    .filter((link) => !hideLink?.(link))
    .map((link) => {
      const href = entityLinkHref(hostId, link.target);
      return {
        key: linkKey(link),
        testID: `linked-${link.target.kind}-${link.target.id}`,
        title: link.title || t("links.untitled"),
        detail: [relations[link.relation], link.detail]
          .filter(Boolean)
          .join(" · "),
        onPress: href ? () => router.push(href) : undefined,
      };
    });
}

export function LinkedEntitiesSection({
  hostId,
  entity,
  hideLink,
}: {
  hostId: string;
  entity: EntityRef;
  hideLink?: (link: EntityLink) => boolean;
}) {
  const { t } = useTranslation("common");
  const rows = useLinkedEntityRows(hostId, entity, hideLink);
  if (rows.length === 0) return null;
  return (
    <FormSection title={t("links.title")}>
      {rows.map((row) => (
        <FormRow
          key={row.key}
          testID={row.testID}
          onPress={row.onPress}
          supporting={row.detail}
        >
          {row.title}
        </FormRow>
      ))}
    </FormSection>
  );
}
