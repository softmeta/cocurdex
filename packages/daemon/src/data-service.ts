import type { EventEmitter } from "node:events";
import type {
  CreateColumnPayload,
  CreateIssuePayload,
  CreateNotePayload,
  CreateViewPayload,
  DeleteColumnPayload,
  DeleteIssuePayload,
  DeleteNotePayload,
  DeleteViewPayload,
  GetIssuePayload,
  GetNotePayload,
  LoadViewPayload,
  MoveColumnPayload,
  MoveIssuePayload,
  MoveNotePayload,
  NoteBacklinksPayload,
  SearchDocumentsPayload,
  UpdateColumnPayload,
  UpdateIssuePayload,
  UpdateNotePayload,
  UpdateViewPayload,
} from "@cocurdex/shared";
import type { DaemonState } from "./state";

export class DaemonDataService {
  constructor(
    private readonly state: DaemonState,
    private readonly events: EventEmitter,
  ) {}

  listNotes() {
    return this.state.data.notes.list();
  }

  getNote(payload: GetNotePayload) {
    return this.state.data.notes.get(payload.id);
  }

  async createNote(payload: CreateNotePayload) {
    const note = await this.state.data.notes.create(payload);
    this.emitChanged("notes");
    return note;
  }

  async updateNote(payload: UpdateNotePayload) {
    const note = await this.state.data.notes.update(payload);
    this.emitChanged("notes");
    return note;
  }

  async moveNote(payload: MoveNotePayload) {
    const note = await this.state.data.notes.move(payload);
    this.emitChanged("notes");
    return note;
  }

  async deleteNote(payload: DeleteNotePayload) {
    await this.state.data.notes.delete(payload);
    this.emitChanged("notes");
  }

  listNoteTags(noteId?: string) {
    return this.state.data.notes.listTags(noteId);
  }

  listNoteBacklinks(payload: NoteBacklinksPayload) {
    return this.state.data.notes.listBacklinks(payload);
  }

  listIssueViews() {
    return this.state.data.issues.listViews();
  }

  loadIssueView(payload: LoadViewPayload) {
    return this.state.data.issues.loadView(payload);
  }

  async createIssueView(payload: CreateViewPayload) {
    const view = await this.state.data.issues.createView(payload);
    this.emitChanged("issues");
    return view;
  }

  async updateIssueView(payload: UpdateViewPayload) {
    const view = await this.state.data.issues.updateView(payload);
    this.emitChanged("issues");
    return view;
  }

  async deleteIssueView(payload: DeleteViewPayload) {
    await this.state.data.issues.deleteView(payload);
    this.emitChanged("issues");
  }

  async createIssueColumn(payload: CreateColumnPayload) {
    const column = await this.state.data.issues.createColumn(payload);
    this.emitChanged("issues");
    return column;
  }

  async updateIssueColumn(payload: UpdateColumnPayload) {
    const column = await this.state.data.issues.updateColumn(payload);
    this.emitChanged("issues");
    return column;
  }

  async moveIssueColumn(payload: MoveColumnPayload) {
    const column = await this.state.data.issues.moveColumn(payload);
    this.emitChanged("issues");
    return column;
  }

  async deleteIssueColumn(payload: DeleteColumnPayload) {
    await this.state.data.issues.deleteColumn(payload);
    this.emitChanged("issues");
  }

  getIssue(payload: GetIssuePayload) {
    return this.state.data.issues.getIssue(payload);
  }

  async createIssue(payload: CreateIssuePayload) {
    const issue = await this.state.data.issues.createIssue(payload);
    this.emitChanged("issues");
    return issue;
  }

  async updateIssue(payload: UpdateIssuePayload) {
    const issue = await this.state.data.issues.updateIssue(payload);
    this.emitChanged("issues");
    return issue;
  }

  async moveIssue(payload: MoveIssuePayload) {
    const issue = await this.state.data.issues.moveIssue(payload);
    this.emitChanged("issues");
    return issue;
  }

  async deleteIssue(payload: DeleteIssuePayload) {
    await this.state.data.issues.deleteIssue(payload);
    this.emitChanged("issues");
  }

  searchDocuments(payload: SearchDocumentsPayload) {
    return this.state.data.search.search(payload);
  }

  private emitChanged(area: "issues" | "notes"): void {
    this.events.emit("daemon.event", {
      type: "data.changed",
      areas: [area],
    });
  }
}
