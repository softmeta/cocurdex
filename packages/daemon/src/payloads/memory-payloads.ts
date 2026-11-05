import { z } from "zod";
import {
  boundedTextSchema,
  exact,
  filesystemPathSchema,
  idSchema,
  type Payload,
  type PayloadSchemas,
} from "./primitives";

const partitionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("me") }),
  z.object({ kind: z.literal("agent"), agentId: idSchema }),
]);

const limitSchema = z.number().int().min(1).max(500).optional();

const memoryCloudConnectSchema = z.object({
  mode: z.enum(["register", "signin"]),
  user: boundedTextSchema(64).pipe(z.string().trim().min(1)),
  password: z.string().min(1).max(256),
  recoveryKey: z.string().max(512).nullish(),
});

export const memoryPayloadSchemas: PayloadSchemas = {
  "memory.cloud.connect": memoryCloudConnectSchema,
  "memory.cloud.setSync": z.object({ enabled: z.boolean() }),
  "memory.list": exact<Payload<"memory.list">>()(
    z.object({
      limit: limitSchema,
      since: boundedTextSchema(64).nullish(),
      partition: partitionSchema.nullish(),
    }),
  ),
  "memory.update": exact<Payload<"memory.update">>()(
    z.object({
      id: idSchema,
      title: boundedTextSchema(500).optional(),
      content: z.string().max(200_000).optional(),
      tags: z.array(boundedTextSchema(100)).max(50).optional(),
      importance: z.enum(["important", "trivial"]).optional(),
    }),
  ),
  "memory.forget": exact<Payload<"memory.forget">>()(
    z.object({ id: idSchema }),
  ),
  "memory.restore": exact<Payload<"memory.restore">>()(
    z.object({ id: idSchema }),
  ),
  "memory.history": exact<Payload<"memory.history">>()(
    z.object({ id: idSchema.nullish(), limit: limitSchema }),
  ),
  "memory.export": exact<Payload<"memory.export">>()(
    z.object({ file: filesystemPathSchema }),
  ),
  "memory.import": exact<Payload<"memory.import">>()(
    z.object({ file: filesystemPathSchema }),
  ),
};
