import { z } from "zod";
import { boundedTextSchema, exact, idSchema, type Payload } from "./primitives";

const id = z.object({ id: idSchema });
const login = z.object({ id: idSchema, loginId: idSchema });
const grant = {
  displayName: boundedTextSchema(160).min(1),
  personaIds: z.array(idSchema).max(256),
  allowDelegatedWork: z.boolean(),
};
export const applicationPayloadSchemas = {
  "application.add": exact<Payload<"application.add">>()(
    z.object({
      ...grant,
      applicationId: z.enum(["notion", "linear", "github"]),
    }),
  ),
  "application.update": exact<Payload<"application.update">>()(
    z.object({
      ...grant,
      id: idSchema,
      revision: idSchema,
      enabled: z.boolean(),
    }),
  ),
  "application.remove": exact<Payload<"application.remove">>()(id),
  "application.check": exact<Payload<"application.check">>()(id),
  "application.logout": exact<Payload<"application.logout">>()(id),
  "application.login.start": exact<Payload<"application.login.start">>()(id),
  "application.login.wait": exact<Payload<"application.login.wait">>()(login),
  "application.login.cancel":
    exact<Payload<"application.login.cancel">>()(login),
  "application.login.return": exact<Payload<"application.login.return">>()(
    login.extend({ url: boundedTextSchema(8192).min(1) }),
  ),
  "application.tools": exact<Payload<"application.tools">>()(id),
  "application.read": exact<Payload<"application.read">>()(
    id.extend({
      tool: boundedTextSchema(256).min(1),
      args: z
        .record(z.string(), z.unknown())
        .refine(
          (value) => JSON.stringify(value).length <= 200_000,
          "Arguments are too large",
        ),
    }),
  ),
  "application.call": exact<Payload<"application.call">>()(
    id.extend({
      tool: boundedTextSchema(256).min(1),
      args: z
        .record(z.string(), z.unknown())
        .refine(
          (value) => JSON.stringify(value).length <= 200_000,
          "Arguments are too large",
        ),
    }),
  ),
};
