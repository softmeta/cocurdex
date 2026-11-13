export interface PersonalAgentRow {
  id: string;
  roleId: string;
  homeSessionId: string;
  soul: string | null;
  userAddress: string | null;
  isDefault: boolean;
  pinnedAt: string | null;
  mutedAt: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface PersonalAgentRepository {
  list(): PersonalAgentRow[];
  getById(id: string): PersonalAgentRow | null;
  findByRole(roleId: string): PersonalAgentRow | null;
  findByHomeSession(sessionId: string): PersonalAgentRow | null;
  getDefault(): PersonalAgentRow | null;
  upsert(agent: PersonalAgentRow): void;
  delete(id: string): void;
}
