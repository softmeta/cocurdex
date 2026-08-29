export type SearchDocumentKind = "note" | "issue";

export interface SearchDocumentsPayload {
  query: string;
  kinds?: SearchDocumentKind[];
  workspaceId?: string | null;
  limit?: number;
}

export interface SearchDocumentResult {
  id: string;
  kind: SearchDocumentKind;
  title: string;
  excerpt: string;
  rank: number;
}
