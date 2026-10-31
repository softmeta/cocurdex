import { z } from "zod";
import { boundedTextSchema, type PayloadSchemas } from "./primitives";

const memoryCloudConnectSchema = z.object({
  mode: z.enum(["register", "signin"]),
  user: boundedTextSchema(64).pipe(z.string().trim().min(1)),
  password: z.string().min(1).max(256),
  recoveryKey: z.string().max(512).nullish(),
});

export const memoryPayloadSchemas: PayloadSchemas = {
  "memory.cloud.connect": memoryCloudConnectSchema,
  "memory.cloud.setSync": z.object({ enabled: z.boolean() }),
};
