import { statSync } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type {
  CocurdexDaemonEvent,
  GitCommitResult,
  WorkspaceRecord,
  WorkspaceWorktreeEnvironment,
} from "@cocurdex/shared";
import {
  emptyWorktreeEnvironment,
  type HostPrincipal,
  type MessageAttachment,
  normalizeWorkspaceActions,
  normalizeWorkspaceRootPaths,
  principalHasScope,
  workspacePathsEqual,
} from "@cocurdex/shared";
import { resolveAuthorizedPdfReadPath } from "@cocurdex/shared/node";
import type { DaemonAttachmentStore } from "./attachment-store";
import type { DaemonCommitMessageService } from "./commit-message";
import { listHostDirectories } from "./fs-browse";
import { commitGitChanges } from "./git";
import { createWorkspaceScanPolicy } from "./scan-roots";
import type { DaemonState } from "./state";
import { resolveWorkspaceOpenPath } from "./workspace-open-path";
import {
  fileExists,
  listWorkspaceDirectory,
  listWorkspaceEntries,
  listWorkspaceFiles,
  readTextFile,
} from "./workspace-service";
import { WorkspaceWatchService } from "./workspace-watch";

export interface WorkspaceHostDeps {
  state: DaemonState;
  userDataPath: string;
  attachments: DaemonAttachmentStore;
  commitMessages: DaemonCommitMessageService;
  emit: (event: CocurdexDaemonEvent) => void;
}

function isExistingDirectory(directoryPath: string) {
  try {
    return statSync(directoryPath).isDirectory();
  } catch {
    return false;
  }
}

export function withMissingRootPaths(workspace: WorkspaceRecord) {
  return {
    ...workspace,
    missingRootPaths: workspace.rootPaths.filter(
      (rootPath) => !isExistingDirectory(rootPath),
    ),
  };
}

export class WorkspaceHost {
  readonly scanPolicy: ReturnType<typeof createWorkspaceScanPolicy>;
  private readonly watch: WorkspaceWatchService;
  private readonly deps: WorkspaceHostDeps;

  constructor(deps: WorkspaceHostDeps) {
    this.deps = deps;
    this.scanPolicy = createWorkspaceScanPolicy(deps.state);
    this.watch = new WorkspaceWatchService((event) => deps.emit(event));
  }

  close() {
    return this.watch.close();
  }

  async listWorkspaces() {
    const workspaces = await this.deps.state.listWorkspaces();
    return workspaces.map(withMissingRootPaths);
  }

  async listWorkspaceRootPaths() {
    const workspaces = await this.deps.state.listWorkspaces();
    return workspaces.flatMap((workspace) => workspace.rootPaths);
  }

  async listWorkspaceEntries(rootPath: string) {
    if (!(await this.scanPolicy.canScan(rootPath))) {
      return [];
    }
    return listWorkspaceEntries(rootPath);
  }

  async listWorkspaceFiles(rootPath: string) {
    if (!(await this.scanPolicy.canScan(rootPath))) {
      return [];
    }
    await this.watch.ensure(rootPath);
    return listWorkspaceFiles(rootPath);
  }

  async listWorkspaceDirectory(rootPath: string, relativePath: string) {
    if (!(await this.scanPolicy.canScan(rootPath))) {
      return [];
    }
    return listWorkspaceDirectory(rootPath, relativePath);
  }

  async watchWorkspace(rootPath: string) {
    if (await this.scanPolicy.canScan(rootPath)) {
      await this.watch.ensure(rootPath);
    }
  }

  async saveWorkspace(workspace: WorkspaceRecord) {
    const rootPaths = normalizeWorkspaceRootPaths(workspace.rootPaths);
    if (rootPaths.length === 0) {
      throw new Error("Workspace requires at least one source folder");
    }
    const home = homedir();
    if (rootPaths.some((rootPath) => workspacePathsEqual(rootPath, home))) {
      throw new Error(
        "The home directory cannot be a workspace folder; choose a subfolder",
      );
    }
    if (rootPaths.some((rootPath) => path.parse(rootPath).root === rootPath)) {
      throw new Error(
        "A filesystem root cannot be a workspace folder; choose a subfolder",
      );
    }
    const others = (await this.deps.state.listWorkspaces()).filter(
      (candidate) => candidate.id !== workspace.id,
    );
    const primaryRootPath = rootPaths[0];
    const conflict = others.find((candidate) =>
      workspacePathsEqual(candidate.rootPaths[0], primaryRootPath),
    );
    if (conflict) {
      throw new Error(
        `Folder ${primaryRootPath} is already the primary folder of workspace "${conflict.name}"`,
      );
    }
    const normalized = { ...workspace, rootPaths };
    try {
      await this.deps.state.saveWorkspace(normalized);
    } finally {
      this.scanPolicy.invalidate();
    }
    return withMissingRootPaths(normalized);
  }

  async ensureFormWorkspace(id: string, name: string) {
    const rootPath = path.join(this.deps.userDataPath, id);
    await mkdir(rootPath, { recursive: true });
    const existing = (await this.deps.state.listWorkspaces()).find(
      (workspace) => workspace.id === id,
    );
    if (existing && workspacePathsEqual(existing.rootPaths[0] ?? "", rootPath))
      return;
    const now = new Date().toISOString();
    await this.deps.state.saveWorkspace({
      id,
      name,
      rootPaths: [rootPath],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lastOpenedAt: existing?.lastOpenedAt ?? now,
      sortOrder: existing?.sortOrder ?? 0,
    });
    this.scanPolicy.invalidate();
  }

  async deleteWorkspace(workspaceId: string) {
    await this.deps.state.deleteWorkspace(workspaceId);
    this.scanPolicy.invalidate();
  }

  async resolveWorkspaceOpenPath(inputPath: string, allowFile: boolean) {
    return resolveWorkspaceOpenPath(
      inputPath,
      await this.listWorkspaceRootPaths(),
      { allowFile },
    );
  }

  async readWorkspaceTextFile(filePath: string) {
    if (!(await this.scanPolicy.canAccessFile(filePath))) {
      throw new Error(
        `File is outside every registered workspace (path=${filePath})`,
      );
    }
    return readTextFile(filePath);
  }

  async workspaceFileExists(filePath: string) {
    if (!(await this.scanPolicy.canAccessFile(filePath))) {
      return false;
    }
    return fileExists(filePath);
  }

  async resolveWorkspaceFilePath(filePath: string) {
    const resolvedPath = path.resolve(filePath);
    if (!(await this.scanPolicy.canAccessFile(resolvedPath))) {
      throw new Error(
        `File is outside every registered workspace (path=${resolvedPath})`,
      );
    }
    return resolvedPath;
  }

  async assertClientPathAccess(
    principal: HostPrincipal,
    filePath: string,
    target: "file" | "outputFile",
  ) {
    if (principal.kind === "local") return;
    const scope = target === "file" ? "files.read" : "files.write";
    if (!principalHasScope(principal, scope)) {
      throw new Error(`This device is missing the ${scope} scope`);
    }
    const checked =
      target === "outputFile" ? path.dirname(path.resolve(filePath)) : filePath;
    const exists =
      target === "file" ||
      (await stat(checked).then(
        (info) => info.isDirectory(),
        () => false,
      ));
    if (exists && (await this.scanPolicy.canAccessFile(checked))) return;
    throw new Error(
      `Path is outside every registered workspace (path=${filePath})`,
    );
  }

  async assertClientAttachmentsAccess(
    principal: HostPrincipal,
    attachments: readonly MessageAttachment[] | undefined,
  ) {
    if (principal.kind === "local") return;
    for (const attachment of attachments ?? []) {
      if (attachment.kind === "context-item") continue;
      if (attachment.kind === "image" || attachment.kind === "document") {
        if (this.deps.attachments.isStoredFile(attachment)) continue;
        throw new Error(
          `Attachment is not a stored upload (path=${attachment.filePath})`,
        );
      }
      const filePath =
        attachment.kind === "context-folder"
          ? attachment.folderPath
          : attachment.filePath;
      await this.assertClientPathAccess(principal, filePath, "file");
    }
  }

  async resolvePdfPath(filePath: string) {
    const attachmentPath =
      await this.deps.attachments.resolveStoredDocumentPath(filePath);
    if (attachmentPath) return attachmentPath;
    return resolveAuthorizedPdfReadPath(
      filePath,
      await this.listWorkspaceRootPaths(),
    );
  }

  listHostDirectories(directoryPath?: string) {
    return listHostDirectories(directoryPath);
  }

  async commitWorkspaceChanges(input: {
    rootPath: string;
    message: string;
    includeUnstaged: boolean;
  }): Promise<GitCommitResult> {
    const generatedMessage = input.message.trim().length === 0;
    const message = generatedMessage
      ? await this.deps.commitMessages.generate({
          workspaceRootPath: input.rootPath,
          includeUnstaged: input.includeUnstaged,
        })
      : input.message;
    const result = await commitGitChanges(input.rootPath, {
      message,
      includeUnstaged: input.includeUnstaged,
    });
    return { ...result, generatedMessage };
  }

  async getWorktreeEnvironment(
    workspaceId: string,
  ): Promise<WorkspaceWorktreeEnvironment> {
    const stored = await this.deps.state.getWorktreeEnvironment(workspaceId);
    return stored ?? emptyWorktreeEnvironment(workspaceId);
  }

  async saveWorktreeEnvironment(
    environment: WorkspaceWorktreeEnvironment,
  ): Promise<WorkspaceWorktreeEnvironment> {
    await this.requireWorkspace(environment.workspaceId);
    const next: WorkspaceWorktreeEnvironment = {
      workspaceId: environment.workspaceId,
      setupScript: environment.setupScript,
      cleanupScript: environment.cleanupScript,
      actions: normalizeWorkspaceActions(environment.actions),
      updatedAt: new Date().toISOString(),
      proposal: null,
    };
    await this.deps.state.saveWorktreeEnvironment(next);
    return next;
  }

  async proposeWorktreeEnvironment(input: {
    workspaceId: string;
    setupScript: string;
    cleanupScript: string;
    rationale?: string | null;
  }): Promise<WorkspaceWorktreeEnvironment> {
    await this.requireWorkspace(input.workspaceId);
    await this.deps.state.saveWorktreeEnvironmentProposal(input.workspaceId, {
      setupScript: input.setupScript,
      cleanupScript: input.cleanupScript,
      rationale: input.rationale?.trim() ? input.rationale.trim() : null,
      proposedAt: new Date().toISOString(),
    });
    this.deps.emit({ type: "data.changed", areas: ["workspace"] });
    return this.getWorktreeEnvironment(input.workspaceId);
  }

  private async requireWorkspace(workspaceId: string) {
    const workspace = (await this.deps.state.listWorkspaces()).find(
      (candidate) => candidate.id === workspaceId,
    );
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }
    return workspace;
  }
}
