export interface DelegationRow {
  workSessionId: string;
  personaId: string;
  requesterSessionId: string;
  teamTemplateId: string | null;
  createdAt: string;
}

export interface DelegationRepository {
  insert(row: DelegationRow): void;
  get(workSessionId: string): DelegationRow | null;
  listByPersona(personaId: string, limit: number): DelegationRow[];
  list(): DelegationRow[];
  delete(workSessionId: string): void;
  deleteByPersona(personaId: string): void;
}
