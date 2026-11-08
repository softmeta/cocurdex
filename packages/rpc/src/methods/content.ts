import type {
  ApplyNoteDocUpdatePayload,
  CheckDeckPayload,
  CommentIssuePayload,
  CreateColumnPayload,
  CreateDeckDownloadPayload,
  CreateDeckPayload,
  CreateIssueLabelPayload,
  CreateIssuePayload,
  CreateNotePayload,
  CreateViewPayload,
  DeckDownload,
  DeckImage,
  DeckIssue,
  DeckRecord,
  DeckSummary,
  DeckWriteResult,
  DeleteColumnPayload,
  DeleteDeckPayload,
  DeleteIssueLabelPayload,
  DeleteIssuePayload,
  DeleteNotePayload,
  DeleteViewPayload,
  EditDeckPayload,
  EntityLink,
  EntityLinkCandidate,
  EntityLinkPayload,
  ExportDeckFilePayload,
  ExportDeckFileResult,
  GetDeckPayload,
  GetIssueDetailPayload,
  GetIssuePayload,
  GetNoteDocPayload,
  GetNotePayload,
  ImportDeckImagePayload,
  ImportDeckPayload,
  IssueDetail,
  IssueLabel,
  IssueRecord,
  IssueRelationPayload,
  LinkIssueSessionPayload,
  ListColumnsPayload,
  ListEntityLinksPayload,
  LoadViewPayload,
  MoveColumnPayload,
  MoveIssuePayload,
  MoveNotePayload,
  NoteBacklinksPayload,
  NoteDocSnapshot,
  NoteLink,
  NoteRecord,
  NoteSummary,
  NoteTag,
  PptxOutline,
  ReadPptxPayload,
  UpdateColumnPayload,
  UpdateDeckPayload,
  UpdateIssueLabelPayload,
  UpdateIssuePayload,
  UpdateNotePayload,
  UpdateViewPayload,
  ViewColumnRecord,
  ViewFull,
  ViewSummary,
} from "@cocurdex/shared";

export type ContentRequests = {
  "note.list": undefined;
  "note.get": GetNotePayload;
  "note.getDoc": GetNoteDocPayload;
  "note.applyDocUpdate": ApplyNoteDocUpdatePayload;
  "note.create": CreateNotePayload;
  "note.update": UpdateNotePayload;
  "note.move": MoveNotePayload;
  "note.delete": DeleteNotePayload;
  "note.listTags": { noteId?: string };
  "note.backlinks": NoteBacklinksPayload;
  "link.list": ListEntityLinksPayload;
  "link.candidates": undefined;
  "link.add": EntityLinkPayload;
  "link.remove": EntityLinkPayload;
  "deck.list": undefined;
  "deck.get": GetDeckPayload;
  "deck.create": CreateDeckPayload;
  "deck.update": UpdateDeckPayload;
  "deck.edit": EditDeckPayload;
  "deck.delete": DeleteDeckPayload;
  "deck.check": CheckDeckPayload;
  "deck.createDownload": CreateDeckDownloadPayload;
  "deck.exportFile": ExportDeckFilePayload;
  "deck.importImage": ImportDeckImagePayload;
  "deck.import": ImportDeckPayload;
  "deck.readPptx": ReadPptxPayload;
  "issue.listViews": undefined;
  "issue.loadView": LoadViewPayload;
  "issue.createView": CreateViewPayload;
  "issue.updateView": UpdateViewPayload;
  "issue.deleteView": DeleteViewPayload;
  "issue.listColumns": ListColumnsPayload;
  "issue.createColumn": CreateColumnPayload;
  "issue.updateColumn": UpdateColumnPayload;
  "issue.moveColumn": MoveColumnPayload;
  "issue.deleteColumn": DeleteColumnPayload;
  "issue.get": GetIssuePayload;
  "issue.create": CreateIssuePayload;
  "issue.update": UpdateIssuePayload;
  "issue.move": MoveIssuePayload;
  "issue.delete": DeleteIssuePayload;
  "issue.getDetail": GetIssueDetailPayload;
  "issue.listLabels": undefined;
  "issue.createLabel": CreateIssueLabelPayload;
  "issue.updateLabel": UpdateIssueLabelPayload;
  "issue.deleteLabel": DeleteIssueLabelPayload;
  "issue.addRelation": IssueRelationPayload;
  "issue.removeRelation": IssueRelationPayload;
  "issue.comment": CommentIssuePayload;
  "issue.linkSession": LinkIssueSessionPayload;
  "issue.listLinkedSessionIds": undefined;
};

export type ContentResults = {
  "note.list": NoteSummary[];
  "note.get": NoteRecord | null;
  "note.getDoc": NoteDocSnapshot | null;
  "note.applyDocUpdate": NoteRecord;
  "note.create": NoteRecord;
  "note.update": NoteRecord;
  "note.move": NoteRecord;
  "note.delete": null;
  "note.listTags": NoteTag[];
  "note.backlinks": NoteLink[];
  "link.list": EntityLink[];
  "link.candidates": EntityLinkCandidate[];
  "link.add": boolean;
  "link.remove": boolean;
  "deck.list": DeckSummary[];
  "deck.get": DeckRecord | null;
  "deck.create": DeckWriteResult;
  "deck.update": DeckWriteResult;
  "deck.edit": DeckWriteResult;
  "deck.delete": null;
  "deck.check": DeckIssue[];
  "deck.createDownload": DeckDownload;
  "deck.exportFile": ExportDeckFileResult;
  "deck.importImage": DeckImage;
  "deck.import": DeckWriteResult;
  "deck.readPptx": PptxOutline;
  "issue.listViews": ViewSummary[];
  "issue.loadView": ViewFull | null;
  "issue.createView": ViewSummary;
  "issue.updateView": ViewFull;
  "issue.deleteView": null;
  "issue.listColumns": ViewColumnRecord[];
  "issue.createColumn": ViewColumnRecord;
  "issue.updateColumn": ViewColumnRecord;
  "issue.moveColumn": ViewColumnRecord;
  "issue.deleteColumn": null;
  "issue.get": IssueRecord | null;
  "issue.create": IssueRecord;
  "issue.update": IssueRecord;
  "issue.move": IssueRecord;
  "issue.delete": null;
  "issue.getDetail": IssueDetail | null;
  "issue.listLabels": IssueLabel[];
  "issue.createLabel": IssueLabel;
  "issue.updateLabel": IssueLabel;
  "issue.deleteLabel": null;
  "issue.addRelation": IssueDetail;
  "issue.removeRelation": IssueDetail;
  "issue.comment": IssueDetail;
  "issue.linkSession": boolean;
  "issue.listLinkedSessionIds": string[];
};
