import type {
  SkillAudit,
  SkillAuditFinding,
  SkillAuditRisk,
  SkillCatalogResult,
  SkillCatalogSource,
} from "@cocurdex/shared";

export interface SkillCatalogOptions {
  searchBase: string;
  auditBase: string;
}

export const DEFAULT_SKILL_CATALOG_OPTIONS: SkillCatalogOptions = {
  searchBase: "https://skills.sh",
  auditBase: "https://www.skills.sh",
};

export const OFFICIAL_SKILL_SOURCES: SkillCatalogSource[] = [
  {
    source: "anthropics/skills",
    title: "Anthropic",
    description: "Document, design, and development skills from Anthropic.",
    url: "https://github.com/anthropics/skills",
  },
  {
    source: "openai/skills",
    title: "OpenAI",
    description: "Curated skills for Codex from OpenAI.",
    url: "https://github.com/openai/skills",
  },
  {
    source: "vercel-labs/agent-skills",
    title: "Vercel",
    description: "React, Next.js, and deployment skills from Vercel.",
    url: "https://github.com/vercel-labs/agent-skills",
  },
];

const AUDIT_PROVIDERS = ["ath", "socket", "snyk"] as const;
const AUDIT_RISKS = new Set<SkillAuditRisk>([
  "safe",
  "low",
  "medium",
  "high",
  "critical",
]);
const MIN_QUERY_LENGTH = 2;
export const DEFAULT_SKILL_SEARCH_LIMIT = 30;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "cocurdex" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Skill catalog request failed with ${response.status}`);
  }
  return response.json();
}

export function parseSkillSearch(value: unknown): SkillCatalogResult[] {
  if (!isRecord(value) || !Array.isArray(value.skills)) {
    throw new Error("Skill catalog returned an unexpected document");
  }
  return value.skills.flatMap((raw): SkillCatalogResult[] => {
    if (!isRecord(raw)) {
      return [];
    }
    const source = readString(raw.source);
    const skillId = readString(raw.skillId);
    if (!source || !skillId || !/^[^/\s]+\/[^/\s]+$/.test(source)) {
      return [];
    }
    return [
      {
        id: readString(raw.id) ?? `${source}/${skillId}`,
        source,
        skillId,
        name: readString(raw.name) ?? skillId,
        installs: typeof raw.installs === "number" ? raw.installs : 0,
      },
    ];
  });
}

export function parseSkillAudit(value: unknown): SkillAudit[] {
  if (!isRecord(value)) {
    return [];
  }
  return Object.entries(value).flatMap(([skillId, raw]): SkillAudit[] => {
    if (!isRecord(raw)) {
      return [];
    }
    const findings = AUDIT_PROVIDERS.flatMap(
      (provider): SkillAuditFinding[] => {
        const result = raw[provider];
        if (!isRecord(result)) {
          return [];
        }
        const risk = readString(result.risk)?.toLowerCase() as SkillAuditRisk;
        if (!AUDIT_RISKS.has(risk)) {
          return [];
        }
        return [{ provider, risk, analyzedAt: readString(result.analyzedAt) }];
      },
    );
    return findings.length ? [{ skillId, findings }] : [];
  });
}

export class SkillCatalog {
  private readonly options: SkillCatalogOptions;

  constructor(options: Partial<SkillCatalogOptions> = {}) {
    this.options = { ...DEFAULT_SKILL_CATALOG_OPTIONS, ...options };
  }

  async search(query: string, limit: number): Promise<SkillCatalogResult[]> {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      return [];
    }
    const url = new URL("/api/search", this.options.searchBase);
    url.searchParams.set("q", trimmed);
    url.searchParams.set("limit", String(limit));
    return parseSkillSearch(await getJson(url.href));
  }

  async audit(source: string, skillIds: string[]): Promise<SkillAudit[]> {
    if (skillIds.length === 0) {
      return [];
    }
    const url = new URL("/tele/audit", this.options.auditBase);
    url.searchParams.set("source", source);
    url.searchParams.set("skills", skillIds.join(","));
    return parseSkillAudit(await getJson(url.href));
  }
}
