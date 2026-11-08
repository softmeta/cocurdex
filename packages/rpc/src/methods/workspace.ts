import type {
  CommitMessageModelSelection,
  DocImage,
  DocImageFile,
  EditorViewRecord,
  GenerateGitCommitMessagePayload,
  GitBranchInfo,
  GitCommitInfo,
  GitCommitResult,
  GitPushResult,
  GitWorktreeInfo,
  HostDirectoryListing,
  ImportDocImagePayload,
  LocateDocImagePayload,
  ManagedWorktree,
  PdfAnnotationsOperation,
  PdfDocumentAnnotations,
  PtyKillPayload,
  PtyResizePayload,
  PtySpawnPayload,
  PtySpawnResult,
  PtyWritePayload,
  ResolvedCommitMessageModel,
  SearchDocumentResult,
  SearchDocumentsPayload,
  WorkspaceEntry,
  WorkspaceFileRecord,
  WorkspaceGitDiffQuery,
  WorkspaceGitDiffResult,
  WorkspaceGitStatusResult,
  WorkspaceRecord,
  WorkspaceSearchStartPayload,
  WorkspaceWorktreeEnvironment,
  WorktreeSettings,
  WorktreeSettingsSnapshot,
} from "@cocurdex/shared";

export type WorkspaceRequests = {
  "workspace.list": undefined;
  "workspace.listEntries": { rootPath: string };
  "workspace.listFiles": { rootPath: string };
  "workspace.listDirectory": { rootPath: string; relativePath: string };
  "workspace.save": { workspace: WorkspaceRecord };
  "workspace.delete": { workspaceId: string };
  "workspace.resolveOpenPath": { path: string; allowFile: boolean };
  "editorView.save": { view: EditorViewRecord };
  "workspace.worktreeEnvironment.get": { workspaceId: string };
  "workspace.worktreeEnvironment.save": WorkspaceWorktreeEnvironment;
  "workspace.runWorktreeSetup": {
    workspaceId: string;
    worktreePath: string;
  };
  "worktree.settings.get": undefined;
  "worktree.settings.save": WorktreeSettings;
  "worktree.list": undefined;
  "worktree.create": {
    workspaceId: string;
    branch?: string;
    startPoint?: string;
  };
  "worktree.remove": {
    workspaceId: string;
    worktreePath: string;
    workspaceRootPath?: string;
  };
  "file.readText": { filePath: string };
  "file.exists": { filePath: string };
  "fs.listDirectories": { path?: string };
  "terminal.spawn": PtySpawnPayload;
  "terminal.write": PtyWritePayload;
  "terminal.resize": PtyResizePayload;
  "terminal.kill": PtyKillPayload;
  "search.start": WorkspaceSearchStartPayload;
  "search.cancel": { searchId: string };
  "pdf.loadAnnotations": { filePath: string };
  "pdf.updateAnnotations": {
    filePath: string;
    operation: PdfAnnotationsOperation;
  };
  "image.import": ImportDocImagePayload;
  "image.locate": LocateDocImagePayload;
  "search.documents": SearchDocumentsPayload;
  "git.commitMessageModel.get": undefined;
  "git.commitMessageModel.set": {
    selection: CommitMessageModelSelection | null;
  };
  "git.commitMessageModel.resolve": undefined;
  "git.generateCommitMessage": GenerateGitCommitMessagePayload;
  "git.listBranches": { rootPath: string };
  "git.checkoutBranch": { rootPath: string; branch: string };
  "git.listWorktrees": { rootPath: string };
  "git.listCommits": { rootPath: string; limit?: number };
  "git.status": { rootPath: string };
  "git.diff": { rootPath: string; query?: WorkspaceGitDiffQuery };
  "git.stageFiles": { rootPath: string; filePaths: string[] };
  "git.unstageFiles": { rootPath: string; filePaths: string[] };
  "git.discardFiles": { rootPath: string; filePaths: string[] };
  "git.commit": { rootPath: string; message: string; includeUnstaged: boolean };
  "git.push": { rootPath: string };
};

export type WorkspaceResults = {
  "workspace.list": WorkspaceRecord[];
  "workspace.listEntries": WorkspaceEntry[];
  "workspace.listFiles": WorkspaceFileRecord[];
  "workspace.listDirectory": WorkspaceFileRecord[];
  "workspace.save": WorkspaceRecord;
  "workspace.delete": null;
  "workspace.resolveOpenPath": string | null;
  "editorView.save": null;
  "workspace.worktreeEnvironment.get": WorkspaceWorktreeEnvironment;
  "workspace.worktreeEnvironment.save": WorkspaceWorktreeEnvironment;
  "workspace.runWorktreeSetup": { ran: boolean };
  "worktree.settings.get": WorktreeSettingsSnapshot;
  "worktree.settings.save": WorktreeSettingsSnapshot;
  "worktree.list": ManagedWorktree[];
  "worktree.create": GitWorktreeInfo;
  "worktree.remove": { removed: boolean };
  "file.readText": string;
  "file.exists": boolean;
  "fs.listDirectories": HostDirectoryListing;
  "terminal.spawn": PtySpawnResult;
  "terminal.write": null;
  "terminal.resize": null;
  "terminal.kill": null;
  "search.start": null;
  "search.cancel": null;
  "pdf.loadAnnotations": PdfDocumentAnnotations;
  "pdf.updateAnnotations": PdfDocumentAnnotations;
  "image.import": DocImage;
  "image.locate": DocImageFile | null;
  "search.documents": SearchDocumentResult[];
  "git.commitMessageModel.get": CommitMessageModelSelection | null;
  "git.commitMessageModel.set": null;
  "git.commitMessageModel.resolve": ResolvedCommitMessageModel;
  "git.generateCommitMessage": string;
  "git.listBranches": GitBranchInfo[];
  "git.checkoutBranch": undefined;
  "git.listWorktrees": GitWorktreeInfo[];
  "git.listCommits": GitCommitInfo[];
  "git.status": WorkspaceGitStatusResult;
  "git.diff": WorkspaceGitDiffResult;
  "git.stageFiles": undefined;
  "git.unstageFiles": undefined;
  "git.discardFiles": undefined;
  "git.commit": GitCommitResult;
  "git.push": GitPushResult;
};
