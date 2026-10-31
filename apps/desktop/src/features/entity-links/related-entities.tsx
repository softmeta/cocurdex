import {
  type EntityLink,
  type EntityRef,
  entityUri,
  LINKABLE_ENTITY_KINDS,
  parseEntityRef,
  sameEntity,
} from "@cocurdex/shared";
import { Link2, Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AppSearchableSelect } from "@/components/app";
import { IconButton, Text } from "@/components/ui";
import { openEntity, requestDaemon } from "@/lib";
import { ENTITY_KIND_ICONS } from "./entity-kind-icons";
import {
  revalidateEntityLinks,
  useEntityLinkCandidates,
  useEntityLinks,
} from "./entity-links-queries";

interface RelatedEntitiesProps {
  entity: EntityRef;
  hideLink?: (link: EntityLink) => boolean;
}

function linkKey(link: EntityLink) {
  return `${link.relation}:${link.target.kind}:${link.target.id}`;
}

async function changeLink(
  method: "link.add" | "link.remove",
  source: EntityRef,
  target: EntityRef,
) {
  try {
    await requestDaemon(method, { source, target });
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error));
  }
  await revalidateEntityLinks();
}

export function RelatedEntities({ entity, hideLink }: RelatedEntitiesProps) {
  const { t } = useTranslation("common");
  const { data: links = [] } = useEntityLinks(entity);
  const visible = hideLink ? links.filter((link) => !hideLink(link)) : links;
  const copyLink = () => {
    void navigator.clipboard
      .writeText(entityUri(entity))
      .then(() => toast.success(t("links.copied")))
      .catch(() => {});
  };

  return (
    <section
      aria-label={t("links.title")}
      className="flex flex-col gap-0.5 border-t border-editor-border/60 py-2.5"
    >
      <div className="flex h-7 items-center justify-between gap-2">
        <Text size="meta" weight="medium" className="text-editor-fg-muted">
          {t("links.title")}
        </Text>
        <div className="flex items-center gap-0.5">
          <IconButton aria-label={t("links.copy")} onClick={copyLink} size="sm">
            <Link2 className="size-3.5" />
          </IconButton>
          <AddEntityLink entity={entity} links={links} />
        </div>
      </div>
      {visible.map((link) => (
        <RelatedEntityRow
          key={linkKey(link)}
          link={link}
          onRemove={() => void changeLink("link.remove", entity, link.target)}
        />
      ))}
    </section>
  );
}

function RelatedEntityRow({
  link,
  onRemove,
}: {
  link: EntityLink;
  onRemove: () => void;
}) {
  const { t } = useTranslation("common");
  const Icon = ENTITY_KIND_ICONS[link.target.kind];
  return (
    <div
      className="group flex h-7 min-w-0 items-center gap-1 rounded-control hover:bg-editor-tab-hover-bg"
      data-entity-link={`${link.target.kind}:${link.target.id}`}
    >
      <button
        type="button"
        onClick={() => openEntity(link.target)}
        className="flex h-full min-w-0 flex-1 items-center gap-2 px-1.5 text-start"
      >
        <Icon className="size-3.5 shrink-0 text-editor-fg-subtle" />
        {link.detail ? (
          <Text
            size="meta"
            className="shrink-0 tabular-nums text-editor-fg-subtle"
          >
            {link.detail}
          </Text>
        ) : null}
        <Text size="meta" truncate className="text-editor-fg">
          {link.title || t("links.untitled")}
        </Text>
        <Text size="meta" className="ms-auto shrink-0 text-editor-fg-subtle">
          {t(`links.relation.${link.relation}`)}
        </Text>
      </button>
      {link.removable ? (
        <IconButton
          aria-label={t("links.remove", { title: link.title })}
          onClick={onRemove}
          size="sm"
        >
          <X className="size-3.5" />
        </IconButton>
      ) : (
        <span aria-hidden className="size-7 shrink-0" />
      )}
    </div>
  );
}

function AddEntityLink({
  entity,
  links,
}: {
  entity: EntityRef;
  links: readonly EntityLink[];
}) {
  const { t } = useTranslation("common");
  const { data: candidates = [] } = useEntityLinkCandidates();
  const linked = links.filter((link) => link.removable);
  const options = LINKABLE_ENTITY_KINDS.flatMap((kind) =>
    candidates
      .filter(
        (candidate) =>
          candidate.target.kind === kind &&
          !sameEntity(candidate.target, entity) &&
          !linked.some((link) => sameEntity(link.target, candidate.target)),
      )
      .map((candidate) => {
        const Icon = ENTITY_KIND_ICONS[kind];
        return {
          value: entityUri(candidate.target),
          label: candidate.detail
            ? `${candidate.detail} ${candidate.title}`
            : candidate.title || t("links.untitled"),
          keywords: candidate.detail ?? undefined,
          icon: <Icon className="size-3.5" />,
          group: kind,
          groupLabel: t(`links.kind.${kind}`),
        };
      }),
  );
  return (
    <AppSearchableSelect
      value=""
      onValueChange={(value) => {
        const target = parseEntityRef(value);
        if (target) void changeLink("link.add", entity, target);
      }}
      options={options}
      align="end"
      searchPlaceholder={t("links.search")}
      emptyText={t("links.empty")}
      triggerAriaLabel={t("links.add")}
      showChevron={false}
      trigger={
        <IconButton aria-label={t("links.add")} size="sm" tooltip={false}>
          <Plus className="size-3.5" />
        </IconButton>
      }
    />
  );
}
