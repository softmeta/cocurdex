import type {
  DaemonMethod,
  DaemonRequest,
  DaemonResultByMethod,
} from "@cocurdex/rpc";
import type { DaemonRequestContext } from "../host-access/request-context";
import type { CocurdexDaemonService } from "../service";
import { DEFAULT_SKILL_SEARCH_LIMIT } from "./skill-catalog";

export type SkillMethod = Extract<DaemonMethod, `skills.${string}`>;

export function isSkillRequest(
  request: DaemonRequest,
): request is DaemonRequest<SkillMethod> {
  return request.method.startsWith("skills.");
}

async function assertSourceAccess(
  service: CocurdexDaemonService,
  context: DaemonRequestContext,
  source: string,
) {
  const parsed = service.skillLibrary.sourceKind(source);
  if (parsed.kind === "local") {
    await service.assertClientPathAccess(
      context.principal,
      parsed.path,
      "file",
    );
  }
}

export async function handleSkillRequest(
  service: CocurdexDaemonService,
  request: DaemonRequest<SkillMethod>,
  context: DaemonRequestContext,
): Promise<DaemonResultByMethod[SkillMethod]> {
  const skills = service.skillLibrary;
  switch (request.method) {
    case "skills.pack.getStatus":
      return service.skillsService.getStatus(request.params);
    case "skills.pack.install":
      return service.skillsService.install(request.params);
    case "skills.pack.remove":
      return service.skillsService.remove(request.params);
    case "skills.pack.show":
      return service.skillsService.show(request.params);
    case "skills.list":
      return skills.list(request.params.workspaceId);
    case "skills.show":
      return skills.show(request.params);
    case "skills.remove":
      return skills.remove(request.params);
    case "skills.setAgentLink":
      return skills.setAgentLink(
        request.params,
        request.params.agent,
        request.params.enabled,
      );
    case "skills.share":
      return skills.share(request.params);
    case "skills.resolveDuplicate":
      return skills.resolveDuplicate(request.params, request.params.keepPath);
    case "skills.catalog.search":
      return skills.searchCatalog(
        request.params.query,
        request.params.limit ?? DEFAULT_SKILL_SEARCH_LIMIT,
      );
    case "skills.catalog.sources":
      return skills.catalogSources();
    case "skills.catalog.audit":
      return skills.auditCatalog(
        request.params.source,
        request.params.skillIds,
      );
    case "skills.source.inspect":
      await assertSourceAccess(service, context, request.params.source);
      return skills.inspectSource(request.params.source, request.params.ref);
    case "skills.source.show":
      await assertSourceAccess(service, context, request.params.source);
      return skills.showSourceSkill(
        request.params.source,
        request.params.skillPath,
        request.params.ref,
      );
    case "skills.add":
      await assertSourceAccess(service, context, request.params.source);
      return skills.add(request.params);
    case "skills.updates.check":
      return skills.checkUpdates(request.params.workspaceId);
    case "skills.updates.preview":
      return skills.previewUpdate(request.params);
    case "skills.updates.apply":
      return skills.applyUpdates(request.params.skills);
    case "skills.updates.skip":
      return skills.skipUpdate(request.params, request.params.latestCommit);
  }
}
