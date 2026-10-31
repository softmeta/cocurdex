import { z } from "zod";
import {
  exact,
  filesystemPathSchema,
  idSchema,
  type Payload,
  type PayloadSchemas,
} from "./primitives";

const terminalSize = {
  cols: z.number().int().positive().max(1000),
  rows: z.number().int().positive().max(1000),
};

const pathPayload = z.object({ path: filesystemPathSchema });

export const systemPayloadSchemas: PayloadSchemas = {
  "diagnostics.export": exact<Payload<"diagnostics.export">>()(
    z.object({
      hostLogDirectories: z
        .array(
          z.object({
            name: z.string().min(1).max(64),
            path: filesystemPathSchema,
          }),
        )
        .max(8)
        .optional(),
      hostMetadata: z.record(z.string(), z.unknown()).optional(),
    }),
  ),
  "diagnostics.logLevel.set": exact<Payload<"diagnostics.logLevel.set">>()(
    z.object({ level: z.enum(["debug", "info"]) }),
  ),
  "system.openDirectory": exact<Payload<"system.openDirectory">>()(pathPayload),
  "system.revealPath": exact<Payload<"system.revealPath">>()(pathPayload),
  "terminal.spawn": exact<Payload<"terminal.spawn">>()(
    z.object({
      terminalId: idSchema,
      workspaceId: idSchema,
      cwd: filesystemPathSchema,
      ...terminalSize,
    }),
  ),
  "terminal.write": exact<Payload<"terminal.write">>()(
    z.object({ terminalId: idSchema, data: z.string().max(1_000_000) }),
  ),
  "terminal.resize": exact<Payload<"terminal.resize">>()(
    z.object({ terminalId: idSchema, ...terminalSize }),
  ),
  "terminal.kill": exact<Payload<"terminal.kill">>()(
    z.object({ terminalId: idSchema }),
  ),
};
