import {
  isSupportedLocale,
  type MessageOrigin,
  matchSupportedLocale,
  type SupportedLocale,
} from "@cocurdex/shared";
import {
  isValidTimeZone,
  type RoutineService,
  zonedDayStart,
} from "../routines";
import type { AgentRuntimeManager } from "../runtime";
import type { DaemonState } from "../state";
import { briefMarkdown } from "./brief-text";
import { buildBrief } from "./build-brief";
import { buildInbox } from "./build-inbox";

const BRIEF_POSTED_SETTING_KEY = "personal.briefPostedAt";
const BRIEF_LOCALE_SETTING_KEY = "personal.briefLocale";

export interface InboxServiceOptions {
  state: DaemonState;
  runtime: Pick<AgentRuntimeManager, "getPendingInteractions">;
  routines: () => Pick<
    RoutineService,
    "list" | "latestRuns" | "runsFinishedSince"
  >;
  announceSessionsChanged: () => void;
}

export class InboxService {
  constructor(private readonly options: InboxServiceOptions) {}

  async list() {
    const { state, runtime } = this.options;
    const routines = this.options.routines();
    const pending = runtime.getPendingInteractions();
    return buildInbox({
      sessions: await state.listSessions(),
      delegatedSessionIds: new Set(
        state.data.delegations.list().map((row) => row.workSessionId),
      ),
      attention: await state.sessionAttention.list(),
      pending: {
        permissions: pending.permissions.map((request) => ({
          sessionId: request.sessionId,
          detail: request.title,
          createdAt: request.createdAt,
        })),
        questions: pending.questions.map((question) => ({
          sessionId: question.sessionId,
          detail: question.question,
          createdAt: question.createdAt,
        })),
        planApprovals: pending.planApprovals.map((approval) => ({
          sessionId: approval.sessionId,
          detail: null,
          createdAt: approval.createdAt,
        })),
      },
      routines: routines.list(),
      latestRuns: routines.latestRuns(),
    });
  }

  async readItem(id: string) {
    const item = (await this.list()).find((entry) => entry.id === id);
    if (!item?.sessionId) return;
    await this.options.state.sessionAttention.update({
      sessionId: item.sessionId,
      action: "visited",
      at: new Date().toISOString(),
    });
  }

  async getBrief(timeZone?: string | null) {
    const zone = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!isValidTimeZone(zone)) throw new Error(`Unknown time zone: ${zone}`);
    const { day, start } = zonedDayStart(new Date(), zone);
    const routines = this.options.routines();
    return buildBrief({
      day,
      timeZone: zone,
      inbox: await this.list(),
      routines: routines.list(),
      runsToday: routines.runsFinishedSince(start.toISOString()),
    });
  }

  async postBrief(payload: {
    timeZone?: string | null;
    locale?: SupportedLocale | null;
  }) {
    const { state } = this.options;
    const brief = await this.getBrief(payload.timeZone);
    const locale = await this.briefLocale(payload.locale ?? null);
    if (!brief) return null;
    const posted = await state.getAppSetting(BRIEF_POSTED_SETTING_KEY);
    if (posted && JSON.parse(posted) >= brief.updatedAt) return null;
    const message = await this.postToHomeThread(
      null,
      briefMarkdown(brief, locale),
      { kind: "brief", day: brief.day },
    );
    if (message) {
      await state.setAppSetting(
        BRIEF_POSTED_SETTING_KEY,
        JSON.stringify(brief.updatedAt),
      );
    }
    return message;
  }

  async postToHomeThread(
    agentId: string | null,
    content: string,
    origin: MessageOrigin,
  ) {
    const { personalAgents } = this.options.state.data;
    const persona = agentId
      ? personalAgents.getById(agentId)
      : personalAgents.getDefault();
    if (!persona) return null;
    return this.postToSession(persona.homeSessionId, content, origin);
  }

  async postToSession(
    sessionId: string,
    content: string,
    origin: MessageOrigin,
  ) {
    const message = await this.options.state.appendMessage({
      id: crypto.randomUUID(),
      sessionId,
      role: "assistant",
      kind: "response",
      content,
      attachments: [],
      createdAt: new Date().toISOString(),
      origin,
    });
    this.options.announceSessionsChanged();
    return message;
  }

  private async briefLocale(requested: SupportedLocale | null) {
    const { state } = this.options;
    if (requested) {
      await state.setAppSetting(
        BRIEF_LOCALE_SETTING_KEY,
        JSON.stringify(requested),
      );
      return requested;
    }
    const stored = await state.getAppSetting(BRIEF_LOCALE_SETTING_KEY);
    const parsed = stored ? (JSON.parse(stored) as string) : null;
    if (isSupportedLocale(parsed)) return parsed;
    return matchSupportedLocale([
      Intl.DateTimeFormat().resolvedOptions().locale,
    ]);
  }
}
