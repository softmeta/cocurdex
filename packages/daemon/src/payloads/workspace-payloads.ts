import type { WorkspaceWorktreeEnvironment } from "@cocurdex/shared";
import { z } from "zod";
import {
  boundedTextSchema,
  exact,
  filePathPayload,
  filesystemPathSchema,
  gitRelativePathSchema,
  idSchema,
  loose,
  noNullByte,
  type Payload,
  type PayloadSchemas,
  rootPathPayload,
} from "./primitives";

const gitRevisionSchema = z
  .string()
  .min(1)
  .max(256)
  .refine(noNullByte, "null byte");

const gitFiles = exact<Payload<"git.stageFiles">>()(
  z.object({
    rootPath: filesystemPathSchema,
    filePaths: z.array(gitRelativePathSchema),
  }),
);

const gitDiffQuerySchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("working") }),
  z.object({ mode: z.literal("unstaged") }),
  z.object({ mode: z.literal("staged") }),
  z.object({ mode: z.literal("commit"), commit: gitRevisionSchema }),
  z.object({
    mode: z.literal("branch"),
    source: gitRevisionSchema,
    target: gitRevisionSchema,
  }),
]);

const pdfMarkIdSchema = z.string().min(1).max(256);

const pdfBookmarkSchema = z.strictObject({
  id: pdfMarkIdSchema,
  pageNumber: z.number().int().positive().max(1_000_000),
  label: z.string().max(2000).optional(),
  scrollYRatio: z.number().finite().min(0).max(1).optional(),
  createdAt: z.number().finite(),
});

const pdfHighlightSchema = z.strictObject({
  id: pdfMarkIdSchema,
  pageNumber: z.number().int().positive().max(1_000_000),
  color: z.enum(["yellow", "green", "blue", "pink"]),
  selectedText: z.string().min(1).max(50_000),
  quads: z
    .array(
      z.strictObject({
        x1: z.number().finite(),
        y1: z.number().finite(),
        x2: z.number().finite(),
        y2: z.number().finite(),
      }),
    )
    .min(1)
    .max(500),
  createdAt: z.number().finite(),
});

const pdfOperationSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("addHighlight"),
    highlight: pdfHighlightSchema,
  }),
  z.strictObject({
    type: z.literal("removeHighlight"),
    highlightId: pdfMarkIdSchema,
  }),
  z.strictObject({
    type: z.literal("addBookmark"),
    bookmark: pdfBookmarkSchema,
  }),
  z.strictObject({
    type: z.literal("toggleBookmark"),
    bookmark: pdfBookmarkSchema,
  }),
  z.strictObject({
    type: z.literal("removeBookmark"),
    bookmarkId: pdfMarkIdSchema,
  }),
  z.strictObject({
    type: z.literal("merge"),
    annotations: z.strictObject({
      bookmarks: z.array(pdfBookmarkSchema).max(10_000),
      highlights: z.array(pdfHighlightSchema).max(50_000),
    }),
  }),
]);

const workspaceActionSchema = z.object({
  id: idSchema,
  name: z.string().max(200),
  script: z.string().max(100_000),
});

export const workspacePayloadSchemas = {
  "workspace.listEntries":
    exact<Payload<"workspace.listEntries">>()(rootPathPayload),
  "workspace.listFiles":
    exact<Payload<"workspace.listFiles">>()(rootPathPayload),
  "workspace.listDirectory": exact<Payload<"workspace.listDirectory">>()(
    z.object({
      rootPath: filesystemPathSchema,
      relativePath: gitRelativePathSchema,
    }),
  ),
  "workspace.save": loose<Payload<"workspace.save">>()(
    z.object({
      workspace: z.looseObject({
        id: idSchema,
        rootPaths: z.array(filesystemPathSchema).min(1),
      }),
    }),
  ),
  "workspace.delete": exact<Payload<"workspace.delete">>()(
    z.object({ workspaceId: idSchema }),
  ),
  "editorView.save": exact<Payload<"editorView.save">>()(
    z.object({
      view: z.object({
        sessionId: idSchema,
        openFiles: z.array(boundedTextSchema(4096)).max(500),
        activeFile: boundedTextSchema(4096).nullable(),
        selections: z
          .array(
            z.object({
              filePath: boundedTextSchema(4096),
              startLine: z.number().int().nonnegative(),
              endLine: z.number().int().nonnegative(),
            }),
          )
          .max(500),
      }),
    }),
  ),
  "workspace.worktreeEnvironment.get": exact<
    Payload<"workspace.worktreeEnvironment.get">
  >()(z.object({ workspaceId: idSchema })),
  "workspace.worktreeEnvironment.save": loose<WorkspaceWorktreeEnvironment>()(
    z.looseObject({
      workspaceId: idSchema,
      setupScript: z.string().max(100_000),
      cleanupScript: z.string().max(100_000),
      actions: z.array(workspaceActionSchema).max(50),
      updatedAt: z.string().max(64).nullable(),
    }),
  ),
  "worktree.settings.save": exact<Payload<"worktree.settings.save">>()(
    z.object({
      fetchBeforeCreate: z.boolean(),
      rootPath: boundedTextSchema(4096).nullable(),
    }),
  ),
  "worktree.create": exact<Payload<"worktree.create">>()(
    z.object({
      workspaceId: idSchema,
      branch: gitRevisionSchema.optional(),
      startPoint: gitRevisionSchema.optional(),
    }),
  ),
  "worktree.remove": exact<Payload<"worktree.remove">>()(
    z.object({
      workspaceId: idSchema,
      worktreePath: filesystemPathSchema,
      workspaceRootPath: filesystemPathSchema.optional(),
    }),
  ),
  "git.listBranches": exact<Payload<"git.listBranches">>()(rootPathPayload),
  "git.checkoutBranch": exact<Payload<"git.checkoutBranch">>()(
    z.object({
      rootPath: filesystemPathSchema,
      branch: gitRevisionSchema.refine(
        (value) => !value.startsWith("-"),
        "option-like branch",
      ),
    }),
  ),
  "git.listWorktrees": exact<Payload<"git.listWorktrees">>()(rootPathPayload),
  "git.listCommits": exact<Payload<"git.listCommits">>()(
    z.object({
      rootPath: filesystemPathSchema,
      limit: z.number().int().min(1).max(200).optional(),
    }),
  ),
  "git.status": exact<Payload<"git.status">>()(rootPathPayload),
  "git.diff": exact<Payload<"git.diff">>()(
    z.object({
      rootPath: filesystemPathSchema,
      query: gitDiffQuerySchema.optional(),
    }),
  ),
  "git.stageFiles": gitFiles,
  "git.unstageFiles": gitFiles,
  "git.discardFiles": gitFiles,
  "git.commit": exact<Payload<"git.commit">>()(
    z.object({
      rootPath: filesystemPathSchema,
      message: boundedTextSchema(10_000),
      includeUnstaged: z.boolean(),
    }),
  ),
  "git.generateCommitMessage": loose<Payload<"git.generateCommitMessage">>()(
    z.looseObject({
      workspaceRootPath: filesystemPathSchema,
      includeUnstaged: z.boolean(),
    }),
  ),
  "git.push": exact<Payload<"git.push">>()(rootPathPayload),
  "file.readText": exact<Payload<"file.readText">>()(filePathPayload),
  "file.exists": exact<Payload<"file.exists">>()(filePathPayload),
  "fs.listDirectories": exact<Payload<"fs.listDirectories">>()(
    z.object({ path: filesystemPathSchema.optional() }),
  ),
  "pdf.loadAnnotations":
    exact<Payload<"pdf.loadAnnotations">>()(filePathPayload),
  "pdf.updateAnnotations": exact<Payload<"pdf.updateAnnotations">>()(
    z.object({ filePath: filesystemPathSchema, operation: pdfOperationSchema }),
  ),
  "search.start": exact<Payload<"search.start">>()(
    z.object({
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
  ),
  "search.cancel": exact<Payload<"search.cancel">>()(
    z.object({ searchId: idSchema }),
  ),
  "settings.pendingChanges.ack": exact<
    Payload<"settings.pendingChanges.ack">
  >()(z.object({ id: idSchema })),
  "settings.values.report": exact<Payload<"settings.values.report">>()(
    z.object({ values: z.record(z.string().max(256), z.unknown()) }),
  ),
} satisfies PayloadSchemas;
