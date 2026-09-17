import type {
  TeamMemberRecord,
  TeamRecord,
  TeamSnapshot,
  TeamTaskLinks,
} from "@cocurdex/shared";

export interface TeamRepository {
  getById(teamId: string): Promise<TeamSnapshot | null>;
  getByLead(leadSessionId: string): Promise<TeamSnapshot | null>;
  findBySession(sessionId: string): Promise<TeamSnapshot | null>;
  saveTeam(team: TeamRecord): Promise<void>;
  saveMember(member: TeamMemberRecord): Promise<void>;
  listTaskLinks(teamId: string): Promise<TeamTaskLinks[]>;
  saveTaskLinks(links: TeamTaskLinks): Promise<void>;
}
