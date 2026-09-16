import type {
  TeamMemberRecord,
  TeamRecord,
  TeamSnapshot,
} from "@cocurdex/shared";

export interface TeamRepository {
  getById(teamId: string): Promise<TeamSnapshot | null>;
  getByLead(leadSessionId: string): Promise<TeamSnapshot | null>;
  findBySession(sessionId: string): Promise<TeamSnapshot | null>;
  saveTeam(team: TeamRecord): Promise<void>;
  saveMember(member: TeamMemberRecord): Promise<void>;
}
