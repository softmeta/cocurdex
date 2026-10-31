import type {
  EntityLink,
  EntityLinkCandidate,
  EntityRef,
} from "@cocurdex/shared";

export interface EntityLinksRepository {
  resolve(ref: EntityRef): Promise<EntityRef | null>;
  list(ref: EntityRef): Promise<EntityLink[]>;
  candidates(): Promise<EntityLinkCandidate[]>;
  add(source: EntityRef, target: EntityRef): Promise<boolean>;
  remove(source: EntityRef, target: EntityRef): Promise<boolean>;
}
