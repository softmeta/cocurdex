import type {
  TeamMemberRecord,
  TeamRecord,
  TeamSnapshot,
  TeamTaskRecord,
} from "@cocurdex/shared";

export interface TeamRepository {
  getById(teamId: string): Promise<TeamSnapshot | null>;
  getByLead(leadSessionId: string): Promise<TeamSnapshot | null>;
  findBySession(sessionId: string): Promise<TeamSnapshot | null>;
  saveTeam(team: TeamRecord): Promise<void>;
  saveMember(member: TeamMemberRecord): Promise<void>;
  failActiveMembers(): Promise<void>;
  listTasks(teamId: string): Promise<TeamTaskRecord[]>;
  insertTask(task: TeamTaskRecord): Promise<void>;
  updateTask(task: TeamTaskRecord, expectedRevision: number): Promise<boolean>;
}
