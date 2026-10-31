import type {
  SkillAddRequest,
  SkillAgentLinkPayload,
  SkillCatalogAuditPayload,
  SkillRef,
  SkillResolveDuplicatePayload,
  SkillSourceInspectPayload,
  SkillSourceShowPayload,
  SkillUpdateSkipPayload,
} from "@cocurdex/shared";
import { requestDaemon } from "@/lib";

export const skillsApi = {
  list: (workspaceId: string | null) =>
    requestDaemon("skills.list", { workspaceId }),
  show: (ref: SkillRef) => requestDaemon("skills.show", ref),
  showPackSkill: (name: string) => requestDaemon("skills.pack.show", { name }),
  remove: (ref: SkillRef) => requestDaemon("skills.remove", ref),
  setAgentLink: (payload: SkillAgentLinkPayload) =>
    requestDaemon("skills.setAgentLink", payload),
  share: (ref: SkillRef) => requestDaemon("skills.share", ref),
  resolveDuplicate: (payload: SkillResolveDuplicatePayload) =>
    requestDaemon("skills.resolveDuplicate", payload),
  search: (query: string) => requestDaemon("skills.catalog.search", { query }),
  catalogSources: () => requestDaemon("skills.catalog.sources"),
  audit: (payload: SkillCatalogAuditPayload) =>
    requestDaemon("skills.catalog.audit", payload),
  inspectSource: (payload: SkillSourceInspectPayload) =>
    requestDaemon("skills.source.inspect", payload),
  showSourceSkill: (payload: SkillSourceShowPayload) =>
    requestDaemon("skills.source.show", payload),
  add: (request: SkillAddRequest) => requestDaemon("skills.add", request),
  checkUpdates: (workspaceId: string | null) =>
    requestDaemon("skills.updates.check", { workspaceId }),
  previewUpdate: (ref: SkillRef) =>
    requestDaemon("skills.updates.preview", ref),
  applyUpdates: (skills: SkillRef[]) =>
    requestDaemon("skills.updates.apply", { skills }),
  skipUpdate: (payload: SkillUpdateSkipPayload) =>
    requestDaemon("skills.updates.skip", payload),
};
