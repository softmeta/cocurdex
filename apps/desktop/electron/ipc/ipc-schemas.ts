import path from "node:path";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { z } from "zod";

const filesystemPathSchema = z
  .string()
  .min(1)
  .max(4096)
  .refine((value) => !value.includes("\0"), "path contains null byte")
  .refine((value) => path.isAbsolute(value), "path must be absolute");

export const httpUrlSchema = z
  .string()
  .url()
  .refine(
    (value) => value.startsWith("http://") || value.startsWith("https://"),
    "URL scheme not allowed",
  );

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export const loopbackHttpUrlSchema = httpUrlSchema.refine((value) => {
  const url = new URL(value);
  return url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
}, "URL must point at the local daemon");

const browserAnnotationSchema = z
  .object({
    id: z.string().min(1).max(256),
    type: z.union([z.literal("element"), z.literal("region")]),
    selector: z.string().max(4096).optional(),
    tagName: z.string().max(64).optional(),
    textContent: z.string().max(20_000).optional(),
    boundingBox: z.object({
      x: z.number().finite(),
      y: z.number().finite(),
      width: z.number().finite().nonnegative(),
      height: z.number().finite().nonnegative(),
    }),
    regionScreenshot: z
      .string()
      .max(20_000_000)
      .refine(
        (value) => value.startsWith("data:image/"),
        "screenshot must be an image data URL",
      )
      .optional(),
    pageUrl: z.string().max(4096),
    note: z.string().max(20_000).optional(),
    styleChanges: z
      .array(
        z
          .object({
            property: z.string().max(64),
            from: z.string().max(512),
            to: z.string().max(512),
          })
          .strict(),
      )
      .max(32)
      .optional(),
    capturedAt: z.string().max(64),
  })
  .strict();

const boundsSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  w: z.number().finite().nonnegative(),
  h: z.number().finite().nonnegative(),
  viewportWidth: z.number().finite().nonnegative(),
  viewportHeight: z.number().finite().nonnegative(),
  anchorX: z.enum(["start", "end", "stretch"]).optional(),
  anchorY: z.enum(["start", "end", "stretch"]).optional(),
});

export const schemas = {
  rootPath: filesystemPathSchema,
  filePath: filesystemPathSchema,
  url: httpUrlSchema,
  loopbackUrl: loopbackHttpUrlSchema,
  audienceWindow: z.object({
    channel: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
  }),
  browserAnnotation: browserAnnotationSchema,
  browserAnnotationAction: z.enum(["send", "clear", "exit"]),
  browserAnnotationMarkers: z.tuple([
    z.string().min(1).max(256),
    z.array(z.string().min(1).max(256)).max(1000),
  ]),
  bounds: boundsSchema,
  visible: z.boolean(),
  enabled: z.boolean(),
  themeSource: z.enum(["system", "light", "dark"]),
  hexColor: z
    .string()
    .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/),
} as const;

type Handler<T, R> = (event: IpcMainInvokeEvent, payload: T) => Promise<R> | R;
type HandlerArgs<T extends z.ZodTuple<z.ZodType[]>, R> = (
  event: IpcMainInvokeEvent,
  ...args: z.infer<T>
) => Promise<R> | R;

export function registerHandler<T, R>(
  ipc: IpcMain,
  channel: string,
  schema: z.ZodType<T>,
  handler: Handler<T, R>,
) {
  ipc.handle(channel, async (event, payload: unknown) => {
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw new Error(
        `Invalid payload for ${channel}: ${parsed.error.issues
          .map((issue) => `${issue.path.join(".")} ${issue.message}`)
          .join("; ")}`,
      );
    }
    return handler(event, parsed.data);
  });
}

export function registerHandlerArgs<T extends z.ZodTuple<z.ZodType[]>, R>(
  ipc: IpcMain,
  channel: string,
  schema: T,
  handler: HandlerArgs<T, R>,
) {
  ipc.handle(channel, async (event, ...args: unknown[]) => {
    const parsed = schema.safeParse(args);
    if (!parsed.success) {
      throw new Error(
        `Invalid arguments for ${channel}: ${parsed.error.issues
          .map((issue) => `${issue.path.join(".")} ${issue.message}`)
          .join("; ")}`,
      );
    }
    return handler(event, ...(parsed.data as z.infer<T>));
  });
}
