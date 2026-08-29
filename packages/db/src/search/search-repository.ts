import type {
  SearchDocumentResult,
  SearchDocumentsPayload,
} from "@cocurdex/shared";

export interface SearchRepository {
  search(payload: SearchDocumentsPayload): Promise<SearchDocumentResult[]>;
}
