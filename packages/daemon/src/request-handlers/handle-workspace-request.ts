import type {
  DaemonMethod,
  DaemonRequest,
  DaemonResultByMethod,
} from "@cocurdex/rpc";
import { importDocImage, locateDocImage } from "../doc-images";
import {
  checkoutGitBranch,
  discardGitFiles,
  getWorkspaceDiff,
  getWorkspaceGitStatus,
  listGitBranches,
  listGitCommits,
  listGitWorktrees,
  pushGitBranch,
  stageGitFiles,
  unstageGitFiles,
} from "../git";
import type { DaemonRequestContext } from "../host-access/request-context";
import type { CocurdexDaemonService } from "../service";

const WORKSPACE_PREFIXES = [
  "workspace.",
  "worktree.",
  "editorView.",
  "file.",
  "fs.",
  "git.",
  "image.",
  "pdf.",
  "search.",
  "terminal.",
] as const;

type WorkspaceMethod = Extract<
  DaemonMethod,
  `${(typeof WORKSPACE_PREFIXES)[number]}${string}`
>;

export function isWorkspaceRequest(
  request: DaemonRequest,
): request is DaemonRequest<WorkspaceMethod> {
  return WORKSPACE_PREFIXES.some((prefix) => request.method.startsWith(prefix));
}

export async function handleWorkspaceRequest(
  service: CocurdexDaemonService,
  request: DaemonRequest<WorkspaceMethod>,
  context: DaemonRequestContext,
): Promise<DaemonResultByMethod[WorkspaceMethod]> {
  switch (request.method) {
    case "workspace.list":
      return service.workspaces.listWorkspaces();
    case "workspace.listEntries":
      return service.workspaces.listWorkspaceEntries(request.params.rootPath);
    case "workspace.listFiles":
      return service.workspaces.listWorkspaceFiles(request.params.rootPath);
    case "workspace.listDirectory":
      return service.workspaces.listWorkspaceDirectory(
        request.params.rootPath,
        request.params.relativePath,
      );
    case "workspace.save":
      return service.workspaces.saveWorkspace(request.params.workspace);
    case "workspace.delete":
      await service.workspaces.deleteWorkspace(request.params.workspaceId);
      return null;
    case "workspace.resolveOpenPath":
      return service.workspaces.resolveWorkspaceOpenPath(
        request.params.path,
        request.params.allowFile,
      );
    case "workspace.worktreeEnvironment.get":
      return service.workspaces.getWorktreeEnvironment(
        request.params.workspaceId,
      );
    case "workspace.worktreeEnvironment.save":
      return service.workspaces.saveWorktreeEnvironment(request.params);
    case "workspace.runWorktreeSetup":
      if (context.principal.kind !== "local") {
        await service.workspaces.resolveWorkspaceFilePath(
          request.params.worktreePath,
        );
      }
      return service.worktrees.runWorktreeSetup(request.params);
    case "worktree.settings.get":
      return service.worktrees.getWorktreeSettings();
    case "worktree.settings.save":
      return service.worktrees.saveWorktreeSettings(request.params);
    case "worktree.list":
      return service.worktrees.listManagedWorktrees();
    case "worktree.create":
      return service.worktrees.createWorktree(request.params);
    case "worktree.remove":
      if (context.principal.kind !== "local") {
        await service.workspaces.resolveWorkspaceFilePath(
          request.params.worktreePath,
        );
        if (request.params.workspaceRootPath) {
          await service.workspaces.resolveWorkspaceFilePath(
            request.params.workspaceRootPath,
          );
        }
      }
      return service.worktrees.removeWorktree(request.params);
    case "editorView.save":
      await service.state.saveEditorView(request.params.view);
      return null;
    case "file.readText":
      return service.workspaces.readWorkspaceTextFile(request.params.filePath);
    case "file.exists":
      return service.workspaces.workspaceFileExists(request.params.filePath);
    case "fs.listDirectories":
      return service.workspaces.listHostDirectories(request.params.path);
    case "image.import":
      await service.workspaces.assertClientPathAccess(
        context.principal,
        request.params.path,
        "file",
      );
      return importDocImage(service.attachments, request.params);
    case "image.locate":
      return locateDocImage(service.attachments, request.params);
    case "pdf.loadAnnotations":
      return service.pdfAnnotationsService.loadAnnotations(
        request.params.filePath,
      );
    case "pdf.updateAnnotations":
      return service.pdfAnnotationsService.updateAnnotations(
        request.params.filePath,
        request.params.operation,
      );
    case "search.start":
      await service.searchService.start(request.params);
      return null;
    case "search.cancel":
      service.searchService.cancel(request.params.searchId);
      return null;
    case "search.documents":
      return service.dataService.searchDocuments(request.params);
    case "terminal.spawn":
      return service.terminals.spawn(request.params);
    case "terminal.write":
      service.terminals.write(request.params.terminalId, request.params.data);
      return null;
    case "terminal.resize":
      service.terminals.resize(
        request.params.terminalId,
        request.params.cols,
        request.params.rows,
      );
      return null;
    case "terminal.kill":
      await service.terminals.kill(request.params.terminalId);
      return null;
    case "git.commitMessageModel.get":
      return service.commitMessageService.getModelSetting();
    case "git.commitMessageModel.set":
      return service.commitMessageService.setModelSetting(
        request.params.selection,
      );
    case "git.commitMessageModel.resolve":
      return service.commitMessageService.resolveModel();
    case "git.generateCommitMessage":
      return service.commitMessageService.generate(request.params);
    case "git.listBranches":
      await service.workspaces.watchWorkspace(request.params.rootPath);
      return listGitBranches(request.params.rootPath);
    case "git.checkoutBranch":
      await checkoutGitBranch(request.params.rootPath, request.params.branch);
      return undefined;
    case "git.listWorktrees":
      await service.workspaces.watchWorkspace(request.params.rootPath);
      return listGitWorktrees(request.params.rootPath);
    case "git.listCommits":
      await service.workspaces.watchWorkspace(request.params.rootPath);
      return listGitCommits(request.params.rootPath, {
        limit: request.params.limit,
      });
    case "git.status":
      await service.workspaces.watchWorkspace(request.params.rootPath);
      return getWorkspaceGitStatus(request.params.rootPath);
    case "git.diff":
      await service.workspaces.watchWorkspace(request.params.rootPath);
      return getWorkspaceDiff(request.params.rootPath, request.params.query);
    case "git.stageFiles":
      await stageGitFiles(request.params.rootPath, request.params.filePaths);
      return undefined;
    case "git.unstageFiles":
      await unstageGitFiles(request.params.rootPath, request.params.filePaths);
      return undefined;
    case "git.discardFiles":
      await discardGitFiles(request.params.rootPath, request.params.filePaths);
      return undefined;
    case "git.commit":
      return service.workspaces.commitWorkspaceChanges(request.params);
    case "git.push":
      return pushGitBranch(request.params.rootPath);
  }
}
