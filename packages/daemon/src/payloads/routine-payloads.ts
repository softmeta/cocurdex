import {
  ROUTINE_ACCESS_VALUES,
  ROUTINE_DELIVER_VALUES,
  ROUTINE_MIN_INTERVAL_MINUTES,
} from "@cocurdex/shared";
import { z } from "zod";
import {
  boundedTextSchema,
  exact,
  idSchema,
  loose,
  type Payload,
  type PayloadSchemas,
} from "./primitives";

const nameSchema = boundedTextSchema(200).pipe(z.string().trim().min(1));
const promptSchema = boundedTextSchema(20_000).pipe(z.string().trim().min(1));
const timeZoneSchema = boundedTextSchema(100);

const scheduleSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("interval"),
    minutes: z
      .number()
      .int()
      .min(ROUTINE_MIN_INTERVAL_MINUTES)
      .max(7 * 24 * 60),
  }),
  z.object({
    kind: z.literal("daily"),
    time: z.string().regex(/^\d{2}:\d{2}$/),
    weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7).nullable(),
  }),
]);

const accessSchema = z.enum(ROUTINE_ACCESS_VALUES);
const deliverSchema = z.enum(ROUTINE_DELIVER_VALUES);

export const routinePayloadSchemas: PayloadSchemas = {
  "routine.list": exact<Payload<"routine.list">>()(
    z.object({ agentId: idSchema.nullish() }),
  ),
  "routine.get": exact<Payload<"routine.get">>()(z.object({ id: idSchema })),
  "routine.create": loose<Payload<"routine.create">>()(
    z.object({
      agentId: idSchema,
      name: nameSchema,
      prompt: promptSchema,
      schedule: scheduleSchema,
      timeZone: timeZoneSchema.optional(),
      access: accessSchema.optional(),
      deliver: deliverSchema.optional(),
    }),
  ),
  "routine.update": loose<Payload<"routine.update">>()(
    z.object({
      id: idSchema,
      name: nameSchema.optional(),
      prompt: promptSchema.optional(),
      schedule: scheduleSchema.optional(),
      timeZone: timeZoneSchema.optional(),
      access: accessSchema.optional(),
      deliver: deliverSchema.optional(),
      paused: z.boolean().optional(),
    }),
  ),
  "routine.delete": exact<Payload<"routine.delete">>()(
    z.object({ id: idSchema }),
  ),
  "routine.run": exact<Payload<"routine.run">>()(z.object({ id: idSchema })),
  "routine.runs": exact<Payload<"routine.runs">>()(
    z.object({
      routineId: idSchema.nullish(),
      limit: z.number().int().min(1).max(200).optional(),
    }),
  ),
};
