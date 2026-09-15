export interface WorkspaceEntry {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: WorkspaceEntry[];
}

export interface WorkspaceFileRecord {
  kind: "directory" | "file";
  name: string;
  path: string;
  relativePath: string;
}

export interface McpConfigFile {
  path: string;
  content: string;
}
