import {
  PERSONAL_AGENT_SOUL_MAX_LENGTH,
  PERSONAL_AGENT_USER_ADDRESS_MAX_LENGTH,
  supportedLocales,
} from "@cocurdex/shared";
import { z } from "zod";
import {
  agentIdSchema,
  boundedTextSchema,
  exact,
  idSchema,
  loose,
  type Payload,
  type PayloadSchemas,
} from "./primitives";
import { agentRoleAvatarSchema } from "./session-payloads";

const nameSchema = boundedTextSchema(200).pipe(z.string().trim().min(1));

const roleSchema = z.looseObject({
  name: nameSchema,
  agentId: agentIdSchema,
  avatar: agentRoleAvatarSchema.nullish(),
});

const soulSchema = z.string().max(PERSONAL_AGENT_SOUL_MAX_LENGTH).nullish();
const userAddressSchema = z
  .string()
  .max(PERSONAL_AGENT_USER_ADDRESS_MAX_LENGTH * 4)
  .nullish();

export const personalPayloadSchemas: PayloadSchemas = {
  "personalAgent.create": loose<Payload<"personalAgent.create">>()(
    z.object({
      role: roleSchema,
      soul: soulSchema,
      userAddress: userAddressSchema,
    }),
  ),
  "personalAgent.draft": exact<Payload<"personalAgent.draft">>()(
    z.object({ locale: z.enum(supportedLocales).nullish() }),
  ),
  "personalAgent.greet": exact<Payload<"personalAgent.greet">>()(
    z.object({
      id: idSchema,
      locale: z.enum(supportedLocales).nullish(),
    }),
  ),
  "personalAgent.update": loose<Payload<"personalAgent.update">>()(
    z.object({
      id: idSchema,
      role: roleSchema.optional(),
      soul: soulSchema,
      userAddress: userAddressSchema,
      pinned: z.boolean().optional(),
      muted: z.boolean().optional(),
      sortOrder: z.number().finite().optional(),
    }),
  ),
  "personalAgent.duplicate": exact<Payload<"personalAgent.duplicate">>()(
    z.object({ id: idSchema, name: nameSchema }),
  ),
  "personalAgent.delete": exact<Payload<"personalAgent.delete">>()(
    z.object({ id: idSchema }),
  ),
};
