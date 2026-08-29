export interface WorkspaceFileRecord {
  kind: "directory" | "file";
  name: string;
  path: string;
  relativePath: string;
}
