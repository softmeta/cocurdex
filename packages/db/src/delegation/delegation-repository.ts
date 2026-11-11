import type { RemoteWorkSnapshot } from "@cocurdex/shared";

export interface DelegationRow {
  workSessionId: string;
  personaId: string;
  requesterSessionId: string;
  teamTemplateId: string | null;
  createdAt: string;
  remote: RemoteWorkSnapshot | null;
}

export interface DelegationRepository {
  insert(row: DelegationRow): void;
  get(workSessionId: string): DelegationRow | null;
  listByPersona(personaId: string, limit: number): DelegationRow[];
  list(): DelegationRow[];
  listRemote(): DelegationRow[];
  deleteByRemoteHost(hostId: string): void;
  delete(workSessionId: string): void;
  deleteByPersona(personaId: string): void;
}
