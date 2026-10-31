import type {
  ImportDocImagePayload,
  LocateDocImagePayload,
} from "@cocurdex/shared";
import { z } from "zod";
import type { PayloadSchemas } from "./primitives";

const importImage = z.object({
  path: z.string().min(1).max(4096),
  name: z.string().trim().min(1).max(255).optional(),
}) satisfies z.ZodType<ImportDocImagePayload>;

const locateImage = z.object({
  uri: z.string().min(1).max(512),
}) satisfies z.ZodType<LocateDocImagePayload>;

export const imagePayloadSchemas = {
  "image.import": importImage,
  "image.locate": locateImage,
} satisfies PayloadSchemas;
