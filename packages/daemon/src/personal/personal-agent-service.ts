import crypto from "node:crypto";
import type { PersonalAgentRepository, PersonalAgentRow } from "@cocurdex/db";
import {
  type AgentRoleRecord,
  assertPersonalAgentRuntime,
  type CreatePersonalAgentPayload,
  comparePersonalAgents,
  type DuplicatePersonalAgentPayload,
  type EnsureDefaultPersonalAgentPayload,
  normalizePersonalAgentSoul,
  type PersonalAgentRecord,
  type PersonalAgentRolePayload,
  personalAgentRoleDraft,
  type SaveAgentRolePayload,
  type SessionRecord,
  type UpdatePersonalAgentPayload,
} from "@cocurdex/shared";
import { logDaemonDiagnostic } from "../diagnostics";

export interface PersonalAgentServiceDeps {
  repository: PersonalAgentRepository;
  getRole(id: string): Promise<AgentRoleRecord | null>;
  saveRole(payload: SaveAgentRolePayload): Promise<AgentRoleRecord>;
  deleteRole(id: string): Promise<void>;
  createHomeSession(role: AgentRoleRecord): Promise<SessionRecord>;
  removeSession(sessionId: string): Promise<void>;
  removeDependents(agentId: string): Promise<void>;
  applyRole(
    agentId: string,
    homeSessionId: string,
    role: AgentRoleRecord,
  ): Promise<void>;
  announceChanged(): void;
  now?: () => string;
}

function roleCopy(
  role: AgentRoleRecord,
  name: string,
): PersonalAgentRolePayload {
  const { id: _id, createdAt: _created, updatedAt: _updated, ...rest } = role;
  return { ...rest, name };
}

export class PersonalAgentService {
  private readonly now: () => string;
  private ensuringDefault: Promise<PersonalAgentRecord> | null = null;

  constructor(private readonly deps: PersonalAgentServiceDeps) {
    this.now = deps.now ?? (() => new Date().toISOString());
  }

  async list(): Promise<PersonalAgentRecord[]> {
    const records = await Promise.all(
      this.deps.repository.list().map((row) => this.toRecord(row)),
    );
    return records
      .filter((record): record is PersonalAgentRecord => record !== null)
      .sort(comparePersonalAgents);
  }

  async get(id: string) {
    const row = this.deps.repository.getById(id);
    return row ? this.toRecord(row) : null;
  }

  ownsRole(roleId: string) {
    return this.deps.repository.findByRole(roleId) !== null;
  }

  async roleSaved(role: AgentRoleRecord) {
    const row = this.deps.repository.findByRole(role.id);
    if (!row) return;
    await this.deps.applyRole(row.id, row.homeSessionId, role);
    this.deps.announceChanged();
  }

  async reconcileRoles() {
    for (const row of this.deps.repository.list()) {
      const role = await this.deps.getRole(row.roleId);
      if (!role) continue;
      try {
        await this.deps.applyRole(row.id, row.homeSessionId, role);
      } catch (error) {
        logDaemonDiagnostic("warn", "personal.reconcileFailed", {
          agentId: row.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  ownsHomeSession(sessionId: string) {
    return this.deps.repository.findByHomeSession(sessionId) !== null;
  }

  personaForSession(
    session: Pick<SessionRecord, "id" | "sessionKind" | "agentRoleId">,
  ): { id: string; roleId: string; soul: string | null } | null {
    if (session.sessionKind !== "personal") return null;
    const row =
      this.deps.repository.findByHomeSession(session.id) ??
      (session.agentRoleId
        ? this.deps.repository.findByRole(session.agentRoleId)
        : null);
    return row ? { id: row.id, roleId: row.roleId, soul: row.soul } : null;
  }

  ensureDefault(payload: EnsureDefaultPersonalAgentPayload) {
    this.ensuringDefault ??= this.createDefault(payload).finally(() => {
      this.ensuringDefault = null;
    });
    return this.ensuringDefault;
  }

  create(payload: CreatePersonalAgentPayload) {
    return this.insert(payload.role, payload.soul ?? null, false);
  }

  async update(payload: UpdatePersonalAgentPayload) {
    const row = this.require(payload.id);
    if (payload.role) {
      assertPersonalAgentRuntime(payload.role.agentId);
      await this.deps.saveRole({ ...payload.role, id: row.roleId });
    }
    const now = this.now();
    const pinnedAt = this.toggleStamp(row.pinnedAt, payload.pinned, now);
    const mutedAt = this.toggleStamp(row.mutedAt, payload.muted, now);
    this.deps.repository.upsert({
      ...row,
      soul:
        payload.soul === undefined
          ? row.soul
          : normalizePersonalAgentSoul(payload.soul),
      pinnedAt,
      mutedAt,
      sortOrder: payload.sortOrder ?? row.sortOrder,
      updatedAt: now,
    });
    this.deps.announceChanged();
    return this.requireRecord(row.id);
  }

  async duplicate(payload: DuplicatePersonalAgentPayload) {
    const row = this.require(payload.id);
    const role = await this.deps.getRole(row.roleId);
    if (!role) throw new Error(`Agent role ${row.roleId} was not found.`);
    return this.insert(roleCopy(role, payload.name), row.soul, false);
  }

  async delete(id: string) {
    const row = this.require(id);
    if (row.isDefault) {
      throw new Error("The default personal agent cannot be deleted");
    }
    await this.deps.removeDependents(row.id);
    this.deps.repository.delete(row.id);
    await this.deps.removeSession(row.homeSessionId);
    await this.deps.deleteRole(row.roleId);
    this.deps.announceChanged();
  }

  private async createDefault(payload: EnsureDefaultPersonalAgentPayload) {
    const existing = this.deps.repository.getDefault();
    const record = existing ? await this.toRecord(existing) : null;
    if (record) return record;
    return this.insert(
      {
        ...personalAgentRoleDraft(payload.name),
        description: payload.description ?? null,
      },
      null,
      true,
    );
  }

  private async insert(
    rolePayload: PersonalAgentRolePayload,
    soul: string | null,
    isDefault: boolean,
  ) {
    assertPersonalAgentRuntime(rolePayload.agentId);
    const role = await this.deps.saveRole({ ...rolePayload, id: undefined });
    let session: SessionRecord | null = null;
    try {
      session = await this.deps.createHomeSession(role);
      const now = this.now();
      const row: PersonalAgentRow = {
        id: crypto.randomUUID(),
        roleId: role.id,
        homeSessionId: session.id,
        soul: normalizePersonalAgentSoul(soul),
        isDefault,
        pinnedAt: null,
        mutedAt: null,
        sortOrder: this.nextSortOrder(),
        createdAt: now,
        updatedAt: now,
      };
      this.deps.repository.upsert(row);
      this.deps.announceChanged();
      return this.requireRecord(row.id);
    } catch (error) {
      if (session) await this.deps.removeSession(session.id);
      await this.deps.deleteRole(role.id);
      throw error;
    }
  }

  private nextSortOrder() {
    const orders = this.deps.repository.list().map((row) => row.sortOrder);
    return orders.length === 0 ? 0 : Math.max(...orders) + 1;
  }

  private toggleStamp(
    current: string | null,
    enabled: boolean | undefined,
    now: string,
  ) {
    if (enabled === undefined) return current;
    if (!enabled) return null;
    return current ?? now;
  }

  private require(id: string) {
    const row = this.deps.repository.getById(id);
    if (!row) throw new Error(`Personal agent ${id} was not found`);
    return row;
  }

  private async requireRecord(id: string) {
    const record = await this.get(id);
    if (!record) throw new Error(`Personal agent ${id} was not found`);
    return record;
  }

  private async toRecord(
    row: PersonalAgentRow,
  ): Promise<PersonalAgentRecord | null> {
    const role = await this.deps.getRole(row.roleId);
    if (!role) return null;
    return {
      id: row.id,
      role,
      homeSessionId: row.homeSessionId,
      soul: row.soul,
      isDefault: row.isDefault,
      pinnedAt: row.pinnedAt,
      mutedAt: row.mutedAt,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
