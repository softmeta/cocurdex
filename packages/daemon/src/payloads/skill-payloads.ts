import { SKILL_LINK_AGENTS } from "@cocurdex/shared";
import { z } from "zod";
import {
  exact,
  filesystemPathSchema,
  idSchema,
  noNullByte,
  type Payload,
  type PayloadSchemas,
} from "./primitives";

const packPayload = z.object({
  scope: z.enum(["project", "global"]),
  workspaceRootPath: filesystemPathSchema.nullish(),
});

const skillName = z.string().min(1).max(256);
const sourceText = z.string().trim().min(1).max(4096).refine(noNullByte);
const refText = z.string().trim().min(1).max(256).nullish();
const skillPath = z.string().max(1024);

const refFields = {
  scope: z.enum(["global", "workspace"]),
  workspaceId: idSchema.nullish(),
  name: skillName,
};
const skillRef = z.object(refFields);
const listPayload = z.object({ workspaceId: idSchema.nullish() });

export const skillPayloadSchemas: PayloadSchemas = {
  "skills.pack.getStatus":
    exact<Payload<"skills.pack.getStatus">>()(packPayload),
  "skills.pack.install": exact<Payload<"skills.pack.install">>()(packPayload),
  "skills.pack.remove": exact<Payload<"skills.pack.remove">>()(packPayload),
  "skills.pack.show": exact<Payload<"skills.pack.show">>()(
    z.object({ name: skillName }),
  ),
  "skills.list": exact<Payload<"skills.list">>()(listPayload),
  "skills.show": exact<Payload<"skills.show">>()(skillRef),
  "skills.remove": exact<Payload<"skills.remove">>()(skillRef),
  "skills.share": exact<Payload<"skills.share">>()(skillRef),
  "skills.setAgentLink": exact<Payload<"skills.setAgentLink">>()(
    z.object({
      ...refFields,
      agent: z.enum(SKILL_LINK_AGENTS),
      enabled: z.boolean(),
    }),
  ),
  "skills.resolveDuplicate": exact<Payload<"skills.resolveDuplicate">>()(
    z.object({ ...refFields, keepPath: filesystemPathSchema }),
  ),
  "skills.catalog.search": exact<Payload<"skills.catalog.search">>()(
    z.object({
      query: z.string().max(256),
      limit: z.number().int().min(1).max(100).optional(),
    }),
  ),
  "skills.catalog.audit": exact<Payload<"skills.catalog.audit">>()(
    z.object({
      source: sourceText,
      skillIds: z.array(skillName).max(200),
    }),
  ),
  "skills.source.inspect": exact<Payload<"skills.source.inspect">>()(
    z.object({ source: sourceText, ref: refText }),
  ),
  "skills.source.show": exact<Payload<"skills.source.show">>()(
    z.object({ source: sourceText, ref: refText, skillPath }),
  ),
  "skills.add": exact<Payload<"skills.add">>()(
    z.object({
      scope: refFields.scope,
      workspaceId: refFields.workspaceId,
      source: sourceText,
      ref: refText,
      skillPaths: z.array(skillPath).min(1).max(500),
      agents: z.array(z.enum(SKILL_LINK_AGENTS)).max(SKILL_LINK_AGENTS.length),
      replace: z.array(skillName).max(500),
    }),
  ),
  "skills.updates.check": exact<Payload<"skills.updates.check">>()(listPayload),
  "skills.updates.preview":
    exact<Payload<"skills.updates.preview">>()(skillRef),
  "skills.updates.apply": exact<Payload<"skills.updates.apply">>()(
    z.object({ skills: z.array(skillRef).min(1).max(500) }),
  ),
  "skills.updates.skip": exact<Payload<"skills.updates.skip">>()(
    z.object({
      ...refFields,
      latestCommit: z.string().regex(/^[0-9a-f]{40}$/),
    }),
  ),
};
