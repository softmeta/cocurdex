import type {
  AgentAdapter,
  AgentSession,
  CreateAgentSessionPayload,
  ListSlashCommandsPayload,
} from "@cocurdex/agent-core";
import { getAgentDescriptor } from "@cocurdex/agent-core";
import type { AgentEvent, AgentSlashCommand } from "@cocurdex/shared";
import { hashLogValue } from "@cocurdex/shared";
import {
  DefaultResourceLoader,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { logAdapterDiagnostic } from "../diagnostics";
import {
  forkDurableProviderSession,
  readDurableConversation,
} from "../pi-durable/durable-conversations";
import { createDurablePiSession } from "../pi-durable/durable-session";
import { getPiAgentDir } from "./pi-paths";
import { forkPiProviderSession } from "./pi-session-fork";
import {
  getPiSkillRootSnapshots,
  logPiSkillDiagnostic,
  resolveAdditionalSkillPaths,
} from "./pi-skill-diagnostics";

const PI_PROVIDER_VERSION = "pi-sdk";

async function listPiSlashCommands(
  payload: ListSlashCommandsPayload,
): Promise<AgentSlashCommand[]> {
  const additionalSkillPaths = resolveAdditionalSkillPaths(
    payload.workspaceRootPath,
  );

  const agentDir = getPiAgentDir(payload.userDataPath);
  const loader = new DefaultResourceLoader({
    cwd: payload.workspaceRootPath,
    agentDir,
    additionalSkillPaths,
    noExtensions: true,
  });

  try {
    await loader.reload();
  } catch (error) {
    logPiSkillDiagnostic("pi.skills.reloadFailed", {
      agentDirHash: hashLogValue(agentDir),
      error: error instanceof Error ? error.message : String(error),
      roots: getPiSkillRootSnapshots({
        agentDir,
        workspaceRootPath: payload.workspaceRootPath,
      }),
      workspaceHash: hashLogValue(payload.workspaceRootPath),
    });
    logAdapterDiagnostic("info", "pi: listSlashCommands failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return [];
  }

  const skillResult = loader.getSkills();
  logPiSkillDiagnostic("pi.skills.scanned", {
    agentDirHash: hashLogValue(agentDir),
    roots: getPiSkillRootSnapshots({
      agentDir,
      workspaceRootPath: payload.workspaceRootPath,
    }),
    skillCount: skillResult.skills.length,
    workspaceHash: hashLogValue(payload.workspaceRootPath),
  });
  logAdapterDiagnostic("info", "pi: listSlashCommands scanned", {
    agentDirHash: hashLogValue(agentDir),
    workspaceHash: hashLogValue(payload.workspaceRootPath),
  });

  const skills: AgentSlashCommand[] = skillResult.skills.map((skill) => ({
    name: skill.name,
    description: skill.description,
    invocation: `/skill:${skill.name} `,
    source: "skill",
  }));

  return skills;
}

export function createPiSdkAdapter(): AgentAdapter {
  const descriptor = getAgentDescriptor("pi");
  return {
    getDescriptor() {
      return descriptor;
    },
    runsInProcess: true,
    listSlashCommands(payload: ListSlashCommandsPayload) {
      return listPiSlashCommands(payload);
    },
    async forkProviderSession(payload) {
      const durable = readDurableConversation(payload.source.providerStateJson);
      if (durable) return forkDurableProviderSession(payload, durable);
      return forkPiProviderSession(
        payload,
        SessionManager,
        PI_PROVIDER_VERSION,
      );
    },
    createSession(
      payload: CreateAgentSessionPayload,
      onEvent: (event: AgentEvent) => void,
    ): AgentSession {
      return createDurablePiSession(payload, onEvent);
    },
  };
}
