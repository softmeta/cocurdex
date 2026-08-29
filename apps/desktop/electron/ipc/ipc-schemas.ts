import path from "node:path";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { z } from "zod";

// Boundary validation for IPC handlers. The renderer is the sole client today,
// but Electron's preload bridge is still an explicit trust boundary: a renderer
// compromise (XSS, malicious browserView page bleeding into the main window)
// could drive these handlers with arbitrary payloads. Enforce shape and string
// constraints up front so handlers can assume well-formed input.

export const idSchema = z
  .string()
  .min(1)
  .max(256)
  // Allow UUIDs, slugs, and ISO-ish identifiers but reject control chars and
  // path separators that have no legitimate place in an ID.
  .regex(/^[A-Za-z0-9_.:@-]+$/);

export const isoTimestampSchema = z.string().datetime({ offset: true });

export const filesystemPathSchema = z
  .string()
  .min(1)
  .max(4096)
  .refine((value) => !value.includes("\0"), "path contains null byte")
  .refine((value) => path.isAbsolute(value), "path must be absolute");

const gitRelativePathSchema = z
  .string()
  .min(1)
  .max(4096)
  .refine((value) => !value.includes("\0"), "path contains null byte")
  .refine((value) => !path.isAbsolute(value), "path must be relative")
  .refine(
    (value) => !value.split(/[\\/]+/).includes(".."),
    "path must stay within the workspace",
  );

// Only web URLs. file:// is deliberately excluded: shell.openExternal on a
// file URL launches local files (a code-execution primitive on Windows), and
// loading file URLs in the in-app browser view would let a compromised
// renderer read local files. Local content flows through dedicated protocols
// (e.g. pdf-asset) instead.
export const httpUrlSchema = z
  .string()
  .url()
  .refine(
    (value) => value.startsWith("http://") || value.startsWith("https://"),
    "URL scheme not allowed",
  );

// Annotations originate from arbitrary web pages via the browser view's
// preload bridge — the least trusted input in the app. Strict shape, capped
// string lengths, and a data-URL-only screenshot keep a hostile page from
// smuggling oversized or unexpected payloads to the main renderer.
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
    capturedAt: z.string().max(64),
  })
  .strict();

const decisionSchema = z.union([
  z.literal("allow_once"),
  z.literal("allow_always"),
  z.literal("reject_once"),
  z.literal("reject_always"),
  z.literal("cancelled"),
]);

const boundsSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  w: z.number().finite().nonnegative(),
  h: z.number().finite().nonnegative(),
});

// Loose object schemas: handlers downstream rely on TypeScript types from
// @cocurdex/shared. Doing exhaustive deep validation here would couple this
// file to every record evolution; instead we just guarantee the boundary
// invariants (presence + critical string fields).
const sessionRecordShape = z.object({
  id: idSchema,
  agentType: z.string().min(1).max(64),
});

const workspaceRecordShape = z.object({
  id: idSchema,
  rootPath: filesystemPathSchema,
});

export const schemas = {
  workspaceSave: workspaceRecordShape.passthrough(),
  workspaceId: idSchema,
  rootPath: filesystemPathSchema,
  gitFiles: z.object({
    rootPath: filesystemPathSchema,
    filePaths: z.array(gitRelativePathSchema),
  }),
  gitCommit: z.object({
    rootPath: filesystemPathSchema,
    // Empty string is allowed: the main process fills a Conventional Commits
    // subject from the staged change set when the user leaves the field blank.
    message: z
      .string()
      .max(10_000)
      .refine((value) => !value.includes("\0"), "null byte"),
    includeUnstaged: z.boolean(),
  }),
  // Draft only — never stages or commits. includeUnstaged controls whether
  // the temporary index mirrors the full worktree for model context.
  gitGenerateCommitMessage: z.object({
    rootPath: filesystemPathSchema,
    includeUnstaged: z.boolean(),
  }),
  gitBranch: z.object({
    rootPath: filesystemPathSchema,
    branch: z
      .string()
      .min(1)
      .max(256)
      .refine((value) => !value.includes("\0"), "null byte")
      .refine((value) => !value.startsWith("-"), "option-like branch"),
  }),
  // Diff scope for the git panel. Ref/commit strings are git revisions (branch
  // names, tags, hashes) — not filesystem paths — so they stay free of path
  // separators and null bytes but allow `/` for remote refs (origin/main).
  gitDiffQuery: z.object({
    rootPath: filesystemPathSchema,
    query: z
      .discriminatedUnion("mode", [
        z.object({ mode: z.literal("working") }),
        z.object({ mode: z.literal("unstaged") }),
        z.object({ mode: z.literal("staged") }),
        z.object({
          mode: z.literal("commit"),
          commit: z
            .string()
            .min(1)
            .max(256)
            .refine((value) => !value.includes("\0"), "null byte"),
        }),
        z.object({
          mode: z.literal("branch"),
          // Left selector: branch under review (has the changes).
          source: z
            .string()
            .min(1)
            .max(256)
            .refine((value) => !value.includes("\0"), "null byte"),
          // Right selector: branch to compare against (merge destination).
          target: z
            .string()
            .min(1)
            .max(256)
            .refine((value) => !value.includes("\0"), "null byte"),
        }),
      ])
      .optional(),
  }),
  gitCommitsQuery: z.object({
    rootPath: filesystemPathSchema,
    limit: z.number().int().min(1).max(200).optional(),
  }),
  filePath: filesystemPathSchema,
  sessionId: idSchema,
  messageId: idSchema,
  toolCallId: idSchema,
  questionId: idSchema,
  decision: decisionSchema,
  answer: z.string().max(64_000),
  url: httpUrlSchema,
  browserAnnotation: browserAnnotationSchema,
  bounds: boundsSchema,
  visible: z.boolean(),
  enabled: z.boolean(),
  sessionWithWorkspace: z
    .object({
      session: sessionRecordShape.passthrough(),
      workspaceRootPath: filesystemPathSchema,
    })
    .passthrough(),
  slashCommands: z.object({
    agentType: z.string().min(1).max(64),
    workspaceRootPath: filesystemPathSchema,
  }),
  sessionRuntimeMode: z.object({
    sessionId: idSchema,
    modeId: idSchema,
  }),
  sessionRuntimeConfig: z.object({
    sessionId: idSchema,
    configId: idSchema,
    value: z.union([z.boolean(), z.string().max(4096)]),
  }),
  queuedInput: z.object({
    sessionId: idSchema,
    messageId: idSchema,
  }),
  undoTurnChanges: z.object({
    sessionId: idSchema,
    messageId: idSchema,
  }),
  turnChangeFile: z.object({
    sessionId: idSchema,
    messageId: idSchema,
    path: z.string().min(1).max(4096),
    side: z.enum(["before", "after"]),
  }),
  queuedInputUpdate: z.object({
    sessionId: idSchema,
    messageId: idSchema,
    // Empty text is valid for image-only queued messages; the daemon rejects
    // an edit only when the message ends up with neither text nor attachments.
    content: z.string().max(200_000),
  }),
  sessionPayload: z
    .object({ session: sessionRecordShape.passthrough() })
    .passthrough(),
  sessionIdAndMessageId: z.tuple([idSchema, idSchema]),
  permissionResolve: z.tuple([idSchema, decisionSchema]),
  questionResolve: z.tuple([idSchema, z.string().max(64_000)]),
  planApprovalResolve: z.tuple([
    idSchema,
    z.object({
      outcome: z.enum(["approved", "cancelled", "abandoned"]),
      feedback: z.string().max(64_000).nullish(),
    }),
  ]),
  archive: z
    .object({ sessionId: idSchema, archivedAt: isoTimestampSchema })
    .passthrough(),
  delete: z.object({ sessionId: idSchema }).passthrough(),
  updateTitle: z
    .object({
      sessionId: idSchema,
      title: z.string().min(1).max(2000),
    })
    .passthrough(),
  refineTitle: z
    .object({
      sessionId: idSchema,
      expectedTitle: z.string().max(2000),
      fallbackTitle: z.string().max(2000),
      message: z.string().max(200_000),
    })
    .passthrough(),
  importImage: z
    .object({
      mimeType: z.string().min(1).max(255),
      name: z.string().min(1).max(1024),
      sizeBytes: z.number().int().nonnegative(),
    })
    .passthrough(),
  importDocument: z
    .object({
      dataUrl: z
        .string()
        .max(45_000_000)
        .startsWith("data:application/pdf;base64,"),
      mimeType: z.literal("application/pdf"),
      name: z.string().min(1).max(1024),
      sizeBytes: z
        .number()
        .int()
        .nonnegative()
        .max(32 * 1024 * 1024),
    })
    .strict(),
  readPdf: z.object({
    filePath: filesystemPathSchema,
  }),
  // PDF reader marks (bookmarks + highlights). Stored in userData; the payload
  // is capped so a compromised renderer cannot dump unbounded JSON to disk.
  loadPdfAnnotations: z.object({
    filePath: filesystemPathSchema,
  }),
  savePdfAnnotations: z.object({
    filePath: filesystemPathSchema,
    annotations: z
      .object({
        bookmarks: z
          .array(
            z
              .object({
                id: z.string().min(1).max(256),
                pageNumber: z.number().int().positive().max(1_000_000),
                label: z.string().max(2000).optional(),
                scrollYRatio: z.number().finite().min(0).max(1).optional(),
                createdAt: z.number().finite(),
              })
              .strict(),
          )
          .max(10_000),
        highlights: z
          .array(
            z
              .object({
                id: z.string().min(1).max(256),
                pageNumber: z.number().int().positive().max(1_000_000),
                color: z.enum(["yellow", "green", "blue", "pink"]),
                selectedText: z.string().min(1).max(50_000),
                quads: z
                  .array(
                    z
                      .object({
                        x1: z.number().finite(),
                        y1: z.number().finite(),
                        x2: z.number().finite(),
                        y2: z.number().finite(),
                      })
                      .strict(),
                  )
                  .min(1)
                  .max(500),
                createdAt: z.number().finite(),
              })
              .strict(),
          )
          .max(50_000),
      })
      .strict(),
  }),
  editorView: z.object({ sessionId: idSchema }).passthrough(),
  ptySpawn: z.object({
    terminalId: idSchema,
    workspaceId: idSchema,
    cwd: filesystemPathSchema,
    cols: z.number().int().positive().max(1000),
    rows: z.number().int().positive().max(1000),
  }),
  ptyWrite: z.object({
    terminalId: idSchema,
    // PTY input is opaque bytes — keep a generous cap but reject pathological
    // pastes that could overwhelm node-pty's write buffer.
    data: z.string().max(1_000_000),
  }),
  ptyResize: z.object({
    terminalId: idSchema,
    cols: z.number().int().positive().max(1000),
    rows: z.number().int().positive().max(1000),
  }),
  ptyKill: z.object({ terminalId: idSchema }),
  searchStart: z.object({
    caseSensitive: z.boolean(),
    exclude: z.string().max(1024),
    include: z.string().max(1024),
    maxResults: z.number().int().min(1).max(10_000),
    query: z.string().max(1024),
    rootPath: filesystemPathSchema,
    searchId: idSchema,
    useRegex: z.boolean(),
    wholeWord: z.boolean(),
  }),
  searchCancel: z.object({ searchId: idSchema }),
  // Accept #rgb / #rrggbb / #rrggbbaa hex colors — anything else risks being
  // interpreted by Electron's color parser in ways we have not vetted.
  hexColor: z
    .string()
    .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/),
} as const;

type Handler<T, R> = (event: IpcMainInvokeEvent, payload: T) => Promise<R> | R;
type HandlerArgs<T extends z.ZodTuple<z.ZodType[]>, R> = (
  event: IpcMainInvokeEvent,
  ...args: z.infer<T>
) => Promise<R> | R;

// Wraps ipcMain.handle so the schema runs before the handler ever sees the
// payload. Validation failures are surfaced as rejected invokes the renderer
// can catch — they never reach the handler with bad data.
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
